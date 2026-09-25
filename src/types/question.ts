/**
 * Canonical Question domain models for takemock.
 * Adheres strictly to docs/markdown_format_spec_v2.md and docs/master_architecture_prompt_v2.md
 */

export type QuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'true_false'
  | 'numerical'
  | 'integer'
  | 'fill_blank'
  | 'match'
  | 'assertion_reason'
  | 'passage'
  | 'image_based';

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export type ValidationLevel = 'ERROR' | 'WARNING' | 'INFO';

export interface ValidationDiagnostic {
  level: ValidationLevel;
  code: string;
  message: string;
  field?: string;
  line?: number;
}

export interface QuestionOption {
  id: string; // e.g. "opt_0", "opt_1" or "A", "B", "C"
  text: string;
  isCorrect: boolean;
  explanation?: string;
}

export interface MatchPair {
  left: string;
  right: string;
}

export interface QuestionMetadata {
  schemaVersion?: string;
  id: string;
  version?: number;
  type: QuestionType;
  subject?: string;
  topic?: string;
  subtopic?: string;
  difficulty?: DifficultyLevel;
  marks?: number;
  negativeMarks?: number;
  tags?: string[];
  source?: string;
  sourceYear?: number;
  exam?: string;
  estimatedTimeSeconds?: number;
  questionGroupId?: string;
  allowPartialCredit?: boolean;
  toleranceAbsolute?: number;
  toleranceRelative?: number;
  unit?: string;
  correctCode?: 'A' | 'B' | 'C' | 'D' | 'E';
  correctValue?: number;
  acceptedAnswers?: string[];
  caseSensitive?: boolean;
  extensions?: Record<string, unknown>;
}

export interface QuestionModel extends QuestionMetadata {
  schemaVersion: string;
  id: string;
  version: number;
  type: QuestionType;
  subject: string;
  topic: string;
  difficulty: DifficultyLevel;
  marks: number;
  negativeMarks: number;
  tags: string[];

  // Content
  body: string;
  options?: QuestionOption[];
  solution?: string;
  matches?: MatchPair[];
  assertion?: string;
  reason?: string;
  imageUrl?: string;
  imageAlt?: string;

  // Metadata timestamps
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Stripped down model for candidate-facing delivery.
 * Invariant 12: Candidate-facing rendering cannot expose answer keys accidentally.
 */
export interface CandidateQuestionView {
  id: string;
  version: number;
  type: QuestionType;
  subject: string;
  topic: string;
  difficulty: DifficultyLevel;
  marks: number;
  negativeMarks: number;
  body: string;
  options?: Array<{ id: string; text: string }>; // isCorrect stripped!
  matches?: { leftItems: string[]; rightItems: string[] }; // pairings stripped!
  unit?: string;
  imageUrl?: string;
  imageAlt?: string;
  estimatedTimeSeconds?: number;
  questionGroupId?: string;
}
