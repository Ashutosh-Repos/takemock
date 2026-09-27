/**
 * LLM Question Format Specification Engine for takemock.
 *
 * Implements the core objective of docs/llm_question_prompt_standard_v2.md:
 * "This suffix is intended to be appended to a user's natural-language request
 * when asking an LLM to generate questions for takemock."
 *
 * Design Principles:
 * 1. The user's conversation / prompt is authoritative for content, difficulty, syllabus, and style.
 * 2. The prompt suffix is strictly for teaching the LLM the syntax of valid Markdown v2 or JSON.
 * 3. Question types selection allows users to specify which question formats the AI should follow.
 * 4. Zero rigid templates, no artificial generation targets, and no model book bloat.
 * 5. High-efficiency prompt instructions that strictly forbid conversational chatter, greetings, and footers.
 */

export type OutputFormat = 'MARKDOWN' | 'JSON';
export type GenerationTarget = 'QUESTION_PACK' | 'FULL_PAPER';

export interface QuestionTypeDefinition {
  id: string;
  label: string;
  description: string;
  markdownExample: string;
  jsonExample: string;
}

export const SUPPORTED_QUESTION_TYPES: QuestionTypeDefinition[] = [
  {
    id: 'single_choice',
    label: 'Single Choice (MCQ)',
    description: '1 correct option with multiple plausible distractors.',
    markdownExample: `- [ ] Incorrect Option A
- [x] Correct Option B
- [ ] Incorrect Option C
- [ ] Incorrect Option D`,
    jsonExample: `"options": [
  { "id": "opt_0", "text": "Incorrect A", "isCorrect": false },
  { "id": "opt_1", "text": "Correct B", "isCorrect": true }
]`,
  },
  {
    id: 'multiple_choice',
    label: 'Multiple Choice (Multi-Select)',
    description: 'One or more correct options with partial credit support.',
    markdownExample: `allowPartialCredit: true
---
- [x] Correct Option A
- [ ] Incorrect Option B
- [x] Correct Option C`,
    jsonExample: `"allowPartialCredit": true,
"options": [
  { "id": "opt_0", "text": "Correct A", "isCorrect": true },
  { "id": "opt_1", "text": "Incorrect B", "isCorrect": false },
  { "id": "opt_2", "text": "Correct C", "isCorrect": true }
]`,
  },
  {
    id: 'numerical',
    label: 'Numerical (with Tolerance)',
    description: 'Direct calculated answer with absolute/relative tolerance.',
    markdownExample: `correctValue: 12.5
toleranceAbsolute: 0.1
unit: "m/s"
---
Calculate the final velocity in m/s:`,
    jsonExample: `"correctValue": 12.5,
"toleranceAbsolute": 0.1,
"unit": "m/s"`,
  },
  {
    id: 'true_false',
    label: 'True / False',
    description: 'Binary conceptual statement verification.',
    markdownExample: `- [x] True
- [ ] False`,
    jsonExample: `"options": [
  { "id": "opt_0", "text": "True", "isCorrect": true },
  { "id": "opt_1", "text": "False", "isCorrect": false }
]`,
  },
  {
    id: 'integer',
    label: 'Integer',
    description: 'Exact non-negative or signed integer response.',
    markdownExample: `correctValue: 42
---
Determine the integer value of n:`,
    jsonExample: `"correctValue": 42`,
  },
  {
    id: 'fill_blank',
    label: 'Fill in the Blank',
    description: 'Exact formula or phrase verification against accepted answers.',
    markdownExample: `acceptedAnswers: ["binary search", "binary-search"]
caseSensitive: false
---
The searching algorithm with logarithmic time complexity $O(\\log n)$ on sorted arrays is ___________.`,
    jsonExample: `"acceptedAnswers": ["binary search", "binary-search"],
"caseSensitive": false`,
  },
  {
    id: 'match',
    label: 'Match Matrix',
    description: 'Mapping between List I and List II items.',
    markdownExample: `List I:
(A) First Law of Thermodynamics
(B) Second Law of Thermodynamics

List II:
(P) Entropy increases in irreversible processes
(Q) Conservation of energy

- [x] A-Q, B-P
- [ ] A-P, B-Q`,
    jsonExample: `"body": "List I: ... List II: ...",
"options": [
  { "id": "opt_0", "text": "A-Q, B-P", "isCorrect": true }
]`,
  },
  {
    id: 'assertion_reason',
    label: 'Assertion-Reason',
    description: 'Assertion (A) and Reason (R) statements with standard letter codes.',
    markdownExample: `correctCode: A
---
Assertion (A): ...
Reason (R): ...

- [x] Both A and R are true and R is the correct explanation of A.
- [ ] Both A and R are true but R is NOT the correct explanation of A.
- [ ] A is true but R is false.
- [ ] A is false but R is true.`,
    jsonExample: `"correctCode": "A"`,
  },
  {
    id: 'passage',
    label: 'Passage / Common Stimulus',
    description: 'Multiple questions linked to a shared reading passage via questionGroupId.',
    markdownExample: `questionGroupId: passage-thermo-01
---
Based on the passage above, calculate...`,
    jsonExample: `"questionGroupId": "passage-thermo-01"`,
  },
];

