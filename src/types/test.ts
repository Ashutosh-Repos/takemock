/**
 * Test Definition, Blueprint, and Policy types for takemock.
 * Adheres strictly to docs/master_architecture_prompt_v2.md
 */

import type { DifficultyLevel, QuestionType } from './question';

export type TestMode = 'PRACTICE' | 'EXAM';

export type NavigationMode = 'FREE' | 'SEQUENTIAL' | 'SECTION_LOCKED';

export type TimingMode = 'GLOBAL' | 'SECTION' | 'QUESTION' | 'NONE';

export interface SelectionConstraint {
  subject?: string;
  topic?: string;
  difficulty?: DifficultyLevel;
  type?: QuestionType;
  count: number;
  tags?: string[];
}

export interface SectionSelectionConfig {
  mode: 'STATIC' | 'RULE_BASED';
  staticQuestionIds?: Array<{ id: string; version?: number }>;
  constraints?: SelectionConstraint[];
}

export interface TestSectionDefinition {
  id: string;
  title: string;
  order: number;
  instructions?: string;
  durationSeconds?: number; // Optional section timer
  cutoffScore?: number; // Optional sectional cutoff
  selection: SectionSelectionConfig;
}

export interface TimingPolicy {
  mode: TimingMode;
  totalDurationSeconds: number; // 0 for untimed
  allowPause: boolean;
  autoSubmitOnExpiry: boolean;
  warnThresholdSeconds?: number; // e.g. 300s
}

export interface ScoringPolicy {
  defaultMarks: number;
  defaultNegativeMarks: number;
  allowPartialCredit: boolean;
  unattemptedPenalty?: number;
}

export interface RandomizationPolicy {
  shuffleQuestions: boolean; // Preserves question groups atomically!
  shuffleOptions: boolean;
  seed?: number;
}

export interface FeedbackPolicy {
  showImmediateSolution: boolean; // True in practice mode
  showHint: boolean;
  allowCheckAnswer: boolean;
  showDetailedSolutionsAfterSubmit: boolean;
}

export type TestLifecycleStatus = 'DRAFT' | 'VALIDATED' | 'PUBLISHED' | 'ARCHIVED';

export interface TestToolPolicy {
  allowCalculator: boolean;
  calculatorType?: 'BASIC' | 'SCIENTIFIC';
  allowScratchpad: boolean;
  allowPeriodicTable?: boolean;
}

export interface SubmissionPolicy {
  requireConfirmation: boolean;
  autoSubmitOnExpiry: boolean;
  allowReviewBeforeSubmit: boolean;
}

export interface TestDefinition {
  id: string;
  title: string;
  description: string;
  instructions?: string;
  mode: TestMode;
  schemaVersion: string;
  version: number;
  status?: TestLifecycleStatus;
  sections: TestSectionDefinition[];
  timing: TimingPolicy;
  scoring: ScoringPolicy;
  navigation: NavigationMode;
  randomization: RandomizationPolicy;
  feedback: FeedbackPolicy;
  tools?: TestToolPolicy;
  submission?: SubmissionPolicy;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}
