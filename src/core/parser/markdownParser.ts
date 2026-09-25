/**
 * Canonical Markdown Question Parser v2.0 for takemock.
 * Adheres strictly to docs/markdown_format_spec_v2.md
 */

import YAML from 'yaml';
import type { QuestionModel, QuestionOption, QuestionType, ValidationDiagnostic } from '@/types/question';
import { questionRegistry } from '../engine/registry';
import { sanitizeLlmMarkdown } from './llmSanitizer';

export interface ParseResult {
  questions: QuestionModel[];
  diagnostics: Array<{
    questionIndex: number;
    questionId?: string;
    diagnostics: ValidationDiagnostic[];
  }>;
  hasErrors: boolean;
}

const KNOWN_FRONTMATTER_KEYS = new Set([
  'schemaversion',
  'id',
  'version',
  'type',
  'subject',
  'topic',
  'subtopic',
  'difficulty',
  'marks',
  'negativemarks',
  'tags',
  'source',
  'sourceyear',
  'exam',
  'estimatedtimeseconds',
  'questiongroupid',
  'allowpartialcredit',
  'toleranceabsolute',
  'tolerancerelative',
  'tolerancetype',
  'unit',
  'correctcode',
  'correctvalue',
  'acceptedanswers',
  'casesensitive',
  'shuffleoptions',
  'timelimit',
]);

/**
 * Splits raw markdown into individual question blocks using the canonical delimiter:
 * `=== question ===` (with optional markdown heading hashes or extra whitespace)
 * Ensures delimiter is NOT split inside code fences.
 */
