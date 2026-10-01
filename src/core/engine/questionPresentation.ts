/**
 * Shared Question Presentation & Response Formatting Utilities.
 * Converts raw internal representations (e.g. "opt_1", "single_choice") into human-friendly,
 * unambiguous display text for candidates during tests, scorecards, and solution reviews.
 */

import type { QuestionModel, QuestionOption, QuestionType } from '@/types/question';

/**
 * Returns a student-friendly label for question types.
 */
export function formatQuestionType(type: QuestionType | string): string {
  switch (type) {
    case 'single_choice':
      return 'Single Choice (MCQ)';
    case 'multiple_choice':
      return 'Multiple Correct';
    case 'true_false':
      return 'True / False';
    case 'numerical':
      return 'Numerical Value';
    case 'integer':
      return 'Integer Answer';
    case 'fill_blank':
      return 'Fill in Blank';
    case 'match':
      return 'Match the Following';
    case 'assertion_reason':
      return 'Assertion & Reason';
    case 'passage':
      return 'Passage-based';
    case 'image_based':
      return 'Diagram / Visual';
    default:
      return String(type || 'Question').replace(/_/g, ' ');
  }
}

/**
 * Strips any residual YAML metadata lines that may have leaked into question body.
 */
export function cleanQuestionBody(body: string): string {
  if (!body) return '';
  const lines = body.split(/\r?\n/);
  const metadataKeys = new Set([
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
    'unit',
    'correctcode',
    'correctvalue',
    'acceptedanswers',
    'casesensitive',
  ]);

  let startIdx = 0;
  while (startIdx < lines.length) {
    const trimmed = lines[startIdx].trim();
    if (!trimmed) {
      startIdx++;
      continue;
    }
    const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*:(.*)$/);
    if (match && metadataKeys.has(match[1].toLowerCase())) {
      startIdx++;
      continue;
    }
    break;
  }

  return lines.slice(startIdx).join('\n').trim();
}

/**
 * Determines whether a given option was selected by the candidate.
 * Guarantees zero false positives from option text content matching.
 */
export function isOptionSelectedByCandidate(
  _question: QuestionModel,
  option: QuestionOption,
  optionIndex: number,
  candidateResponse: unknown,
): boolean {
  if (candidateResponse === undefined || candidateResponse === null || candidateResponse === '') {
    return false;
  }

  const letter = String.fromCharCode(65 + optionIndex).toUpperCase();
  const optId = option.id;

  const matchesSingle = (val: unknown): boolean => {
    if (val === undefined || val === null) return false;
    const strVal = String(val).trim().toUpperCase();

    // 1. Direct ID match
    if (val === optId || strVal === optId.toUpperCase()) return true;

    // 2. Letter match: e.g. "A", "B", "C", "D"
    if (strVal === letter) return true;

    // 3. Index match: e.g. "opt_0", "opt_1" or "0", "1"
    if (strVal === `OPT_${optionIndex}` || strVal === String(optionIndex)) return true;

    return false;
  };

  if (Array.isArray(candidateResponse)) {
    return candidateResponse.some(matchesSingle);
  }

  return matchesSingle(candidateResponse);
}

/**
 * Formats candidate responses cleanly into human-readable text.
 * e.g. "opt_1" -> "Option (B)"
 */
