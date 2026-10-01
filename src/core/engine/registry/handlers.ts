/**
 * Type handlers for all 10 canonical takemock question types.
 * Adheres strictly to docs/master_architecture_prompt_v2.md and docs/markdown_format_spec_v2.md
 */

import type { CandidateQuestionView, QuestionModel, ValidationDiagnostic } from '@/types/question';
import type { QuestionScore } from '@/types/scoring';
import type { ScoringPolicy } from '@/types/test';
import type { QuestionTypeHandler } from './types';

// Helper to sanitize base fields for candidate-facing delivery (stripping private answers)
function sanitizeBase(q: QuestionModel): CandidateQuestionView {
  return {
    id: q.id,
    version: q.version || 1,
    type: q.type,
    subject: q.subject,
    topic: q.topic,
    difficulty: q.difficulty,
    marks: q.marks,
    negativeMarks: q.negativeMarks,
    body: q.body,
    unit: q.unit,
    imageUrl: q.imageUrl,
    imageAlt: q.imageAlt,
    estimatedTimeSeconds: q.estimatedTimeSeconds,
    questionGroupId: q.questionGroupId,
  };
}

// Helper to normalize metadata
function normalizeBase(q: QuestionModel): QuestionModel {
  return {
    ...q,
    schemaVersion: q.schemaVersion || '2.0',
    version: q.version || 1,
    subject: (q.subject || 'General').trim(),
    topic: (q.topic || 'General').trim(),
    difficulty: q.difficulty || 'medium',
    marks: typeof q.marks === 'number' && q.marks > 0 ? q.marks : 4,
    negativeMarks:
      typeof q.negativeMarks === 'number' && q.negativeMarks >= 0 ? q.negativeMarks : 0,
    tags: Array.isArray(q.tags) ? q.tags.map((t) => t.trim().toLowerCase()).filter(Boolean) : [],
    body: (q.body || '').trim(),
  };
}

/* ============================================================================
   1. Single Choice
   ============================================================================ */
