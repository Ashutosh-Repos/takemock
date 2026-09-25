/**
 * Full Test Document Serializer and Parser for takemock.
 * Enables two-way real-time synchronization between visual UI controls and raw Markdown/JSON.
 * Adheres strictly to docs/master_architecture_prompt_v2.md & docs/markdown_format_spec_v2.md.
 */

import YAML from 'yaml';
import type { QuestionModel } from '@/types/question';
import type { NavigationMode, TestMode, TimingMode } from '@/types/test';
import { sanitizeLlmJson, sanitizeLlmMarkdown } from './llmSanitizer';
import { parseJsonQuestions } from './jsonConverter';
import { parseMarkdownQuestions } from './markdownParser';
import { serializeMarkdownQuestions } from './markdownSerializer';

export interface FullTestSectionParsed {
  id: string;
  title: string;
  questions: QuestionModel[];
}

export interface FullTestParsedResult {
  title?: string;
  description?: string;
  instructions?: string;
  mode?: TestMode;
  timingMode?: TimingMode;
  durationMinutes?: number;
  navigation?: NavigationMode;
  defaultMarks?: number;
  negativeMarks?: number;
  allowPartialCredit?: boolean;
  sections: FullTestSectionParsed[];
  allQuestions: QuestionModel[];
  errors: string[];
}

/**
 * Serializes the current visual state into canonical Markdown v2 with test header and section divisions.
 */
export function serializeTestToMarkdown(
  testMeta: {
    title: string;
    description: string;
    instructions?: string;
    mode: TestMode;
    timingMode: TimingMode;
    durationMinutes: number;
    navigation: NavigationMode;
    defaultMarks: number;
    negativeMarks: number;
    allowPartialCredit: boolean;
  },
  sections: Array<{
    id: string;
    title: string;
    questions: QuestionModel[];
  }>
): string {
  const frontmatterObj: Record<string, any> = {
    schemaVersion: '2.0',
    title: testMeta.title || 'Untitled Test Blueprint',
    description: testMeta.description || '',
    mode: testMeta.mode,
    timing: {
      mode: testMeta.timingMode,
      durationMinutes: testMeta.durationMinutes,
    },
    scoring: {
      defaultMarks: testMeta.defaultMarks,
      negativeMarks: testMeta.negativeMarks,
      allowPartialCredit: testMeta.allowPartialCredit,
    },
    navigation: testMeta.navigation,
  };

  if (testMeta.instructions?.trim()) {
    frontmatterObj.instructions = testMeta.instructions.trim();
  }

  const frontmatterYaml = YAML.stringify(frontmatterObj).trim();
  const chunks: string[] = [`---\n${frontmatterYaml}\n---`];

  for (const sec of sections) {
    chunks.push(`\n# Section: ${sec.title}`);
    if (sec.questions.length > 0) {
      const questionsMd = serializeMarkdownQuestions(sec.questions);
      chunks.push(questionsMd);
    }
  }

  return chunks.join('\n\n');
}

/**
 * Serializes the current visual state into formatted JSON.
 */
export function serializeTestToJson(
  testMeta: {
    title: string;
    description: string;
    instructions?: string;
    mode: TestMode;
    timingMode: TimingMode;
    durationMinutes: number;
    navigation: NavigationMode;
    defaultMarks: number;
    negativeMarks: number;
    allowPartialCredit: boolean;
  },
  sections: Array<{
    id: string;
    title: string;
    questions: QuestionModel[];
  }>
): string {
  const jsonBundle = {
    schemaVersion: '2.0',
    title: testMeta.title,
    description: testMeta.description,
    instructions: testMeta.instructions,
    mode: testMeta.mode,
    timing: {
      mode: testMeta.timingMode,
      durationMinutes: testMeta.durationMinutes,
    },
    scoring: {
      defaultMarks: testMeta.defaultMarks,
      negativeMarks: testMeta.negativeMarks,
      allowPartialCredit: testMeta.allowPartialCredit,
    },
    navigation: testMeta.navigation,
    sections: sections.map((sec, idx) => ({
      id: sec.id || `sec_${idx + 1}`,
      title: sec.title,
      order: idx,
      questions: sec.questions,
    })),
  };

  return JSON.stringify(jsonBundle, null, 2);
}

/**
 * Parses full test Markdown containing test frontmatter and `# Section: ...` markers.
 */