export function splitQuestionBlocks(rawText: string): string[] {
  // Normalize any variation of question delimiters
  const normalized = rawText
    .replace(/^[ \t]*#{1,6}[ \t]*===[ \t]*question[ \t]*===[ \t]*$/gim, '=== question ===')
    .replace(/^[ \t]*===[ \t]*question[ \t]*===[ \t]*$/gim, '=== question ===');

  const lines = normalized.split(/\r?\n/);
  const blocks: string[] = [];
  let currentBlockLines: string[] = [];
  let inCodeFence = false;
  const hasCanonicalDelimiter = normalized.includes('=== question ===');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track code fences (``` or ~~~)
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inCodeFence = !inCodeFence;
    }

    // Check for delimiter only outside code fences
    if (!inCodeFence) {
      if (trimmed === '=== question ===') {
        const blockContent = currentBlockLines.join('\n').trim();
        if (blockContent) {
          blocks.push(blockContent);
        }
        currentBlockLines = [];
        continue;
      }

      // Resilient fallback for questions separated by YAML frontmatter without === question ===
      if (!hasCanonicalDelimiter && trimmed === '---' && currentBlockLines.length > 0) {
        const nextLine = lines[i + 1] ? lines[i + 1].trim() : '';
        if (/^(?:schemaVersion|id|type)\s*:/i.test(nextLine)) {
          const blockContent = currentBlockLines.join('\n').trim();
          if (blockContent) {
            blocks.push(blockContent);
          }
          currentBlockLines = [];
        }
      }
    }

    currentBlockLines.push(line);
  }

  const lastBlock = currentBlockLines.join('\n').trim();
  if (lastBlock) {
    blocks.push(lastBlock);
  }

  return blocks;
}

/**
 * Parses a single question markdown block into QuestionModel and diagnostics.
 * Resilient against:
 * 1. Missing or unclosed YAML frontmatter boundaries (---)
 * 2. Option bullets using asterisks (* [x]) or pluses (+ [x])
 * 3. Parameters placed in the body (e.g. correctValue: 45, allowPartialCredit: true)
 */
export function parseSingleQuestionBlock(block: string, blockIndex: number = 0): {
  question?: QuestionModel;
  diagnostics: ValidationDiagnostic[];
} {
  const diagnostics: ValidationDiagnostic[] = [];

  const rawLines = block.split(/\r?\n/);
  let firstNonEmpty = 0;
  while (firstNonEmpty < rawLines.length && !rawLines[firstNonEmpty].trim()) {
    firstNonEmpty++;
  }
  if (firstNonEmpty >= rawLines.length) {
    return { diagnostics };
  }

  const lines = rawLines.slice(firstNonEmpty);
  let rawMetadata: Record<string, any> = {};
  let contentLines: string[] = [];
  let foundValidFrontmatter = false;

  // Case 1: Standard canonical frontmatter bounded by --- and ---
  if (lines[0].trim() === '---') {
    let closingIndex = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        closingIndex = i;
        break;
      }
    }

    if (closingIndex !== -1) {
      const yamlString = lines.slice(1, closingIndex).join('\n');
      try {
        const parsed = YAML.parse(yamlString);
        if (parsed && typeof parsed === 'object') {
          rawMetadata = parsed;
          contentLines = lines.slice(closingIndex + 1);
          foundValidFrontmatter = true;
        }
      } catch {
        // Fallback to line-by-line extractor if YAML parsing failed
      }
    }
  }

  // Case 2: Smart line-by-line extractor for unclosed --- or missing ---
  if (!foundValidFrontmatter) {
    const yamlLinesToParse: string[] = [];
    const startIdx = lines[0].trim() === '---' ? 1 : 0;
    let endIdx = lines.length;

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Explicit closing ---
      if (trimmed === '---') {
        endIdx = i + 1;
        break;
      }

      // Check if line is a key: value pair
      const keyMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\s*:(.*)$/);
      if (keyMatch) {
        const key = keyMatch[1].toLowerCase();
        if (KNOWN_FRONTMATTER_KEYS.has(key) || yamlLinesToParse.length > 0) {
          yamlLinesToParse.push(line);
          continue;
        }
      }

      // Array bullet continuation or indented lines for frontmatter
      const isOptionCheckbox = trimmed.match(/^[-*+]\s*\[([ xX])\]/);
      if (!isOptionCheckbox && (trimmed.startsWith('- ') || /^\s+/.test(line))) {
        if (yamlLinesToParse.length > 0) {
          yamlLinesToParse.push(line);
          continue;
        }
      }

      // Blank line within frontmatter
      if (!trimmed && yamlLinesToParse.length > 0) {
        let nextHasKey = false;
        for (let j = i + 1; j < lines.length; j++) {
          const nextTrim = lines[j].trim();
          if (!nextTrim) continue;
          const nextMatch = nextTrim.match(/^([a-zA-Z0-9_-]+)\s*:(.*)$/);
          if (nextMatch && KNOWN_FRONTMATTER_KEYS.has(nextMatch[1].toLowerCase())) {
            nextHasKey = true;
          }
          break;
        }
        if (nextHasKey) {
          yamlLinesToParse.push(line);
          continue;
        }
      }

      // Non-empty line that does not match frontmatter signals the start of the Question Body
      if (trimmed) {
        endIdx = i;
        break;
      }
    }

    if (yamlLinesToParse.length > 0) {
      try {
        const parsed = YAML.parse(yamlLinesToParse.join('\n'));
        if (parsed && typeof parsed === 'object') {
          rawMetadata = parsed;
          contentLines = lines.slice(endIdx);
          foundValidFrontmatter = true;
        }
      } catch {
        // Fallback: parse basic key: value lines
        for (const yl of yamlLinesToParse) {
          const m = yl.trim().match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
          if (m) {
            const k = m[1];
            let v: any = m[2].trim();
            if (v.startsWith('[') && v.endsWith(']')) {
              v = v.slice(1, -1).split(',').map((s: string) => s.trim().replace(/^["']|["']$/g, ''));
            } else if (!isNaN(Number(v)) && v !== '') {
              v = Number(v);
            } else if (v.toLowerCase() === 'true') v = true;
            else if (v.toLowerCase() === 'false') v = false;
            else v = v.replace(/^["']|["']$/g, '');
            rawMetadata[k] = v;
          }
        }
        if (rawMetadata.id || rawMetadata.type) {
          contentLines = lines.slice(endIdx);
          foundValidFrontmatter = true;
        }
      }
    }
  }

  // If still no frontmatter was recognized, treat the entire block as body
  if (!foundValidFrontmatter) {
    contentLines = lines;
  }

  // 3. Extract Body, Options, Solution, and Body-level attributes
  const remainingText = contentLines.join('\n');

  // Parse Solution directive: :::solution ... :::
  let bodyWithoutSolution = remainingText;
  let solution: string | undefined = undefined;

  const solutionRegex = /:::solution\s*([\s\S]*?)\s*:::/i;
  const solutionMatch = remainingText.match(solutionRegex);
  if (solutionMatch) {
    solution = solutionMatch[1].trim();
    bodyWithoutSolution = remainingText.replace(solutionRegex, '').trim();
  }

  const options: QuestionOption[] = [];
  const remainingBodyLines: string[] = [];

  for (const line of bodyWithoutSolution.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    // Checkbox options: "- [x]", "* [x]", "+ [x]", "- [ ]", etc.
    const checkboxMatch = trimmedLine.match(/^[-*+]\s*\[([ xX])\]\s*(.+)$/);
    if (checkboxMatch) {
      const isCorrect = checkboxMatch[1].toLowerCase() === 'x';
      const text = checkboxMatch[2].trim();
      options.push({
        id: `opt_${options.length}`,
        text,
        isCorrect,
      });
      continue;
    }

    // In-body attributes placed by LLMs (e.g. correctValue: 45, unit: "bits")
    const numValMatch = trimmedLine.match(/^correctValue\s*:\s*([0-9.-]+)$/i);
    if (numValMatch) {
      if (rawMetadata.correctValue === undefined) {
        rawMetadata.correctValue = Number(numValMatch[1]);
      }
      continue;
    }

    const tolAbsMatch = trimmedLine.match(/^toleranceAbsolute\s*:\s*([0-9.-]+)$/i);
    if (tolAbsMatch) {
      if (rawMetadata.toleranceAbsolute === undefined) {
        rawMetadata.toleranceAbsolute = Number(tolAbsMatch[1]);
      }
      continue;
    }

    const tolRelMatch = trimmedLine.match(/^toleranceRelative\s*:\s*([0-9.-]+)$/i);
    if (tolRelMatch) {
      if (rawMetadata.toleranceRelative === undefined) {
        rawMetadata.toleranceRelative = Number(tolRelMatch[1]);
      }
      continue;
    }

    const unitMatch = trimmedLine.match(/^unit\s*:\s*"?([^"]*)"?$/i);
    if (unitMatch) {
      if (rawMetadata.unit === undefined) {
        rawMetadata.unit = unitMatch[1].trim();
      }
      continue;
    }

    const partialCreditMatch = trimmedLine.match(/^allowPartialCredit\s*:\s*(true|false)$/i);
    if (partialCreditMatch) {
      if (rawMetadata.allowPartialCredit === undefined) {
        rawMetadata.allowPartialCredit = partialCreditMatch[1].toLowerCase() === 'true';
      }
      continue;
    }

    const correctCodeMatch = trimmedLine.match(/^correctCode\s*:\s*([A-Za-z0-9]+)$/i);
    if (correctCodeMatch) {
      if (rawMetadata.correctCode === undefined) {
        rawMetadata.correctCode = correctCodeMatch[1].trim();
      }
      continue;
    }

    remainingBodyLines.push(line);
  }

  const cleanedBody = remainingBodyLines.join('\n').trim();

  // If type wasn't set, infer from structure
  let resolvedType = rawMetadata.type as QuestionType;
  if (!resolvedType) {
    if (rawMetadata.correctValue !== undefined) {
      resolvedType = 'numerical';
    } else if (options.length > 0) {
      const correctCount = options.filter((o) => o.isCorrect).length;
      resolvedType = correctCount > 1 || rawMetadata.allowPartialCredit ? 'multiple_choice' : 'single_choice';
    } else {
      resolvedType = 'single_choice';
    }
  }

  // Parse Matches if question type is match
  let matches: Array<{ left: string; right: string }> | undefined = undefined;
  if (resolvedType === 'match') {
    const answerBlockRegex = /:::answer\s*([\s\S]*?)\s*:::/i;
    const answerMatch = remainingText.match(answerBlockRegex);
    if (answerMatch) {
      const pairs = answerMatch[1].split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      matches = pairs
        .map((p) => {
          const parts = p.split(/->|=>|:/);
          return parts.length === 2 ? { left: parts[0].trim(), right: parts[1].trim() } : null;
        })
        .filter((p): p is { left: string; right: string } => p !== null);
    }
  }

  // Construct QuestionModel
  const question: QuestionModel = {
    schemaVersion: String(rawMetadata.schemaVersion || '2.0'),
    id: String(
      rawMetadata.id || `q_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}_${blockIndex + 1}`
    ),
    version: Number(rawMetadata.version) || 1,
    type: resolvedType,
    subject: String(rawMetadata.subject || 'General'),
    topic: String(rawMetadata.topic || 'General'),
    subtopic: rawMetadata.subtopic ? String(rawMetadata.subtopic) : undefined,
    difficulty: (rawMetadata.difficulty as any) || 'medium',
    marks: typeof rawMetadata.marks === 'number' ? rawMetadata.marks : 1,
    negativeMarks: typeof rawMetadata.negativeMarks === 'number' ? rawMetadata.negativeMarks : 0,
    tags: Array.isArray(rawMetadata.tags)
      ? rawMetadata.tags.map(String)
      : typeof rawMetadata.tags === 'string'
      ? rawMetadata.tags.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [],
    source: rawMetadata.source,
    sourceYear: rawMetadata.sourceYear ? Number(rawMetadata.sourceYear) : undefined,
    exam: rawMetadata.exam,
    estimatedTimeSeconds: rawMetadata.estimatedTimeSeconds ? Number(rawMetadata.estimatedTimeSeconds) : undefined,
    questionGroupId: rawMetadata.questionGroupId,
    allowPartialCredit: Boolean(rawMetadata.allowPartialCredit),
    toleranceAbsolute: rawMetadata.toleranceAbsolute !== undefined ? Number(rawMetadata.toleranceAbsolute) : 0,
    toleranceRelative: rawMetadata.toleranceRelative !== undefined ? Number(rawMetadata.toleranceRelative) : undefined,
    unit: rawMetadata.unit !== undefined ? String(rawMetadata.unit) : undefined,
    correctCode: rawMetadata.correctCode,
    correctValue: rawMetadata.correctValue !== undefined ? Number(rawMetadata.correctValue) : undefined,
    acceptedAnswers: Array.isArray(rawMetadata.acceptedAnswers) ? rawMetadata.acceptedAnswers.map(String) : undefined,
    caseSensitive: rawMetadata.caseSensitive !== undefined ? Boolean(rawMetadata.caseSensitive) : undefined,
    body: cleanedBody,
    options: options.length > 0 ? options : undefined,
    solution,
    matches,
  };

  // 4. Validate through QuestionTypeRegistry
  const typeDiagnostics = questionRegistry.validate(question);
  diagnostics.push(...typeDiagnostics);

  // 5. Warnings and Info guidance
  if (!question.tags || question.tags.length === 0) {
    diagnostics.push({
      level: 'INFO',
      code: 'NO_TAGS',
      message: 'Question has no tags. Adding tags aids categorization and search.',
    });
  }

  if (!question.difficulty) {
    diagnostics.push({
      level: 'INFO',
      code: 'NO_DIFFICULTY',
      message: 'Difficulty not explicitly set; defaulting to medium.',
    });
  }

  // Normalize before returning
  const normalized = questionRegistry.normalize(question);
  return { question: normalized, diagnostics };
}

/**
 * Parses full markdown string (potentially containing multiple questions separated by `=== question ===`).
 */
export function parseMarkdownQuestions(rawMarkdown: string): ParseResult {
  const sanitized = sanitizeLlmMarkdown(rawMarkdown);
  const blocks = splitQuestionBlocks(sanitized);
  const questions: QuestionModel[] = [];
  const diagnosticsList: ParseResult['diagnostics'] = [];
  let hasErrors = false;

  for (let i = 0; i < blocks.length; i++) {
    const { question, diagnostics } = parseSingleQuestionBlock(blocks[i], i);
    const blockErrors = diagnostics.some((d) => d.level === 'ERROR');

    diagnosticsList.push({
      questionIndex: i,
      questionId: question?.id,
      diagnostics,
    });

    if (blockErrors) {
      hasErrors = true;
    }

    if (question) {
      questions.push(question);
    }
  }

  // Invariant check: Duplicate question IDs within the document
  const seenIds = new Set<string>();
  for (const q of questions) {
    if (seenIds.has(q.id)) {
      hasErrors = true;
      diagnosticsList.push({
        questionIndex: -1,
        questionId: q.id,
        diagnostics: [
          {
            level: 'ERROR',
            code: 'DUPLICATE_QUESTION_ID',
            message: `Question ID "${q.id}" is duplicated in this document. IDs must be unique.`,
          },
        ],
      });
    }
    seenIds.add(q.id);
  }

  return { questions, diagnostics: diagnosticsList, hasErrors };
}