export const SingleChoiceHandler: QuestionTypeHandler<string> = {
  type: 'single_choice',

  validate(q: QuestionModel): ValidationDiagnostic[] {
    const diags: ValidationDiagnostic[] = [];
    if (!q.id)
      diags.push({ level: 'ERROR', code: 'MISSING_ID', message: 'Question ID is required' });
    if (!q.body)
      diags.push({
        level: 'ERROR',
        code: 'MISSING_BODY',
        message: 'Question body text is required',
      });

    const options = q.options || [];
    if (options.length < 2) {
      diags.push({
        level: 'ERROR',
        code: 'INSUFFICIENT_OPTIONS',
        message: `single_choice requires at least 2 options, found ${options.length}`,
      });
    }

    const correctOptions = options.filter((o) => o.isCorrect);
    if (correctOptions.length !== 1) {
      diags.push({
        level: 'ERROR',
        code: 'INVALID_CORRECT_COUNT',
        message: `single_choice must have exactly 1 correct option, found ${correctOptions.length}`,
      });
    }

    // Check duplicate options
    const texts = new Set<string>();
    for (const opt of options) {
      const norm = opt.text.trim().toLowerCase();
      if (texts.has(norm)) {
        diags.push({
          level: 'WARNING',
          code: 'DUPLICATE_OPTION',
          message: `Duplicate option text found: "${opt.text}"`,
        });
      }
      texts.add(norm);
    }

    if (!q.solution) {
      diags.push({
        level: 'WARNING',
        code: 'MISSING_SOLUTION',
        message: 'Solution explanation is recommended',
      });
    }
    return diags;
  },

  normalize(q: QuestionModel): QuestionModel {
    const base = normalizeBase(q);
    const options = (base.options || []).map((opt, idx) => ({
      id: opt.id || `opt_${idx}`,
      text: opt.text.trim(),
      isCorrect: Boolean(opt.isCorrect),
      explanation: opt.explanation?.trim(),
    }));

    // If no option was flagged isCorrect, but correctCode exists (e.g. "B" or "opt_1" or "2")
    if (!options.some((o) => o.isCorrect) && base.correctCode) {
      const code = String(base.correctCode).trim().toUpperCase();
      let matchIdx = -1;
      if (/^[A-Z]$/.test(code)) {
        matchIdx = code.charCodeAt(0) - 65;
      } else if (/^\d+$/.test(code)) {
        const num = parseInt(code, 10);
        matchIdx = num >= 1 && num <= options.length ? num - 1 : num;
      }
      if (matchIdx >= 0 && matchIdx < options.length) {
        options[matchIdx].isCorrect = true;
      } else {
        const byId = options.find((o) => o.id.toUpperCase() === code);
        if (byId) byId.isCorrect = true;
      }
    }

    return {
      ...base,
      options,
    };
  },

  score(
    q: QuestionModel,
    response: string | undefined,
    _policy: ScoringPolicy,
    timeSpent: number,
  ): QuestionScore {
    const options = q.options || [];
    let correctOpt = options.find((o) => o.isCorrect);

    // Resilient fallback to correctCode if isCorrect wasn't explicitly flagged
    if (!correctOpt && q.correctCode) {
      const code = String(q.correctCode).trim().toUpperCase();
      const letterIdx = /^[A-Z]$/.test(code) ? code.charCodeAt(0) - 65 : -1;
      if (letterIdx >= 0 && letterIdx < options.length) {
        correctOpt = options[letterIdx];
      } else {
        correctOpt = options.find((o) => o.id.toUpperCase() === code);
      }
    }

    const correctAnswer = correctOpt ? correctOpt.id : '';

    if (!response || String(response).trim() === '') {
      return {
        questionId: q.id,
        status: 'UNATTEMPTED',
        marksAwarded: 0,
        maxMarks: q.marks,
        negativeMarks: q.negativeMarks,
        candidateResponse: null,
        correctAnswer,
        explanation: q.solution,
        timeSpentSeconds: timeSpent,
      };
    }

    const respStr = String(response).trim();
    // Resolve candidate option by ID, letter (A, B, C, D...), or index (opt_0, 0, 1...)
    const candidateOpt = options.find((o, idx) => {
      if (o.id === respStr || o.id.toUpperCase() === respStr.toUpperCase()) return true;
      const letter = String.fromCharCode(65 + idx);
      if (letter.toUpperCase() === respStr.toUpperCase()) return true;
      if (respStr === `opt_${idx}` || respStr.toUpperCase() === `OPT_${idx}` || respStr === String(idx)) return true;
      return false;
    });

    const isCorrect = Boolean(
      (correctOpt && candidateOpt && candidateOpt.id === correctOpt.id) ||
      (correctOpt && (respStr === correctOpt.id || respStr.toUpperCase() === q.correctCode?.toUpperCase()))
    );

    return {
      questionId: q.id,
      status: isCorrect ? 'CORRECT' : 'INCORRECT',
      marksAwarded: isCorrect ? q.marks : -q.negativeMarks,
      maxMarks: q.marks,
      negativeMarks: q.negativeMarks,
      candidateResponse: candidateOpt ? candidateOpt.id : respStr,
      correctAnswer,
      explanation: q.solution,
      timeSpentSeconds: timeSpent,
    };
  },

  sanitizeForCandidate(q: QuestionModel): CandidateQuestionView {
    const base = sanitizeBase(q);
    return {
      ...base,
      options: (q.options || []).map((o) => ({ id: o.id, text: o.text })),
    };
  },
};

/* ============================================================================
   2. Multiple Choice
   ============================================================================ */