/**
 * Builds the authoritative Markdown format contract suffix.
 * Extremely strict against conversational noise, intro, greetings, footers, and code fences.
 */
export function buildMarkdownFormatSuffix(selectedTypes?: string[]): string {
  const typesToInclude =
    selectedTypes && selectedTypes.length > 0
      ? SUPPORTED_QUESTION_TYPES.filter((t) => selectedTypes.includes(t.id))
      : SUPPORTED_QUESTION_TYPES;

  const typeRules = typesToInclude
    .map((t) => `• Type "${t.id}" (${t.label}):\n${t.markdownExample}`)
    .join('\n\n');

  return `
--------------------------------------------------------------------------------
takemock — MANDATORY FORMAT CONTRACT (Zero Conversational Text Allowed)
--------------------------------------------------------------------------------
CRITICAL INSTRUCTION: Output ONLY raw machine-readable questions starting immediately with '---'.
- NO conversational greetings ("Here are your questions:", "Certainly!").
- NO markdown code block wrappers (do NOT wrap output in \`\`\`markdown or \`\`\` or \`\`\`yaml).
- NO closing commentary, explanations, or sign-offs ("Hope this helps!").
- Output pure, unadorned Takemock Markdown v2 ONLY. Extra conversational text breaks the parser.

MANDATORY SYNTAX RULES:
1. Question Delimiter: Separate multiple questions using EXACTLY '=== question ===' on its own line. Do NOT prefix with '#' or '##' (NO '## === question ===').
2. YAML Frontmatter: EVERY question MUST have its own YAML frontmatter enclosed between BOTH opening '---' AND closing '---'. Never omit the closing '---' before the question text.
3. Numerical & Multi-Select Parameters:
   - For numerical questions: 'correctValue', 'toleranceAbsolute', and 'unit' MUST be placed inside the YAML frontmatter between '---' and '---', NOT in the question body.
   - For multi-select questions: 'allowPartialCredit: true' MUST be placed in frontmatter.
4. Options: Mark correct with '- [x]' and incorrect with '- [ ]'.
5. Math & LaTeX: Format all inline math with $...$ and display equations with $$...$$.
6. Solutions: Every question MUST provide a step-by-step derivation inside :::solution ... :::.

Canonical Multi-Question Structure Example:
---
schemaVersion: "2.0"
id: sample-subject-01
type: single_choice
subject: Science
topic: Mechanics
difficulty: easy
marks: 4
negativeMarks: 1
tags: [example-tag]
---

State the question text clearly here with LaTeX math like $F = ma$:

- [ ] Plausible distractor A
- [x] Correct option B
- [ ] Plausible distractor C
- [ ] Plausible distractor D

:::solution
Step-by-step derivation and proof of the correct answer.
:::

=== question ===

---
schemaVersion: "2.0"
id: sample-subject-02
type: numerical
subject: Science
topic: Mechanics
difficulty: medium
marks: 4
negativeMarks: 0
correctValue: 42
toleranceAbsolute: 0.1
unit: "m/s"
tags: [velocity]
---

Calculate the final velocity in m/s:

:::solution
Derivation proving the calculated numerical answer of 42.
:::

Question Type Formatting Reference:
${typeRules}
`.trim();
}

/**
 * Builds the authoritative JSON format contract suffix.
 */
