/**
 * Question Type Registry interface and contract.
 * Allows adding new question types without modifying the core attempt or scoring engines.
 */

import type {
  CandidateQuestionView,
  QuestionModel,
  QuestionType,
  ValidationDiagnostic,
} from '@/types/question';
import type { QuestionScore } from '@/types/scoring';
import type { ScoringPolicy } from '@/types/test';

export interface ScoreEvaluation {
  status: 'CORRECT' | 'INCORRECT' | 'PARTIAL' | 'UNATTEMPTED';
  marksAwarded: number;
  correctAnswerSummary: string | string[] | number | Record<string, string>;
}

export interface QuestionTypeHandler<TResponse = unknown> {
  readonly type: QuestionType;

  /**
   * Validates the question definition and returns any diagnostic errors/warnings.
   */
  validate(question: QuestionModel): ValidationDiagnostic[];

  /**
   * Normalizes question data (e.g. trimming strings, default values).
   */
  normalize(question: QuestionModel): QuestionModel;

  /**
   * Pure evaluation of a candidate response against the question and scoring policy.
   */
  score(
    question: QuestionModel,
    candidateResponse: TResponse | undefined,
    policy: ScoringPolicy,
    timeSpentSeconds: number,
  ): QuestionScore;

  /**
   * Sanitizes the question for candidate delivery (strips answers, solutions, explanations).
   */
  sanitizeForCandidate(question: QuestionModel): CandidateQuestionView;
}