export const MultipleChoiceHandler: QuestionTypeHandler<string[]> = {
  type: 'multiple_choice',

  validate(q: QuestionModel): ValidationDiagnostic[] {
    const diags: ValidationDiagnostic[] = [];
    if (!q.id)
      diags.push({ level: 'ERROR', code: 'MISSING_ID', message: 'Question ID is required' });
    if (!q.body)
      diags.push({
        level: 'ERROR',
        code: 'MISSING_BODY',
        message: 'Question body text is required',
      });

    const options = q.options || [];
    if (options.length < 2) {
      diags.push({
        level: 'ERROR',
        code: 'INSUFFICIENT_OPTIONS',
        message: `multiple_choice requires at least 2 options, found ${options.length}`,
      });
    }

    const correctCount = options.filter((o) => o.isCorrect).length;
    if (correctCount < 1) {
      diags.push({
        level: 'ERROR',
        code: 'NO_CORRECT_OPTION',
        message: 'multiple_choice must have at least 1 correct option',
      });
    }
    if (correctCount === options.length) {
      diags.push({
        level: 'ERROR',
        code: 'NO_DISTRACTORS',
        message: 'multiple_choice must have at least 1 distractor (incorrect option)',
      });
    }
    return diags;
  },

  normalize(q: QuestionModel): QuestionModel {
    const base = normalizeBase(q);
    return {
      ...base,
      options: (base.options || []).map((opt, idx) => ({
        id: opt.id || `opt_${idx}`,
        text: opt.text.trim(),
        isCorrect: Boolean(opt.isCorrect),
      })),
    };
  },

  score(
    q: QuestionModel,
    response: string[] | undefined,
    policy: ScoringPolicy,
    timeSpent: number,
  ): QuestionScore {
    const options = q.options || [];
    const correctOptions = options.filter((o) => o.isCorrect);
    const correctIds = new Set(correctOptions.map((o) => o.id));
    const correctAnswer = Array.from(correctIds);

    if (!response || !Array.isArray(response) || response.length === 0) {
      return {
        questionId: q.id,
        status: 'UNATTEMPTED',
        marksAwarded: 0,
        maxMarks: q.marks,
        negativeMarks: q.negativeMarks,
        candidateResponse: [],
        correctAnswer,
        explanation: q.solution,
        timeSpentSeconds: timeSpent,
      };
    }

    // Resolve every candidate response item to canonical option ID
    const resolvedCandidateIds = new Set<string>();
    for (const item of response) {
      const itemStr = String(item).trim();
      const matchedOpt = options.find((o, idx) => {
        if (o.id === itemStr || o.id.toUpperCase() === itemStr.toUpperCase()) return true;
        const letter = String.fromCharCode(65 + idx);
        if (letter.toUpperCase() === itemStr.toUpperCase()) return true;
        if (itemStr === `opt_${idx}` || itemStr.toUpperCase() === `OPT_${idx}` || itemStr === String(idx)) return true;
        return false;
      });
      if (matchedOpt) {
        resolvedCandidateIds.add(matchedOpt.id);
      } else {
        resolvedCandidateIds.add(itemStr);
      }
    }

    let correctSelected = 0;
    let incorrectSelected = 0;

    for (const id of resolvedCandidateIds) {
      if (correctIds.has(id)) {
        correctSelected++;
      } else {
        incorrectSelected++;
      }
    }

    // Fully correct: all correct chosen, zero incorrect
    if (correctSelected === correctIds.size && incorrectSelected === 0) {
      return {
        questionId: q.id,
        status: 'CORRECT',
        marksAwarded: q.marks,
        maxMarks: q.marks,
        negativeMarks: q.negativeMarks,
        candidateResponse: response,
        correctAnswer,
        explanation: q.solution,
        timeSpentSeconds: timeSpent,
      };
    }

    // Any incorrect chosen -> full negative penalty
    if (incorrectSelected > 0) {
      return {
        questionId: q.id,
        status: 'INCORRECT',
        marksAwarded: -q.negativeMarks,
        maxMarks: q.marks,
        negativeMarks: q.negativeMarks,
        candidateResponse: response,
        correctAnswer,
        explanation: q.solution,
        timeSpentSeconds: timeSpent,
      };
    }

    // Partial credit: only subset of correct chosen, zero incorrect chosen
    if (q.allowPartialCredit || policy.allowPartialCredit) {
      const partialMarks = Number(((correctSelected / correctIds.size) * q.marks).toFixed(2));
      return {
        questionId: q.id,
        status: 'PARTIAL',
        marksAwarded: partialMarks,
        maxMarks: q.marks,
        negativeMarks: q.negativeMarks,
        candidateResponse: response,
        correctAnswer,
        explanation: q.solution,
        timeSpentSeconds: timeSpent,
      };
    }

    // No partial credit enabled: incorrect
    return {
      questionId: q.id,
      status: 'INCORRECT',
      marksAwarded: -q.negativeMarks,
      maxMarks: q.marks,
      negativeMarks: q.negativeMarks,
      candidateResponse: response,
      correctAnswer,
      explanation: q.solution,
      timeSpentSeconds: timeSpent,
    };
  },

  sanitizeForCandidate(q: QuestionModel): CandidateQuestionView {
    const base = sanitizeBase(q);
    return {
      ...base,
      options: (q.options || []).map((o) => ({ id: o.id, text: o.text })),
    };
  },
};

/* ============================================================================
   3. True / False
   ============================================================================ */
