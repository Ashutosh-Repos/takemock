/**
 * LLM Output Sanitizer & Flexible Content Ingest for takemock.
 *
 * Real-world LLMs (ChatGPT, Claude, Gemini, DeepSeek, Ollama) often emit:
 * 1. Surrounding markdown fences (\`\`\`markdown, \`\`\`json, \`\`\`text, \`\`\`)
 * 2. Conversational greetings ("Here are your 5 questions: ...")
 * 3. Trailing friendly commentary ("Hope this helps your test prep!")
 * 4. Mixed JSON wrappers like { "questions": [...] } instead of direct array
 *
 * This utility strips noise and extracts clean, authoritative payloads
 * adhering to docs/llm_question_prompt_standard_v2.md with maximum user flexibility.
 */

export type DetectedFormat =
  'MARKDOWN_FULL_TEST' | 'MARKDOWN_QUESTIONS' | 'JSON_FULL_TEST' | 'JSON_QUESTIONS' | 'UNKNOWN';

/**
 * Strips outer markdown code block fences (```markdown ... ``` or ```json ... ```)
 * and trims leading/trailing whitespace.
 * Handles unclosed code fences (e.g. LLM ran out of tokens before closing ```).
 */
export function stripCodeFences(text: string): string {
  if (!text) return '';
  const cleaned = text.trim();

  // 1. Check for standard matched fences: ```<lang>?\n ... \n```
  const fenceRegex = /^```(?:markdown|json|yaml|text)?\r?\n([\s\S]*?)\r?\n```$/i;
  const match = cleaned.match(fenceRegex);
  if (match) {
    return match[1].trim();
  }

  // 2. Embedded fence with conversational intro: "Sure! Here is your test:\n```markdown\n ... \n```"
  const embeddedFenceRegex = /```(?:markdown|json|yaml|text)?\r?\n([\s\S]*?)\r?\n```/i;
  const embeddedMatch = cleaned.match(embeddedFenceRegex);
  if (embeddedMatch) {
    return embeddedMatch[1].trim();
  }

  // 3. Unclosed opening fence: ```markdown\n ... (no closing ```)
  const unclosedFenceRegex = /^(?:[\s\S]*?```(?:markdown|json|yaml|text)?\r?\n)([\s\S]*)$/i;
  const unclosedMatch = cleaned.match(unclosedFenceRegex);
  if (unclosedMatch && !cleaned.endsWith('```')) {
    // Check if the extracted content actually looks like markdown/YAML
    const inner = unclosedMatch[1].trim();
    if (
      inner.includes('---') ||
      inner.includes('schemaVersion') ||
      inner.includes('type:') ||
      inner.includes('# Section:')
    ) {
      return inner;
    }
  }

  return cleaned;
}

/**
 * Structural anchor patterns that mark the start of valid question or test content.
 */
const START_ANCHOR_PATTERNS = [
  /^[ \t]*---[ \t]*$/m,
  /^[ \t]*# Section:[ \t]*.+$/m,
  /^[ \t]*#{1,6}[ \t]*===[ \t]*question[ \t]*===[ \t]*$/m,
  /^[ \t]*===[ \t]*question[ \t]*===[ \t]*$/m,
  /^[ \t]*(?:schemaVersion|id|type)[ \t]*:/m,
  /^[ \t]*title[ \t]*:[ \t]*.+$/m,
];

/**
 * Sanitizes markdown output from an LLM using Two-Pass Anchor Detection:
 * Pass 1: Leading Anchor Detection — Discards conversational greetings prior to the first valid structural anchor.
 * Normalization: Cleans delimiters, checkboxes, and unclosed frontmatter dashes.
 * Pass 2: Trailing Anchor Truncation — Discards polite sign-offs after the final question/solution boundary.
 *
 * CRITICAL INVARIANT: NEVER strips question solutions (:::solution) or KaTeX math expressions!
 */
