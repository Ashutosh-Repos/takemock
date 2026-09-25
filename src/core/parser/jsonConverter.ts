/**
 * Bidirectional JSON Question Converter for takemock.
 * Adheres strictly to docs/markdown_format_spec_v2.md Section 25 &
 * docs/master_architecture_prompt_v2.md Section 47.
 */

import type { QuestionModel, ValidationDiagnostic } from '@/types/question';
import { questionRegistry } from '../engine/registry';

export interface JsonParseResult {
  questions: QuestionModel[];
  diagnostics: Array<{
    questionIndex: number;
    questionId?: string;
    diagnostics: ValidationDiagnostic[];
  }>;
  hasErrors: boolean;
}

/**
 * Validates and parses raw JSON string containing a single QuestionModel or QuestionModel[].
 */
export function parseJsonQuestions(rawJson: string): JsonParseResult {
  const diagnosticsList: JsonParseResult['diagnostics'] = [];
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawJson);
  } catch (err: any) {
    return {
      questions: [],
      diagnostics: [
        {
          questionIndex: -1,
          diagnostics: [
            {
              level: 'ERROR',
              code: 'INVALID_JSON',
              message: `Malformed JSON: ${err.message || 'Syntax error'}`,
            },
          ],
        },
      ],
      hasErrors: true,
    };
  }

  const rawArray = Array.isArray(parsed) ? parsed : [parsed];
  const questions: QuestionModel[] = [];
  let hasErrors = false;

  rawArray.forEach((item, idx) => {
    const itemDiags: ValidationDiagnostic[] = [];

    if (typeof item !== 'object' || item === null) {
      itemDiags.push({
        level: 'ERROR',
        code: 'INVALID_OBJECT',
        message: 'Each question in JSON must be an object',
      });
      diagnosticsList.push({ questionIndex: idx, diagnostics: itemDiags });
      hasErrors = true;
      return;
    }

    const q = item as Partial<QuestionModel>;

    if (!q.id) {
      itemDiags.push({
        level: 'ERROR',
        code: 'MISSING_ID',
        message: 'Question must define a valid "id"',
        field: 'id',
      });
    }

    if (!q.type) {
      itemDiags.push({
        level: 'ERROR',
        code: 'MISSING_TYPE',
        message: 'Question must define a valid "type"',
        field: 'type',
      });
    }

    if (!q.body) {
      itemDiags.push({
        level: 'ERROR',
        code: 'MISSING_BODY',
        message: 'Question must define "body" content',
        field: 'body',
      });
    }

    if (q.type && questionRegistry.has(q.type)) {
      const typeDiags = questionRegistry.validate(q as QuestionModel);
      itemDiags.push(...typeDiags);
    } else if (q.type) {
      itemDiags.push({
        level: 'ERROR',
        code: 'UNKNOWN_TYPE',
        message: `Unsupported question type: "${q.type}"`,
        field: 'type',
      });
    }

    const itemHasErrors = itemDiags.some((d) => d.level === 'ERROR');
    if (itemHasErrors) {
      hasErrors = true;
    } else {
      const normalized = questionRegistry.normalize(q as QuestionModel);
      questions.push(normalized);
    }

    diagnosticsList.push({
      questionIndex: idx,
      questionId: q.id,
      diagnostics: itemDiags,
    });
  });

  return { questions, diagnostics: diagnosticsList, hasErrors };
}

/**
 * Serializes QuestionModel[] to formatted JSON string.
 */
export function serializeJsonQuestions(questions: QuestionModel[]): string {
  return JSON.stringify(questions, null, 2);
}