export const TrueFalseHandler: QuestionTypeHandler<string> = {
  type: 'true_false',

  validate(q: QuestionModel): ValidationDiagnostic[] {
    const diags: ValidationDiagnostic[] = [];
    if (!q.id)
      diags.push({ level: 'ERROR', code: 'MISSING_ID', message: 'Question ID is required' });
    if (!q.body)
      diags.push({
        level: 'ERROR',
        code: 'MISSING_BODY',
        message: 'Question body text is required',
      });

    const options = q.options || [];
    if (options.length !== 2) {
      diags.push({
        level: 'ERROR',
        code: 'EXACTLY_TWO_OPTIONS_REQUIRED',
        message: `true_false requires exactly 2 options, found ${options.length}`,
      });
    }
    const correctCount = options.filter((o) => o.isCorrect).length;
    if (correctCount !== 1) {
      diags.push({
        level: 'ERROR',
        code: 'INVALID_CORRECT_COUNT',
        message: `true_false must have exactly 1 correct answer, found ${correctCount}`,
      });
    }
    return diags;
  },

  normalize(q: QuestionModel): QuestionModel {
    return SingleChoiceHandler.normalize(q);
  },

  score(
    q: QuestionModel,
    response: string | boolean | undefined,
    policy: ScoringPolicy,
    timeSpent: number,
  ): QuestionScore {
    if (response === undefined || response === null || String(response).trim() === '') {
      return SingleChoiceHandler.score(q, undefined, policy, timeSpent);
    }
    const respStr = String(response).trim().toLowerCase();
    const options = q.options || [];
    let mappedResp: string | undefined;

    if (respStr === 'true' || respStr === 't' || respStr === '1' || respStr === 'opt_0') {
      const opt = options.find((o) => o.text.trim().toLowerCase() === 'true') || options[0];
      mappedResp = opt?.id;
    } else if (respStr === 'false' || respStr === 'f' || respStr === '0' || respStr === 'opt_1') {
      const opt = options.find((o) => o.text.trim().toLowerCase() === 'false') || options[1];
      mappedResp = opt?.id;
    } else {
      mappedResp = String(response).trim();
    }

    return SingleChoiceHandler.score(q, mappedResp, policy, timeSpent);
  },

  sanitizeForCandidate(q: QuestionModel): CandidateQuestionView {
    return SingleChoiceHandler.sanitizeForCandidate(q);
  },
};

/* ============================================================================
   4. Numerical
   ============================================================================ */
export const NumericalHandler: QuestionTypeHandler<number | string> = {
  type: 'numerical',

  validate(q: QuestionModel): ValidationDiagnostic[] {
    const diags: ValidationDiagnostic[] = [];
    if (!q.id)
      diags.push({ level: 'ERROR', code: 'MISSING_ID', message: 'Question ID is required' });
    if (!q.body)
      diags.push({
        level: 'ERROR',
        code: 'MISSING_BODY',
        message: 'Question body text is required',
      });

    if (q.correctValue === undefined || q.correctValue === null || isNaN(Number(q.correctValue))) {
      diags.push({
        level: 'ERROR',
        code: 'MISSING_CORRECT_VALUE',
        message: 'numerical question must define a numeric correctValue in frontmatter',
      });
    }
    if (q.toleranceAbsolute !== undefined && q.toleranceAbsolute < 0) {
      diags.push({
        level: 'ERROR',
        code: 'INVALID_TOLERANCE',
        message: 'toleranceAbsolute cannot be negative',
      });
    }
    return diags;
  },

  normalize(q: QuestionModel): QuestionModel {
    const base = normalizeBase(q);
    return {
      ...base,
      correctValue: q.correctValue !== undefined ? Number(q.correctValue) : undefined,
      toleranceAbsolute: q.toleranceAbsolute !== undefined ? Number(q.toleranceAbsolute) : 0,
      toleranceRelative: q.toleranceRelative !== undefined ? Number(q.toleranceRelative) : 0,
      unit: q.unit?.trim(),
    };
  },

  score(
    q: QuestionModel,
    response: number | string | undefined,
    _policy: ScoringPolicy,
    timeSpent: number,
  ): QuestionScore {
    const correctVal = Number(q.correctValue);
    const tolAbs = Number(q.toleranceAbsolute || 0);
    const tolRel = Number(q.toleranceRelative || 0);

    if (response === undefined || response === null || String(response).trim() === '') {
      return {
        questionId: q.id,
        status: 'UNATTEMPTED',
        marksAwarded: 0,
        maxMarks: q.marks,
        negativeMarks: q.negativeMarks,
        candidateResponse: null,
        correctAnswer: correctVal,
        explanation: q.solution,
        timeSpentSeconds: timeSpent,
      };
    }

    const candVal = typeof response === 'number' ? response : parseFloat(String(response).trim());

    if (isNaN(candVal)) {
      return {
        questionId: q.id,
        status: 'INCORRECT',
        marksAwarded: -q.negativeMarks,
        maxMarks: q.marks,
        negativeMarks: q.negativeMarks,
        candidateResponse: response,
        correctAnswer: correctVal,
        explanation: q.solution,
        timeSpentSeconds: timeSpent,
      };
    }

    const diff = Math.abs(candVal - correctVal);
    // Epsilon factor prevents IEEE-754 floating point subtraction precision drift
    const absOk = diff <= tolAbs + 1e-9;
    const relOk = tolRel > 0 ? diff <= Math.abs(correctVal) * tolRel + 1e-9 : false;
    const isCorrect = absOk || relOk;

    return {
      questionId: q.id,
      status: isCorrect ? 'CORRECT' : 'INCORRECT',
      marksAwarded: isCorrect ? q.marks : -q.negativeMarks,
      maxMarks: q.marks,
      negativeMarks: q.negativeMarks,
      candidateResponse: candVal,
      correctAnswer: correctVal,
      explanation: q.solution,
      timeSpentSeconds: timeSpent,
    };
  },

  sanitizeForCandidate(q: QuestionModel): CandidateQuestionView {
    return sanitizeBase(q);
  },
};