export function formatCandidateResponse(
  question: QuestionModel,
  response: unknown,
): { label: string; text?: string; isAttempted: boolean } {
  if (response === undefined || response === null || response === '') {
    return { label: 'Unattempted', isAttempted: false };
  }

  const options = question.options || [];

  switch (question.type) {
    case 'single_choice':
    case 'image_based':
    case 'passage': {
      // Find which option was chosen
      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        if (isOptionSelectedByCandidate(question, opt, i, response)) {
          const letter = String.fromCharCode(65 + i);
          return {
            label: `Option (${letter})`,
            text: opt.text,
            isAttempted: true,
          };
        }
      }
      return {
        label: String(response),
        isAttempted: true,
      };
    }

    case 'multiple_choice': {
      if (!Array.isArray(response) || response.length === 0) {
        return { label: 'Unattempted', isAttempted: false };
      }
      const chosenLetters: string[] = [];
      const chosenTexts: string[] = [];

      options.forEach((opt, i) => {
        if (isOptionSelectedByCandidate(question, opt, i, response)) {
          const letter = String.fromCharCode(65 + i);
          chosenLetters.push(`(${letter})`);
          chosenTexts.push(opt.text);
        }
      });

      if (chosenLetters.length > 0) {
        return {
          label: `Options ${chosenLetters.join(', ')}`,
          text: chosenTexts.join('; '),
          isAttempted: true,
        };
      }
      return {
        label: response.join(', '),
        isAttempted: true,
      };
    }

    case 'assertion_reason': {
      const respStr = String(response).trim().toUpperCase();
      let letter = respStr;
      const optMatch = respStr.match(/^OPT_(\d+)$/);
      if (optMatch) {
        letter = String.fromCharCode(65 + parseInt(optMatch[1], 10));
      } else if (/^\d+$/.test(respStr)) {
        letter = String.fromCharCode(65 + parseInt(respStr, 10));
      }

      const foundOpt = options.find(
        (o, i) => o.id.toUpperCase() === letter || String.fromCharCode(65 + i) === letter,
      );

      return {
        label: `Option (${letter})`,
        text: foundOpt?.text,
        isAttempted: true,
      };
    }

    case 'true_false': {
      const respStr = String(response).trim();
      const isTrue = respStr.toLowerCase() === 'true' || respStr === 'opt_0';
      return {
        label: isTrue ? 'True' : 'False',
        isAttempted: true,
      };
    }

    case 'numerical':
    case 'integer': {
      return {
        label: `${String(response)}${question.unit ? ' ' + question.unit : ''}`,
        isAttempted: true,
      };
    }

    case 'fill_blank': {
      return {
        label: String(response),
        isAttempted: true,
      };
    }

    case 'match': {
      if (typeof response === 'object' && response !== null) {
        const pairs = Object.entries(response as Record<string, string>)
          .map(([k, v]) => `${k} → ${v}`)
          .join(', ');
        return {
          label: pairs || 'Empty match',
          isAttempted: Boolean(pairs),
        };
      }
      return {
        label: String(response),
        isAttempted: true,
      };
    }

    default:
      return {
        label: typeof response === 'object' ? JSON.stringify(response) : String(response),
        isAttempted: true,
      };
  }
}

/**
 * Formats the correct answer for display on scorecards and reviews.
 */
export function formatCorrectAnswer(
  question: QuestionModel,
): { label: string; text?: string } {
  const options = question.options || [];

  switch (question.type) {
    case 'single_choice':
    case 'image_based':
    case 'passage': {
      let correctIdx = options.findIndex((o) => o.isCorrect);
      if (correctIdx === -1 && question.correctCode) {
        const code = String(question.correctCode).trim().toUpperCase();
        if (/^[A-Z]$/.test(code)) {
          correctIdx = code.charCodeAt(0) - 65;
        }
      }
      if (correctIdx >= 0 && correctIdx < options.length) {
        const letter = String.fromCharCode(65 + correctIdx);
        return {
          label: `Option (${letter})`,
          text: options[correctIdx].text,
        };
      }
      return { label: 'Not specified' };
    }

    case 'multiple_choice': {
      const correctIndices: number[] = [];
      const texts: string[] = [];
      options.forEach((o, i) => {
        if (o.isCorrect) {
          correctIndices.push(i);
          texts.push(o.text);
        }
      });
      const letters = correctIndices.map((i) => `(${String.fromCharCode(65 + i)})`).join(', ');
      return {
        label: `Options ${letters}`,
        text: texts.join('; '),
      };
    }

    case 'assertion_reason': {
      const code = (question.correctCode || 'A').toUpperCase();
      const idx = code.charCodeAt(0) - 65;
      const opt = options[idx];
      return {
        label: `Option (${code})`,
        text: opt?.text,
      };
    }

    case 'true_false': {
      const trueOpt = options.find((o) => o.text.toLowerCase() === 'true');
      return {
        label: trueOpt?.isCorrect ? 'True' : 'False',
      };
    }

    case 'numerical':
    case 'integer': {
      return {
        label: `${question.correctValue ?? 'N/A'}${question.unit ? ' ' + question.unit : ''}`,
      };
    }

    case 'fill_blank': {
      return {
        label: (question.acceptedAnswers || []).join(' / ') || 'N/A',
      };
    }

    case 'match': {
      const matches = question.matches || [];
      return {
        label: matches.map((m) => `${m.left} → ${m.right}`).join(', ') || 'N/A',
      };
    }

    default:
      return { label: 'Verified Solution' };
  }
}
