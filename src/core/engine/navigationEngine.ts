/**
 * Navigation Engine for takemock.
 * Controls question palette state transitions and section traversal policies.
 * Adheres strictly to docs/master_architecture_prompt_v2.md Section 19 & 20.
 */

import type { QuestionVisitStatus, TestSnapshot } from '@/types/attempt';
import type { NavigationMode } from '@/types/test';

export interface NavigationTarget {
  sectionId: string;
  questionId: string;
}

export function getFlattenedQuestions(snapshot: TestSnapshot): Array<{
  sectionId: string;
  sectionIndex: number;
  questionId: string;
  questionIndex: number;
  globalIndex: number;
}> {
  const list: Array<{
    sectionId: string;
    sectionIndex: number;
    questionId: string;
    questionIndex: number;
    globalIndex: number;
  }> = [];

  let globalIdx = 0;
  snapshot.sections.forEach((sec, sIdx) => {
    sec.questions.forEach((q, qIdx) => {
      list.push({
        sectionId: sec.id,
        sectionIndex: sIdx,
        questionId: q.id,
        questionIndex: qIdx,
        globalIndex: globalIdx++,
      });
    });
  });

  return list;
}

/**
 * Calculates whether candidate can jump to a target question given current navigation mode.
 */
export function canNavigateTo(
  mode: NavigationMode,
  currentSectionId: string,
  targetSectionId: string,
  currentQuestionId: string,
  targetQuestionId: string,
  flattened: ReturnType<typeof getFlattenedQuestions>,
): boolean {
  if (currentQuestionId === targetQuestionId && currentSectionId === targetSectionId) {
    return true;
  }

  if (mode === 'FREE') {
    return true;
  }

  if (mode === 'SECTION_LOCKED') {
    return currentSectionId === targetSectionId;
  }

  if (mode === 'SEQUENTIAL') {
    const curIdx = flattened.findIndex((f) => f.questionId === currentQuestionId);
    const targetIdx = flattened.findIndex((f) => f.questionId === targetQuestionId);
    // Can only move to adjacent questions
    return Math.abs(curIdx - targetIdx) === 1;
  }

  return false;
}

/**
 * Computes next question in test sequence.
 */
export function getNextQuestion(
  snapshot: TestSnapshot,
  currentSectionId: string,
  currentQuestionId: string,
): NavigationTarget | null {
  const flat = getFlattenedQuestions(snapshot);
  let curIdx = flat.findIndex(
    (f) => f.questionId === currentQuestionId && f.sectionId === currentSectionId,
  );
  if (curIdx === -1) {
    curIdx = flat.findIndex((f) => f.questionId === currentQuestionId);
  }
  if (curIdx >= 0 && curIdx < flat.length - 1) {
    const next = flat[curIdx + 1];
    return { sectionId: next.sectionId, questionId: next.questionId };
  }
  return null;
}

/**
 * Computes previous question in test sequence.
 */
export function getPreviousQuestion(
  snapshot: TestSnapshot,
  currentSectionId: string,
  currentQuestionId: string,
): NavigationTarget | null {
  const flat = getFlattenedQuestions(snapshot);
  let curIdx = flat.findIndex(
    (f) => f.questionId === currentQuestionId && f.sectionId === currentSectionId,
  );
  if (curIdx === -1) {
    curIdx = flat.findIndex((f) => f.questionId === currentQuestionId);
  }
  if (curIdx > 0) {
    const prev = flat[curIdx - 1];
    return { sectionId: prev.sectionId, questionId: prev.questionId };
  }
  return null;
}

/**
 * Palette status determination based on candidate action.
 */
export function resolveQuestionVisitStatus(
  hasResponse: boolean,
  isMarkedForReview: boolean,
): QuestionVisitStatus {
  if (hasResponse && isMarkedForReview) {
    return 'ANSWERED_AND_MARKED';
  }
  if (isMarkedForReview) {
    return 'MARKED_FOR_REVIEW';
  }
  if (hasResponse) {
    return 'ANSWERED';
  }
  return 'SKIPPED';
}