/* ============================================================================
   5. Integer
   ============================================================================ */
export const IntegerHandler: QuestionTypeHandler<number | string> = {
  type: 'integer',

  validate(q: QuestionModel): ValidationDiagnostic[] {
    const diags: ValidationDiagnostic[] = [];
    if (!q.id)
      diags.push({ level: 'ERROR', code: 'MISSING_ID', message: 'Question ID is required' });
    if (!q.body)
      diags.push({
        level: 'ERROR',
        code: 'MISSING_BODY',
        message: 'Question body text is required',
      });

    if (q.correctValue === undefined || !Number.isInteger(Number(q.correctValue))) {
      diags.push({
        level: 'ERROR',
        code: 'INVALID_INTEGER_VALUE',
        message: 'integer question must have an integer correctValue in frontmatter',
      });
    }
    return diags;
  },

  normalize(q: QuestionModel): QuestionModel {
    const base = normalizeBase(q);
    return {
      ...base,
      correctValue: q.correctValue !== undefined ? Math.round(Number(q.correctValue)) : undefined,
    };
  },

  score(
    q: QuestionModel,
    response: number | string | undefined,
    _policy: ScoringPolicy,
    timeSpent: number,
  ): QuestionScore {
    const correctInt = Number(q.correctValue);

    if (response === undefined || response === null || String(response).trim() === '') {
      return {
        questionId: q.id,
        status: 'UNATTEMPTED',
        marksAwarded: 0,
        maxMarks: q.marks,
        negativeMarks: q.negativeMarks,
        candidateResponse: null,
        correctAnswer: correctInt,
        explanation: q.solution,
        timeSpentSeconds: timeSpent,
      };
    }

    const rawStr = String(response).trim();
    const candInt = parseInt(rawStr, 10);

    // If decimal or not strict integer
    const isStrictInteger = !isNaN(candInt) && /^-?\d+$/.test(rawStr);
    const isCorrect = isStrictInteger && candInt === correctInt;

    return {
      questionId: q.id,
      status: isCorrect ? 'CORRECT' : 'INCORRECT',
      marksAwarded: isCorrect ? q.marks : -q.negativeMarks,
      maxMarks: q.marks,
      negativeMarks: q.negativeMarks,
      candidateResponse: isStrictInteger ? candInt : rawStr,
      correctAnswer: correctInt,
      explanation: q.solution,
      timeSpentSeconds: timeSpent,
    };
  },

  sanitizeForCandidate(q: QuestionModel): CandidateQuestionView {
    return sanitizeBase(q);
  },
};

/* ============================================================================
   6. Fill in the Blank
   ============================================================================ */
