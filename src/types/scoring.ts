/**
 * Scoring domain models for takemock.
 * Adheres strictly to docs/master_architecture_prompt_v2.md Section 22
 */

export type QuestionScoreStatus = 'CORRECT' | 'INCORRECT' | 'PARTIAL' | 'UNATTEMPTED';

export interface QuestionScore {
  questionId: string;
  status: QuestionScoreStatus;
  marksAwarded: number;
  maxMarks: number;
  negativeMarks: number;
  candidateResponse: unknown;
  correctAnswer: unknown;
  explanation?: string;
  timeSpentSeconds: number;
}

export interface SectionScore {
  sectionId: string;
  sectionTitle: string;
  marksAwarded: number;
  maxMarks: number;
  totalQuestions: number;
  attemptedCount: number;
  correctCount: number;
  incorrectCount: number;
  partialCount: number;
  unattemptedCount: number;
  accuracy: number; // 0 to 100
  timeSpentSeconds: number;
}

export interface AttemptScoreResult {
  totalMarksAwarded: number;
  totalMaxMarks: number;
  percentage: number; // 0 to 100
  accuracy: number; // 0 to 100
  totalAttempted: number;
  totalCorrect: number;
  totalIncorrect: number;
  totalPartial: number;
  totalUnattempted: number;
  totalTimeSpentSeconds: number;
  sectionScores: Record<string, SectionScore>;
  questionScores: Record<string, QuestionScore>;
  evaluatedAt: string;
}