export function sanitizeLlmMarkdown(raw: string): string {
  if (!raw) return '';
  let content = stripCodeFences(raw);

  // Normalize line breaks
  content = content.replace(/\r\n/g, '\n');

  // Normalize question delimiters (e.g. "## === question ===" or "===question===" -> "=== question ===")
  content = content.replace(
    /^[ \t]*#{1,6}[ \t]*===[ \t]*question[ \t]*===[ \t]*$/gim,
    '=== question ===',
  );
  content = content.replace(/^[ \t]*===[ \t]*question[ \t]*===[ \t]*$/gim, '=== question ===');

  // Normalize checkbox task list bullets: "* [x]" or "+ [x]" -> "- [x]"
  content = content.replace(/^([ \t]*)[*+][ \t]*\[([ xX])\][ \t]*(.*)$/gm, '$1- [$2] $3');

  // -------------------------------------------------------------
  // PASS 1: Leading Anchor Detection (Strip Conversational Greeting)
  // -------------------------------------------------------------
  let earliestAnchorIndex = -1;
  for (const pattern of START_ANCHOR_PATTERNS) {
    const match = content.match(pattern);
    if (match && match.index !== undefined) {
      if (earliestAnchorIndex === -1 || match.index < earliestAnchorIndex) {
        earliestAnchorIndex = match.index;
      }
    }
  }

  if (earliestAnchorIndex > 0) {
    // Only strip if the preface doesn't look like valid test markdown
    const preface = content.slice(0, earliestAnchorIndex).trim();
    if (!preface.startsWith('# Section:') && !preface.startsWith('title:')) {
      content = content.slice(earliestAnchorIndex);
    }
  }

  // Handle case where ChatGPT output omitted opening '---' for the first question
  // e.g. starts directly with schemaVersion: "2.0"
  if (
    /^[ \t]*(?:schemaVersion|type|id)[ \t]*:/m.test(content) &&
    !content.trim().startsWith('---') &&
    !content.trim().startsWith('# Section:')
  ) {
    const firstAnchorMatch = content.match(/^[ \t]*(?:schemaVersion|type|id)[ \t]*:/m);
    if (firstAnchorMatch && firstAnchorMatch.index !== undefined && firstAnchorMatch.index <= 10) {
      content = '---\n' + content.trimStart();
    }
  }

  // -------------------------------------------------------------
  // PASS 2: Trailing Anchor Truncation (Strip Trailing Conversational Notes)
  // -------------------------------------------------------------
  // Find the last legitimate semantic boundary in the text:
  // Boundary A: End of :::solution block
  // Boundary B: End of an option checkbox line (- [ ] or - [x])
  // Boundary C: End of a question attribute (correctValue, unit, toleranceAbsolute, etc.)
  const lastSolutionClose = content.lastIndexOf(':::');
  const lastOptionMatch = [...content.matchAll(/^[ \t]*-[ \t]*\[[ xX]\][ \t]*.+$/gm)].pop();
  const lastAttributeMatch = [
    ...content.matchAll(
      /^[ \t]*(?:correctValue|toleranceAbsolute|toleranceRelative|unit|correctCode|allowPartialCredit|acceptedAnswers|difficulty|marks)[ \t]*:[ \t]*.+$/gm,
    ),
  ].pop();

  let lastSemanticEnd = -1;

  if (lastSolutionClose !== -1) {
    // Move to end of the line containing the closing :::
    const lineEnd = content.indexOf('\n', lastSolutionClose);
    lastSemanticEnd = Math.max(lastSemanticEnd, lineEnd !== -1 ? lineEnd : content.length);
  }

  if (lastOptionMatch && lastOptionMatch.index !== undefined) {
    const optionEnd = lastOptionMatch.index + lastOptionMatch[0].length;
    lastSemanticEnd = Math.max(lastSemanticEnd, optionEnd);
  }

  if (lastAttributeMatch && lastAttributeMatch.index !== undefined) {
    const attrEnd = lastAttributeMatch.index + lastAttributeMatch[0].length;
    lastSemanticEnd = Math.max(lastSemanticEnd, attrEnd);
  }

  if (lastSemanticEnd !== -1 && lastSemanticEnd < content.length) {
    const trailingText = content.slice(lastSemanticEnd).trim();
    // Check if trailing text contains key-value pairs (like unit: "") or structure
    const isKeyValueLine = /^[ \t]*[A-Za-z0-9_-]+[ \t]*:[ \t]*/m.test(trailingText);
    const isStructural =
      trailingText.includes('=== question ===') ||
      trailingText.includes('# Section:') ||
      trailingText.includes('---');

    if (trailingText && !isKeyValueLine && !isStructural) {
      content = content.slice(0, lastSemanticEnd).trim();
    }
  }

  return content.trim();
}

