/**
 * Canonical Markdown Question Serializer v2.0 for takemock.
 * Converts QuestionModel back into canonical Markdown v2 adhering strictly to
 * docs/markdown_format_spec_v2.md
 */

import YAML from 'yaml';
import type { QuestionModel } from '@/types/question';

export function serializeSingleQuestion(q: QuestionModel): string {
  // 1. Prepare Frontmatter object (clean omitted undefined fields)
  const frontmatterObj: Record<string, any> = {
    schemaVersion: q.schemaVersion || '2.0',
    id: q.id,
    type: q.type,
  };

  if (q.version && q.version > 1) frontmatterObj.version = q.version;
  if (q.subject && q.subject !== 'General') frontmatterObj.subject = q.subject;
  if (q.topic && q.topic !== 'General') frontmatterObj.topic = q.topic;
  if (q.subtopic) frontmatterObj.subtopic = q.subtopic;
  if (q.difficulty && q.difficulty !== 'medium') frontmatterObj.difficulty = q.difficulty;
  if (q.marks !== undefined) frontmatterObj.marks = q.marks;
  if (q.negativeMarks !== undefined && q.negativeMarks > 0)
    frontmatterObj.negativeMarks = q.negativeMarks;
  if (q.tags && q.tags.length > 0) frontmatterObj.tags = q.tags;
  if (q.source) frontmatterObj.source = q.source;
  if (q.sourceYear) frontmatterObj.sourceYear = q.sourceYear;
  if (q.exam) frontmatterObj.exam = q.exam;
  if (q.estimatedTimeSeconds) frontmatterObj.estimatedTimeSeconds = q.estimatedTimeSeconds;
  if (q.questionGroupId) frontmatterObj.questionGroupId = q.questionGroupId;
  if (q.allowPartialCredit) frontmatterObj.allowPartialCredit = q.allowPartialCredit;
  if (q.toleranceAbsolute !== undefined) frontmatterObj.toleranceAbsolute = q.toleranceAbsolute;
  if (q.toleranceRelative !== undefined) frontmatterObj.toleranceRelative = q.toleranceRelative;
  if (q.unit) frontmatterObj.unit = q.unit;
  if (q.correctCode) frontmatterObj.correctCode = q.correctCode;
  if (q.correctValue !== undefined) frontmatterObj.correctValue = q.correctValue;
  if (q.acceptedAnswers && q.acceptedAnswers.length > 0)
    frontmatterObj.acceptedAnswers = q.acceptedAnswers;
  if (q.caseSensitive !== undefined) frontmatterObj.caseSensitive = q.caseSensitive;

  const yamlString = YAML.stringify(frontmatterObj).trim();

  const parts: string[] = [];
  parts.push('---');
  parts.push(yamlString);
  parts.push('---');
  parts.push('');
  parts.push(q.body.trim());

  // 2. Options (if applicable)
  if (q.options && q.options.length > 0) {
    parts.push('');
    for (const opt of q.options) {
      const checkbox = opt.isCorrect ? '[x]' : '[ ]';
      parts.push(`- ${checkbox} ${opt.text}`);
    }
  }

  // 3. Match format (if applicable)
  if (q.type === 'match' && q.matches && q.matches.length > 0) {
    parts.push('');
    parts.push(':::answer');
    for (const m of q.matches) {
      parts.push(`${m.left} -> ${m.right}`);
    }
    parts.push(':::');
  }

  // 4. Solution block
  if (q.solution && q.solution.trim()) {
    parts.push('');
    parts.push(':::solution');
    parts.push(q.solution.trim());
    parts.push(':::');
  }

  return parts.join('\n');
}

/**
 * Serializes multiple questions with the canonical delimiter `=== question ===`.
 */
export function serializeMarkdownQuestions(questions: QuestionModel[]): string {
  return questions.map(serializeSingleQuestion).join('\n\n=== question ===\n\n');
}
