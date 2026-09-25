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
  | 'MARKDOWN_FULL_TEST'
  | 'MARKDOWN_QUESTIONS'
  | 'JSON_FULL_TEST'
  | 'JSON_QUESTIONS'
  | 'UNKNOWN';

/**
 * Strips outer markdown code block fences (```markdown ... ``` or ```json ... ```)
 * and trims leading/trailing whitespace.
 */
export function stripCodeFences(text: string): string {
  let cleaned = text.trim();

  // Match ```<lang>?\n ... \n```
  const fenceRegex = /^```(?:markdown|json|yaml|text)?\r?\n([\s\S]*?)\r?\n```$/i;
  const match = cleaned.match(fenceRegex);
  if (match) {
    return match[1].trim();
  }

  // Also handle cases where there is conversational intro before the code block
  const embeddedFenceRegex = /```(?:markdown|json|yaml|text)?\r?\n([\s\S]*?)\r?\n```/i;
  const embeddedMatch = cleaned.match(embeddedFenceRegex);
  if (embeddedMatch) {
    return embeddedMatch[1].trim();
  }

  return cleaned;
}

/**
 * Sanitizes markdown output from an LLM.
 * 1. Strips code fences
 * 2. Finds the first '---' frontmatter start and cuts off any conversational preface
 * 3. Cuts off conversational outro after the last ':::' solution block
 */
export function sanitizeLlmMarkdown(raw: string): string {
  if (!raw) return '';
  let content = stripCodeFences(raw);

  // Normalize line breaks
  content = content.replace(/\r\n/g, '\n');

  // Normalize question delimiters (e.g. "## === question ===" -> "=== question ===")
  content = content.replace(/^[ \t]*#{1,6}[ \t]*===[ \t]*question[ \t]*===[ \t]*$/gim, '=== question ===');
  content = content.replace(/^[ \t]*===[ \t]*question[ \t]*===[ \t]*$/gim, '=== question ===');

  // Normalize checkbox task list bullets: "* [x]" or "+ [x]" -> "- [x]"
  content = content.replace(/^([ \t]*)[*+][ \t]*\[([ xX])\][ \t]*(.*)$/gm, '$1- [$2] $3');

  // If there's conversational text before the first '---' or first 'schemaVersion:' / 'id:', trim it
  const firstDashIndex = content.indexOf('---');
  const firstSchemaIndex = content.search(/^[ \t]*(?:schemaVersion|id|type):/m);

  const startCutoff = firstDashIndex !== -1 && firstSchemaIndex !== -1
    ? Math.min(firstDashIndex, firstSchemaIndex)
    : firstDashIndex !== -1
    ? firstDashIndex
    : firstSchemaIndex;

  if (startCutoff > 0) {
    const beforeDashes = content.slice(0, startCutoff).trim();
    if (!beforeDashes.startsWith('# Section:') && !beforeDashes.startsWith('title:')) {
      content = content.slice(startCutoff);
    }
  }

  // If there's conversational outro after the last ':::' block
  const lastSolutionClose = content.lastIndexOf(':::');
  if (lastSolutionClose !== -1) {
    const afterSolution = content.slice(lastSolutionClose + 3);
    // If after the solution there is no other delimiter or frontmatter, but conversational text
    if (!afterSolution.includes('=== question ===') && !afterSolution.includes('---')) {
      // Keep only up to the end of the line containing ':::'
      const lineEnd = content.indexOf('\n', lastSolutionClose);
      if (lineEnd !== -1) {
        content = content.slice(0, lineEnd).trim();
      }
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
 * Automatically inspects raw text from an LLM or clipboard and determines its format.
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
        if (Array.isArray(parsed.questions)) {
          return 'JSON_QUESTIONS';
        }
        if (parsed.sections || (parsed.title && parsed.timing)) {
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
  if (cleaned.includes('---')) {
    // Check if top frontmatter contains test-level fields
    const testKeywords = ['durationMinutes', 'timingMode', 'timing:', 'navigation:', 'scoring:'];
    const isTestBlueprint =
      cleaned.includes('# Section:') || testKeywords.some((kw) => cleaned.includes(kw));

    if (isTestBlueprint) {
      return 'MARKDOWN_FULL_TEST';
    }

    if (cleaned.includes('=== question ===') || cleaned.includes('type:') || cleaned.includes(':::solution')) {
      return 'MARKDOWN_QUESTIONS';
    }
  }

  // Fallback checks
  if (cleaned.includes('# Section:')) return 'MARKDOWN_FULL_TEST';
  if (cleaned.includes('=== question ===') || /^[ \t]*(?:schemaVersion|id|type):/m.test(cleaned)) {
    return 'MARKDOWN_QUESTIONS';
  }

  return 'UNKNOWN';
}