export const FillBlankHandler: QuestionTypeHandler<string> = {
  type: 'fill_blank',

  validate(q: QuestionModel): ValidationDiagnostic[] {
    const diags: ValidationDiagnostic[] = [];
    if (!q.id)
      diags.push({ level: 'ERROR', code: 'MISSING_ID', message: 'Question ID is required' });
    if (!q.body)
      diags.push({
        level: 'ERROR',
        code: 'MISSING_BODY',
        message: 'Question body text is required',
      });

    const accepted = q.acceptedAnswers || [];
    if (accepted.length === 0 || accepted.every((a) => !a.trim())) {
      diags.push({
        level: 'ERROR',
        code: 'MISSING_ACCEPTED_ANSWERS',
        message: 'fill_blank must define at least one non-empty string in acceptedAnswers',
      });
    }
    return diags;
  },

  normalize(q: QuestionModel): QuestionModel {
    const base = normalizeBase(q);
    return {
      ...base,
      acceptedAnswers: (q.acceptedAnswers || []).map((a) => a.trim()).filter(Boolean),
      caseSensitive: Boolean(q.caseSensitive),
    };
  },

  score(
    q: QuestionModel,
    response: string | undefined,
    _policy: ScoringPolicy,
    timeSpent: number,
  ): QuestionScore {
    const accepted = q.acceptedAnswers || [];
    const caseSensitive = Boolean(q.caseSensitive);

    if (!response || response.trim() === '') {
      return {
        questionId: q.id,
        status: 'UNATTEMPTED',
        marksAwarded: 0,
        maxMarks: q.marks,
        negativeMarks: q.negativeMarks,
        candidateResponse: null,
        correctAnswer: accepted.join(' / '),
        explanation: q.solution,
        timeSpentSeconds: timeSpent,
      };
    }

    const candidateNorm = caseSensitive ? response.trim() : response.trim().toLowerCase();
    const isCorrect = accepted.some((ans) => {
      const target = caseSensitive ? ans.trim() : ans.trim().toLowerCase();
      return candidateNorm === target;
    });

    return {
      questionId: q.id,
      status: isCorrect ? 'CORRECT' : 'INCORRECT',
      marksAwarded: isCorrect ? q.marks : -q.negativeMarks,
      maxMarks: q.marks,
      negativeMarks: q.negativeMarks,
      candidateResponse: response.trim(),
      correctAnswer: accepted.join(' / '),
      explanation: q.solution,
      timeSpentSeconds: timeSpent,
    };
  },

  sanitizeForCandidate(q: QuestionModel): CandidateQuestionView {
    return sanitizeBase(q);
  },
};

/* ============================================================================
   7. Match the Following
   ============================================================================ */
export const MatchHandler: QuestionTypeHandler<Record<string, string>> = {
  type: 'match',

  validate(q: QuestionModel): ValidationDiagnostic[] {
    const diags: ValidationDiagnostic[] = [];
    if (!q.id)
      diags.push({ level: 'ERROR', code: 'MISSING_ID', message: 'Question ID is required' });
    if (!q.body)
      diags.push({
        level: 'ERROR',
        code: 'MISSING_BODY',
        message: 'Question body text is required',
      });

    const matches = q.matches || [];
    if (matches.length < 2) {
      diags.push({
        level: 'ERROR',
        code: 'INSUFFICIENT_MATCH_PAIRS',
        message: `match requires at least 2 pairs, found ${matches.length}`,
      });
    }
    return diags;
  },

  normalize(q: QuestionModel): QuestionModel {
    const base = normalizeBase(q);
    return {
      ...base,
      matches: (q.matches || []).map((m) => ({ left: m.left.trim(), right: m.right.trim() })),
    };
  },

  score(
    q: QuestionModel,
    response: Record<string, string> | undefined,
    policy: ScoringPolicy,
    timeSpent: number,
  ): QuestionScore {
    const matches = q.matches || [];
    const correctMap: Record<string, string> = {};
    for (const m of matches) {
      correctMap[m.left] = m.right;
    }

    if (!response || typeof response !== 'object' || Object.keys(response).length === 0) {
      return {
        questionId: q.id,
        status: 'UNATTEMPTED',
        marksAwarded: 0,
        maxMarks: q.marks,
        negativeMarks: q.negativeMarks,
        candidateResponse: {},
        correctAnswer: correctMap,
        explanation: q.solution,
        timeSpentSeconds: timeSpent,
      };
    }

    let correctPairs = 0;
    for (const m of matches) {
      if (response[m.left] && response[m.left].trim() === m.right.trim()) {
        correctPairs++;
      }
    }

    if (correctPairs === matches.length) {
      return {
        questionId: q.id,
        status: 'CORRECT',
        marksAwarded: q.marks,
        maxMarks: q.marks,
        negativeMarks: q.negativeMarks,
        candidateResponse: response,
        correctAnswer: correctMap,
        explanation: q.solution,
        timeSpentSeconds: timeSpent,
      };
    }

    if (policy.allowPartialCredit && correctPairs > 0) {
      const partialMarks = Number(((correctPairs / matches.length) * q.marks).toFixed(2));
      return {
        questionId: q.id,
        status: 'PARTIAL',
        marksAwarded: partialMarks,
        maxMarks: q.marks,
        negativeMarks: q.negativeMarks,
        candidateResponse: response,
        correctAnswer: correctMap,
        explanation: q.solution,
        timeSpentSeconds: timeSpent,
      };
    }

    return {
      questionId: q.id,
      status: 'INCORRECT',
      marksAwarded: -q.negativeMarks,
      maxMarks: q.marks,
      negativeMarks: q.negativeMarks,
      candidateResponse: response,
      correctAnswer: correctMap,
      explanation: q.solution,
      timeSpentSeconds: timeSpent,
    };
  },

  sanitizeForCandidate(q: QuestionModel): CandidateQuestionView {
    const base = sanitizeBase(q);
    const matches = q.matches || [];
    // Shuffle right items to prevent trivial mapping
    const leftItems = matches.map((m) => m.left);
    const rightItems = matches.map((m) => m.right).sort();
    return {
      ...base,
      matches: { leftItems, rightItems },
    };
  },
};