export function parseFullTestMarkdown(rawText: string): FullTestParsedResult {
  const errors: string[] = [];
  const sanitized = sanitizeLlmMarkdown(rawText);
  const lines = sanitized.split(/\r?\n/);

  let testMeta: Record<string, any> = {};
  let bodyStartIndex = 0;

  const isDivider = (line: string) => /^[ \t]*[-=_]{3,}[ \t]*$/.test(line);

  let firstNonEmptyLine = 0;
  while (firstNonEmptyLine < lines.length && !lines[firstNonEmptyLine].trim()) {
    firstNonEmptyLine++;
  }

  let startIndex = -1;
  if (firstNonEmptyLine < lines.length) {
    const line = lines[firstNonEmptyLine];
    if (isDivider(line)) {
      startIndex = firstNonEmptyLine + 1;
    } else if (/^[ \t]*title[ \t]*:/i.test(line)) {
      startIndex = firstNonEmptyLine;
    }
  }

  if (startIndex !== -1) {
    let closingIndex = -1;
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      if (/^[ \t]*# Section:/i.test(line)) {
        closingIndex = i;
        break;
      }
      if (/^[ \t]*(?:#{1,6}[ \t]*)?===[ \t]*question[ \t]*===/i.test(line)) {
        closingIndex = i;
        break;
      }
      if (isDivider(line)) {
        closingIndex = i;
        break;
      }
    }

    if (closingIndex !== -1) {
      const candidateYaml = lines.slice(startIndex, closingIndex).join('\n');
      let candidateMeta: Record<string, any> = {};
      try {
        const parsed = YAML.parse(candidateYaml);
        if (parsed && typeof parsed === 'object' && !parsed.type) {
          candidateMeta = { ...parsed };
        }
      } catch {
        // Fallback to resilient regex extraction below
      }

      // Resilient regex fallbacks if candidate is not a question
      const isQuestionLike =
        candidateYaml.includes('type:') ||
        candidateYaml.includes('schemaVersion:') ||
        candidateYaml.includes('options:') ||
        candidateYaml.includes(':::solution');

      if (!isQuestionLike) {
        if (!candidateMeta.title) {
          const m = candidateYaml.match(/^[ \t]*title[ \t]*:[ \t]*(.+)$/m);
          if (m) candidateMeta.title = m[1].replace(/^["']|["']$/g, '').trim();
        }
        if (candidateMeta.durationMinutes === undefined) {
          const m = candidateYaml.match(/^[ \t]*(?:durationMinutes|duration)[ \t]*:[ \t]*(\d+)/m);
          if (m) candidateMeta.durationMinutes = parseInt(m[1], 10);
        }
        if (!candidateMeta.mode) {
          const m = candidateYaml.match(/^[ \t]*mode[ \t]*:[ \t]*([a-zA-Z_]+)/m);
          if (m) candidateMeta.mode = m[1].toUpperCase();
        }
        if (!candidateMeta.instructions) {
          const m = candidateYaml.match(/^[ \t]*instructions[ \t]*:[ \t]*([|>]-?)?\s*\n?([\s\S]*?)(?=(?:^[ \t]*[a-zA-Z0-9_-]+[ \t]*:)|$)/m);
          if (m) candidateMeta.instructions = (m[2] || m[0].replace(/^[ \t]*instructions[ \t]*:[ \t]*/, '')).replace(/^["']|["']$/g, '').trim();
        }
        if (!candidateMeta.description) {
          const m = candidateYaml.match(/^[ \t]*description[ \t]*:[ \t]*(.+)$/m);
          if (m) candidateMeta.description = m[1].replace(/^["']|["']$/g, '').trim();
        }
      }

      const hasTestBlueprint = Boolean(
        candidateMeta.title ||
        candidateMeta.mode ||
        candidateMeta.durationMinutes !== undefined ||
        candidateMeta.timing ||
        candidateMeta.sections
      );

      if (hasTestBlueprint && !isQuestionLike) {
        testMeta = candidateMeta;
        bodyStartIndex = closingIndex;
        if (isDivider(lines[closingIndex])) {
          bodyStartIndex = closingIndex + 1;
          // Skip decorative divider lines or blank lines between frontmatter and the first section/question
          while (
            bodyStartIndex < lines.length &&
            (isDivider(lines[bodyStartIndex]) || !lines[bodyStartIndex].trim()) &&
            !/^[ \t]*# Section:/i.test(lines[bodyStartIndex])
          ) {
            bodyStartIndex++;
          }
        }
      }
    }
  }

  // Split remainder by `# Section: `
  const remainingText = lines.slice(bodyStartIndex).join('\n');
  const sectionSplitRegex = /^# Section:\s*(.*)$/gm;

  const sectionMatches: Array<{ title: string; index: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = sectionSplitRegex.exec(remainingText)) !== null) {
    sectionMatches.push({ title: match[1].trim(), index: match.index });
  }

  const sections: FullTestSectionParsed[] = [];
  const allQuestions: QuestionModel[] = [];

  if (sectionMatches.length === 0) {
    // No explicit sections: treat all questions as Section 1: General
    const parseRes = parseMarkdownQuestions(remainingText);
    allQuestions.push(...parseRes.questions);
    sections.push({
      id: 'sec_1',
      title: 'Section 1: General',
      questions: parseRes.questions,
    });
    if (parseRes.hasErrors) {
      errors.push('Some questions had syntax warnings or errors during parsing.');
    }
  } else {
    for (let s = 0; s < sectionMatches.length; s++) {
      const current = sectionMatches[s];
      const startPos = current.index;
      const endPos = s + 1 < sectionMatches.length ? sectionMatches[s + 1].index : remainingText.length;

      // Extract section text excluding the header line itself
      const sectionRaw = remainingText.slice(startPos, endPos).replace(/^# Section:.*$/m, '').trim();
      const parseRes = parseMarkdownQuestions(sectionRaw);

      allQuestions.push(...parseRes.questions);
      sections.push({
        id: `sec_${s + 1}`,
        title: current.title || `Section ${s + 1}`,
        questions: parseRes.questions,
      });

      if (parseRes.hasErrors) {
        errors.push(`Warnings in Section "${current.title}"`);
      }
    }
  }

  return {
    title: testMeta.title,
    description: testMeta.description,
    instructions: testMeta.instructions,
    mode: testMeta.mode,
    timingMode: testMeta.timingMode || testMeta.timing?.mode,
    durationMinutes: testMeta.durationMinutes ?? testMeta.timing?.durationMinutes,
    navigation: testMeta.navigation,
    defaultMarks: testMeta.defaultMarks ?? testMeta.scoring?.defaultMarks,
    negativeMarks: testMeta.negativeMarks ?? testMeta.scoring?.negativeMarks,
    allowPartialCredit: testMeta.allowPartialCredit ?? testMeta.scoring?.allowPartialCredit,
    sections,
    allQuestions,
    errors,
  };
}

/**
 * Parses full test JSON bundle.
 */
export function parseFullTestJson(rawJson: string): FullTestParsedResult {
  const errors: string[] = [];
  try {
    const sanitized = sanitizeLlmJson(rawJson);
    const data = JSON.parse(sanitized);

    // If it's a raw array of questions (e.g. from an LLM prompt response)
    if (Array.isArray(data)) {
      const qParse = parseJsonQuestions(sanitized);
      return {
        sections: [
          {
            id: 'sec_1',
            title: 'Section 1: General',
            questions: qParse.questions,
          },
        ],
        allQuestions: qParse.questions,
        errors: qParse.hasErrors ? ['Some questions had schema errors'] : [],
      };
    }

    // If it's a full test bundle
    const sections: FullTestSectionParsed[] = (data.sections || []).map((s: any, idx: number) => ({
      id: s.id || `sec_${idx + 1}`,
      title: s.title || `Section ${idx + 1}`,
      questions: s.questions || [],
    }));

    const allQuestions = sections.flatMap((s) => s.questions);

    return {
      title: data.title,
      description: data.description,
      instructions: data.instructions,
      mode: data.mode,
      timingMode: data.timingMode || data.timing?.mode,
      durationMinutes: data.durationMinutes ?? data.timing?.durationMinutes,
      navigation: data.navigation,
      defaultMarks: data.defaultMarks ?? data.scoring?.defaultMarks,
      negativeMarks: data.negativeMarks ?? data.scoring?.negativeMarks,
      allowPartialCredit: data.allowPartialCredit ?? data.scoring?.allowPartialCredit,
      sections: sections.length > 0 ? sections : [{ id: 'sec_1', title: 'Section 1: General', questions: [] }],
      allQuestions,
      errors,
    };
  } catch (err: any) {
    return {
      sections: [],
      allQuestions: [],
      errors: [`JSON parse error: ${err.message}`],
    };
  }
}