export function buildJsonFormatSuffix(selectedTypes?: string[]): string {
  const typesList =
    selectedTypes && selectedTypes.length > 0
      ? selectedTypes.join(' | ')
      : 'single_choice | multiple_choice | numerical | true_false | integer';

  return `
--------------------------------------------------------------------------------
takemock — MANDATORY JSON FORMAT CONTRACT (Zero Conversational Text Allowed)
--------------------------------------------------------------------------------
CRITICAL INSTRUCTION: Output ONLY a valid JSON array of question objects starting immediately with '['.
- NO conversational greetings ("Here are your questions:", "Certainly!").
- NO markdown code block wrappers (do NOT wrap output in \`\`\`json or \`\`\`).
- NO closing commentary, explanations, or sign-offs.

Every question must adhere to this JSON structure:
[
  {
    "schemaVersion": "2.0",
    "id": "subject-topic-001",
    "type": "${typesList}",
    "subject": "<Subject>",
    "topic": "<Topic>",
    "difficulty": "medium",
    "marks": 4,
    "negativeMarks": 1,
    "tags": ["tag1", "tag2"],
    "body": "Question text with LaTeX formulas like $E = mc^2$...",
    "options": [
      { "id": "opt_0", "text": "Option A", "isCorrect": false },
      { "id": "opt_1", "text": "Option B", "isCorrect": true }
    ],
    "solution": "Step-by-step derivation proving the stored answer."
  }
]

Note for numerical questions: Omit options and include "correctValue": <number>, "toleranceAbsolute": <number>, "unit": "<unit>".
`.trim();
}

/**
 * Builds the authoritative Full Paper Markdown blueprint contract suffix.
 */
export function buildFullPaperMarkdownSuffix(selectedTypes?: string[]): string {
  const typesToInclude =
    selectedTypes && selectedTypes.length > 0
      ? SUPPORTED_QUESTION_TYPES.filter((t) => selectedTypes.includes(t.id))
      : SUPPORTED_QUESTION_TYPES;

  const typeRules = typesToInclude
    .map((t) => `• Type "${t.id}" (${t.label}):\n${t.markdownExample}`)
    .join('\n\n');

  return `
--------------------------------------------------------------------------------
takemock — MANDATORY FULL PAPER BLUEPRINT CONTRACT (Zero Conversational Text Allowed)
--------------------------------------------------------------------------------
CRITICAL INSTRUCTION: Output ONLY a complete, machine-readable mock paper starting immediately with '---'.
- NO conversational greetings ("Here is your exam paper:").
- NO markdown code block wrappers (do NOT wrap in \`\`\`markdown or \`\`\`).
- NO closing commentary, explanations, or sign-offs.

MANDATORY PAPER STRUCTURE:
1. Top-Level Paper Frontmatter: The document MUST begin with the exam parameters between '---' and '---':
---
title: <Exam Title>
durationMinutes: <Duration in minutes, e.g. 90>
mode: EXAM
instructions: <Optional candidate instructions>
---

2. Section Delimiters: Separate distinct subjects or exam sections using '# Section: <Section Name>' on its own line:
# Section: <Section Name>

3. Question Formatting (Takemock Markdown v2):
- Each question MUST have its own YAML frontmatter between '---' and '---' containing: schemaVersion: "2.0", id, type, subject, topic, marks, negativeMarks.
- Options: Mark correct with '- [x]' and incorrect with '- [ ]'.
- Numerical: 'correctValue: <number>', 'toleranceAbsolute: <number>', 'unit: "<unit>"' in frontmatter.
- Solutions: Every question MUST include ':::solution\\n...\\n:::'.
- Delimiter: Separate multiple questions within a section with '=== question ==='.

Full Paper Layout Example:
---
title: Advanced Science Full Mock
durationMinutes: 90
mode: EXAM
---

# Section: Physics

---
schemaVersion: "2.0"
id: phy-01
type: single_choice
subject: Physics
topic: Mechanics
marks: 4
negativeMarks: 1
---
A body starts from rest with acceleration $a = 2\\text{ m/s}^2$. Find its velocity after $5\\text{ s}$:
- [x] $10\\text{ m/s}$
- [ ] $20\\text{ m/s}$
- [ ] $5\\text{ m/s}$
- [ ] $25\\text{ m/s}$

:::solution
$v = u + at = 0 + 2 \\times 5 = 10\\text{ m/s}$.
:::

=== question ===

---
schemaVersion: "2.0"
id: phy-02
type: numerical
subject: Physics
topic: Energy
marks: 4
negativeMarks: 0
correctValue: 50
toleranceAbsolute: 0.5
unit: "J"
---
Calculate work done in Joules:

:::solution
$W = F \\times d = 10 \\times 5 = 50\\text{ J}$.
:::

# Section: Chemistry

---
schemaVersion: "2.0"
id: chem-01
type: single_choice
subject: Chemistry
topic: Atomic Structure
marks: 4
negativeMarks: 1
---
Question text here...
- [x] Correct Option
- [ ] Distractor

:::solution
Explanation here.
:::

Question Type Reference:
${typeRules}
`.trim();
}