/* ============================================================================
   8. Assertion–Reason
   ============================================================================ */
export const AssertionReasonHandler: QuestionTypeHandler<string> = {
  type: 'assertion_reason',

  validate(q: QuestionModel): ValidationDiagnostic[] {
    const diags: ValidationDiagnostic[] = [];
    if (!q.id)
      diags.push({ level: 'ERROR', code: 'MISSING_ID', message: 'Question ID is required' });
    if (!q.body)
      diags.push({
        level: 'ERROR',
        code: 'MISSING_BODY',
        message: 'Question body text is required',
      });

    if (!q.correctCode || !['A', 'B', 'C', 'D', 'E'].includes(q.correctCode)) {
      diags.push({
        level: 'ERROR',
        code: 'INVALID_CORRECT_CODE',
        message: 'assertion_reason must define correctCode in [A, B, C, D, E]',
      });
    }
    return diags;
  },

  normalize(q: QuestionModel): QuestionModel {
    const base = normalizeBase(q);
    const code = (q.correctCode?.toUpperCase() || 'A') as 'A' | 'B' | 'C' | 'D' | 'E';
    const standardOptions = [
      {
        id: 'A',
        text: 'Both (A) and (R) are true and (R) is the correct explanation of (A)',
        isCorrect: code === 'A',
      },
      {
        id: 'B',
        text: 'Both (A) and (R) are true but (R) is not the correct explanation of (A)',
        isCorrect: code === 'B',
      },
      { id: 'C', text: '(A) is true but (R) is false', isCorrect: code === 'C' },
      { id: 'D', text: '(A) is false but (R) is true', isCorrect: code === 'D' },
      { id: 'E', text: 'Both (A) and (R) are false', isCorrect: code === 'E' },
    ];

    const finalOptions =
      q.options && q.options.length > 0
        ? q.options.map((opt, i) => {
            const letter = String.fromCharCode(65 + i) as 'A' | 'B' | 'C' | 'D' | 'E';
            return {
              id: letter,
              text: opt.text.trim(),
              isCorrect: opt.isCorrect ?? code === letter,
              explanation: opt.explanation?.trim(),
            };
          })
        : standardOptions;

    return {
      ...base,
      correctCode: code,
      options: finalOptions,
    };
  },

  score(
    q: QuestionModel,
    response: string | undefined,
    _policy: ScoringPolicy,
    timeSpent: number,
  ): QuestionScore {
    const correctCode = (q.correctCode || 'A').toUpperCase();

    if (!response || String(response).trim() === '') {
      return {
        questionId: q.id,
        status: 'UNATTEMPTED',
        marksAwarded: 0,
        maxMarks: q.marks,
        negativeMarks: q.negativeMarks,
        candidateResponse: null,
        correctAnswer: correctCode,
        explanation: q.solution,
        timeSpentSeconds: timeSpent,
      };
    }

    const rawResp = String(response).trim().toUpperCase();
    let normalizedCode = rawResp;
    const optMatch = rawResp.match(/^OPT_(\d+)$/);
    if (optMatch) {
      const idx = parseInt(optMatch[1], 10);
      normalizedCode = String.fromCharCode(65 + idx);
    } else if (/^\d+$/.test(rawResp)) {
      const idx = parseInt(rawResp, 10);
      normalizedCode = String.fromCharCode(65 + idx);
    }

    const isCorrect = normalizedCode === correctCode;
    return {
      questionId: q.id,
      status: isCorrect ? 'CORRECT' : 'INCORRECT',
      marksAwarded: isCorrect ? q.marks : -q.negativeMarks,
      maxMarks: q.marks,
      negativeMarks: q.negativeMarks,
      candidateResponse: normalizedCode,
      correctAnswer: correctCode,
      explanation: q.solution,
      timeSpentSeconds: timeSpent,
    };
  },

  sanitizeForCandidate(q: QuestionModel): CandidateQuestionView {
    const base = sanitizeBase(q);
    return {
      ...base,
      options: (q.options || []).map((o) => ({ id: o.id, text: o.text })),
    };
  },
};