/**
 * Sanitizes JSON output from an LLM.
 * 1. Strips code fences
 * 2. Extracts first valid JSON array [...] or object {...}
 */
export function sanitizeLlmJson(raw: string): string {
  if (!raw) return '';
  let content = stripCodeFences(raw).trim();

  // Find first '[' or '{'
  const firstBracket = content.indexOf('[');
  const firstBrace = content.indexOf('{');

  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    // Array format
    const lastBracket = content.lastIndexOf(']');
    if (lastBracket > firstBracket) {
      content = content.slice(firstBracket, lastBracket + 1);
    }
  } else if (firstBrace !== -1) {
    // Object format
    const lastBrace = content.lastIndexOf('}');
    if (lastBrace > firstBrace) {
      content = content.slice(firstBrace, lastBrace + 1);
    }
  }

  return content.trim();
}

/**
 * Automatically inspects raw text from an LLM or clipboard and deterministically
 * classifies whether it is a Full Paper (Test Blueprint) or a Question Pack.
 */
export function detectContentFormat(rawText: string): DetectedFormat {
  if (!rawText || !rawText.trim()) return 'UNKNOWN';

  const cleaned = stripCodeFences(rawText).trim();

  // 1. Check if it's JSON
  if (cleaned.startsWith('[') || cleaned.startsWith('{')) {
    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        return 'JSON_QUESTIONS';
      }
      if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.questions) && !parsed.sections && !parsed.timing) {
          return 'JSON_QUESTIONS';
        }
        if (
          parsed.sections ||
          (parsed.title && (parsed.timing || parsed.durationMinutes || parsed.mode))
        ) {
          return 'JSON_FULL_TEST';
        }
      }
    } catch {
      // might have partial or unclosed JSON
      if (cleaned.startsWith('[')) return 'JSON_QUESTIONS';
      if (cleaned.startsWith('{')) return 'JSON_FULL_TEST';
    }
  }

  // 2. Check if it's Markdown Full Test vs Markdown Questions
  // Strongest signal 1: explicit # Section: header
  if (/^[ \t]*# Section:[ \t]*.+$/m.test(cleaned)) {
    return 'MARKDOWN_FULL_TEST';
  }

  // Strongest signal 2: Blueprint frontmatter in the first YAML block
  if (cleaned.startsWith('---')) {
    const nextDash = cleaned.indexOf('---', 3);
    if (nextDash !== -1) {
      const firstBlock = cleaned.slice(3, nextDash);
      const isQuestionBlock = /^[ \t]*(?:type|schemaVersion)[ \t]*:/m.test(firstBlock);
      const hasBlueprintKeys =
        /^[ \t]*(?:durationMinutes|timingMode|timing|navigation|scoring|title|mode)[ \t]*:/m.test(
          firstBlock,
        );
      if (hasBlueprintKeys && !isQuestionBlock) {
        return 'MARKDOWN_FULL_TEST';
      }
    }
  }

  // Check for standalone questions signal
  if (
    cleaned.includes('=== question ===') ||
    /^[ \t]*(?:schemaVersion|id|type)[ \t]*:/m.test(cleaned) ||
    cleaned.includes(':::solution') ||
    /^[ \t]*-[ \t]*\[[ xX]\][ \t]*.+$/m.test(cleaned)
  ) {
    return 'MARKDOWN_QUESTIONS';
  }

  return 'UNKNOWN';
}