/**
 * Builds the authoritative Full Paper JSON contract suffix.
 */
export function buildFullPaperJsonSuffix(selectedTypes?: string[]): string {
  const typesList =
    selectedTypes && selectedTypes.length > 0
      ? selectedTypes.join(' | ')
      : 'single_choice | multiple_choice | numerical | true_false | integer';

  return `
--------------------------------------------------------------------------------
takemock — MANDATORY FULL PAPER JSON CONTRACT (Zero Conversational Text Allowed)
--------------------------------------------------------------------------------
CRITICAL INSTRUCTION: Output ONLY a valid JSON object starting immediately with '{'.
- NO conversational greetings.
- NO code block wrappers (do NOT wrap in \`\`\`json or \`\`\`).
- NO closing commentary.

Structure:
{
  "schemaVersion": "2.0",
  "title": "<Exam Title>",
  "durationMinutes": 90,
  "mode": "EXAM",
  "sections": [
    {
      "id": "sec_1",
      "title": "Section 1: <Section Name>",
      "questions": [
        {
          "schemaVersion": "2.0",
          "id": "q-01",
          "type": "${typesList}",
          "subject": "<Subject>",
          "topic": "<Topic>",
          "difficulty": "medium",
          "marks": 4,
          "negativeMarks": 1,
          "tags": ["tag1"],
          "body": "Question text with LaTeX like $F = ma$...",
          "options": [
            { "id": "opt_0", "text": "Option A", "isCorrect": false },
            { "id": "opt_1", "text": "Option B", "isCorrect": true }
          ],
          "solution": "Step-by-step derivation proving the stored answer."
        }
      ]
    }
  ]
}

Note for numerical questions: Omit options and include "correctValue": <number>, "toleranceAbsolute": <number>, "unit": "<unit>".
`.trim();
}

/**
 * Returns the authoritative format suffix.
 */
export function buildLlmFormatSuffix(
  format: OutputFormat = 'MARKDOWN',
  selectedTypes?: string[],
  target: GenerationTarget = 'QUESTION_PACK',
): string {
  if (target === 'FULL_PAPER') {
    return format === 'JSON'
      ? buildFullPaperJsonSuffix(selectedTypes)
      : buildFullPaperMarkdownSuffix(selectedTypes);
  }
  return format === 'JSON'
    ? buildJsonFormatSuffix(selectedTypes)
    : buildMarkdownFormatSuffix(selectedTypes);
}

/**
 * Assembles a full prompt by appending the authoritative format contract suffix to the user's natural prompt.
 */
export function buildLlmFullPrompt(params: {
  userPrompt: string;
  format?: OutputFormat;
  selectedTypes?: string[];
  target?: GenerationTarget;
}): string {
  const suffix = buildLlmFormatSuffix(params.format, params.selectedTypes, params.target);
  return `${params.userPrompt.trim()}\n\n${suffix}`;
}

/**
 * Universal System Prompt for Custom GPTs, Claude Projects, or Ollama Modelfile.
 */
export function buildLlmSystemPrompt(
  format: OutputFormat = 'MARKDOWN',
  target: GenerationTarget = 'QUESTION_PACK',
): string {
  const targetDesc = target === 'FULL_PAPER' ? 'complete mock exam papers' : 'assessment questions';
  return `You are the Takemock Exam Authoring Assistant.
Your sole role is to produce rigorous, authentic ${targetDesc} formatted strictly according to the Takemock Specification.

Format Rules:
1. Always output ONLY valid ${
    format === 'JSON'
      ? target === 'FULL_PAPER'
        ? 'JSON object'
        : 'JSON array'
      : 'takemock Markdown v2'
  } without conversational text or greetings.
2. In Markdown, begin directly with '---' YAML frontmatter.${
    target === 'FULL_PAPER'
      ? " Separate sections with '# Section: <Name>'."
      : " Separate questions with '=== question ==='."
  }
3. Always format all math and scientific expressions with LaTeX $...$ or $$...$$.
4. Always provide an authentic, step-by-step derivation in the solution.
5. Distractors (incorrect options) must be realistic misconceptions.
`.trim();
}