/* ============================================================================
   9. Passage / Shared Stimulus
   ============================================================================ */
export const PassageHandler: QuestionTypeHandler<string> = {
  type: 'passage',

  validate(q: QuestionModel): ValidationDiagnostic[] {
    const diags: ValidationDiagnostic[] = [];
    if (!q.id)
      diags.push({ level: 'ERROR', code: 'MISSING_ID', message: 'Question ID is required' });
    if (!q.body)
      diags.push({
        level: 'ERROR',
        code: 'MISSING_BODY',
        message: 'Passage body text is required',
      });
    if (!q.questionGroupId) {
      diags.push({
        level: 'WARNING',
        code: 'MISSING_GROUP_ID',
        message:
          'Passage questions should define questionGroupId so child questions can link to it',
      });
    }
    return diags;
  },

  normalize(q: QuestionModel): QuestionModel {
    const base = normalizeBase(q);
    return {
      ...base,
      questionGroupId: q.questionGroupId || q.id,
    };
  },

  score(
    q: QuestionModel,
    response: string | undefined,
    policy: ScoringPolicy,
    timeSpent: number,
  ): QuestionScore {
    // If the passage question has options itself, score like SingleChoice; otherwise neutral
    if (q.options && q.options.length > 0) {
      return SingleChoiceHandler.score(q, response, policy, timeSpent);
    }
    return {
      questionId: q.id,
      status: 'UNATTEMPTED',
      marksAwarded: 0,
      maxMarks: q.marks,
      negativeMarks: 0,
      candidateResponse: null,
      correctAnswer: 'Passage stimulus',
      explanation: q.solution,
      timeSpentSeconds: timeSpent,
    };
  },

  sanitizeForCandidate(q: QuestionModel): CandidateQuestionView {
    const base = sanitizeBase(q);
    return {
      ...base,
      options: q.options ? q.options.map((o) => ({ id: o.id, text: o.text })) : undefined,
    };
  },
};

/* ============================================================================
   10. Image Based
   ============================================================================ */
export const ImageBasedHandler: QuestionTypeHandler<string> = {
  type: 'image_based',

  validate(q: QuestionModel): ValidationDiagnostic[] {
    const diags: ValidationDiagnostic[] = [];
    if (!q.id)
      diags.push({ level: 'ERROR', code: 'MISSING_ID', message: 'Question ID is required' });
    if (!q.imageUrl) {
      diags.push({
        level: 'ERROR',
        code: 'MISSING_IMAGE_URL',
        message: 'image_based question must provide an imageUrl',
      });
    }
    if (q.options && q.options.length > 0) {
      diags.push(...SingleChoiceHandler.validate(q));
    }
    return diags;
  },

  normalize(q: QuestionModel): QuestionModel {
    return SingleChoiceHandler.normalize(q);
  },

  score(
    q: QuestionModel,
    response: string | undefined,
    policy: ScoringPolicy,
    timeSpent: number,
  ): QuestionScore {
    return SingleChoiceHandler.score(q, response, policy, timeSpent);
  },

  sanitizeForCandidate(q: QuestionModel): CandidateQuestionView {
    return SingleChoiceHandler.sanitizeForCandidate(q);
  },
};
