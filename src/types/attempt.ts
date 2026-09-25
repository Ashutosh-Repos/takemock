/**
 * Test Snapshot and Attempt State domain types for takemock.
 * Adheres strictly to docs/master_architecture_prompt_v2.md
 */

import type { QuestionModel } from './question';
import type { FeedbackPolicy, NavigationMode, ScoringPolicy, TestMode, TimingPolicy } from './test';
import type { AttemptScoreResult } from './scoring';

export interface SnapshotSection {
  id: string;
  title: string;
  order: number;
  durationSeconds?: number;
  cutoffScore?: number;
  questions: QuestionModel[]; // Frozen immutable question definitions
}

export interface TestSnapshot {
  snapshotId: string;
  testId: string;
  testVersion: number;
  testTitle: string;
  mode: TestMode;
  sections: SnapshotSection[];
  timing: TimingPolicy;
  scoring: ScoringPolicy;
  navigation: NavigationMode;
  feedback: FeedbackPolicy;
  seedUsed?: number;
  createdAt: string;
}

export type AttemptStatus =
  | 'CREATED'
  | 'READY'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'SUBMITTING'
  | 'SUBMITTED'
  | 'AUTO_SUBMITTED'
  | 'SCORED'
  | 'EXPIRED'
  | 'ABANDONED'
  | 'INVALIDATED';

export type QuestionVisitStatus =
  | 'NOT_VISITED'
  | 'SKIPPED' // Visited but not answered
  | 'ANSWERED'
  | 'MARKED_FOR_REVIEW'
  | 'ANSWERED_AND_MARKED';

export interface QuestionTimingRecord {
  timeSpentSeconds: number;
  visitCount: number;
  lastEnteredAt?: string;
}

export type AttemptEventType =
  | 'ATTEMPT_STARTED'
  | 'SECTION_ENTERED'
  | 'QUESTION_VIEWED'
  | 'QUESTION_ANSWERED'
  | 'ANSWER_CLEARED'
  | 'ANSWER_CHANGED'
  | 'QUESTION_MARKED'
  | 'QUESTION_UNMARKED'
  | 'TOOL_OPENED'
  | 'ATTEMPT_PAUSED'
  | 'ATTEMPT_RESUMED'
  | 'ATTEMPT_SUBMITTING'
  | 'ATTEMPT_SUBMITTED'
  | 'ATTEMPT_AUTO_SUBMITTED'
  | 'TIMER_EXPIRED';

export interface AttemptEvent {
  id: string;
  type: AttemptEventType;
  timestamp: string;
  sectionId?: string;
  questionId?: string;
  payload?: Record<string, unknown>;
}

export interface AnswerHistoryEntry {
  timestamp: string;
  response: unknown;
  timeSpentSeconds: number;
}

export interface AttemptState {
  id: string;
  testId: string;
  snapshot: TestSnapshot;
  status: AttemptStatus;
  currentSectionId: string;
  currentQuestionId: string;
  responses: Record<string, unknown>; // questionId -> candidate response
  answerHistory?: Record<string, AnswerHistoryEntry[]>; // questionId -> chronological responses
  visitStatuses: Record<string, QuestionVisitStatus>;
  timings: Record<string, QuestionTimingRecord>;
  events?: AttemptEvent[]; // Structured domain audit trail
  sectionElapsedSeconds: Record<string, number>;
  totalElapsedSeconds: number;
  remainingSeconds: number;
  startedAt: string;
  completedAt?: string;
  scoreResult?: AttemptScoreResult;
}
