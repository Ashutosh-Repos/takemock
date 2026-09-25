/**
 * Pure Deterministic Scoring Engine for takemock.
 * Fixed-precision scaled arithmetic eliminating IEEE-754 drift.
 * Adheres strictly to docs/master_architecture_prompt_v2.md Section 12 & 13, Invariant 2.
 */

import type { QuestionTimingRecord, TestSnapshot } from '@/types/attempt';
import type { AttemptScoreResult, QuestionScore, SectionScore } from '@/types/scoring';
import { questionRegistry } from './registry';

/**
 * Rounds a floating point score using standard Round-Half-Up on scaled integers.
 */
export function roundScore(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function evaluateAttempt(
  snapshot: TestSnapshot,
  responses: Record<string, unknown>,
  timings: Record<string, QuestionTimingRecord> = {}
): AttemptScoreResult {
  const questionScores: Record<string, QuestionScore> = {};
  const sectionScores: Record<string, SectionScore> = {};

  let grandTotalMarks = 0;
  let grandTotalMaxMarks = 0;
  let grandAttempted = 0;
  let grandCorrect = 0;
  let grandIncorrect = 0;
  let grandPartial = 0;
  let grandUnattempted = 0;
  let grandTimeSpent = 0;

  for (const section of snapshot.sections) {
    let sectionMarks = 0;
    let sectionMaxMarks = 0;
    let secAttempted = 0;
    let secCorrect = 0;
    let secIncorrect = 0;
    let secPartial = 0;
    let secUnattempted = 0;
    let secTimeSpent = 0;

    for (const q of section.questions) {
      const resp = responses[q.id];
      const timingRecord = timings[q.id];
      const timeSpent = timingRecord?.timeSpentSeconds || 0;
      secTimeSpent += timeSpent;

      const handler = questionRegistry.get(q.type);
      const qScore = handler.score(q, resp, snapshot.scoring, timeSpent);

      // Apply unattempted penalty if configured and question is unattempted
      if (qScore.status === 'UNATTEMPTED' && snapshot.scoring.unattemptedPenalty && snapshot.scoring.unattemptedPenalty > 0) {
        qScore.marksAwarded = -snapshot.scoring.unattemptedPenalty;
      }

      qScore.marksAwarded = roundScore(qScore.marksAwarded);
      questionScores[q.id] = qScore;

      sectionMarks += qScore.marksAwarded;
      sectionMaxMarks += qScore.maxMarks;

      switch (qScore.status) {
        case 'CORRECT':
          secAttempted++;
          secCorrect++;
          break;
        case 'INCORRECT':
          secAttempted++;
          secIncorrect++;
          break;
        case 'PARTIAL':
          secAttempted++;
          secPartial++;
          break;
        case 'UNATTEMPTED':
          secUnattempted++;
          break;
      }
    }

    const secAccuracy = secAttempted > 0 ? roundScore((secCorrect / secAttempted) * 100, 1) : 0;
    const roundedSecMarks = roundScore(sectionMarks, 2);

    sectionScores[section.id] = {
      sectionId: section.id,
      sectionTitle: section.title,
      marksAwarded: roundedSecMarks,
      maxMarks: sectionMaxMarks,
      totalQuestions: section.questions.length,
      attemptedCount: secAttempted,
      correctCount: secCorrect,
      incorrectCount: secIncorrect,
      partialCount: secPartial,
      unattemptedCount: secUnattempted,
      accuracy: secAccuracy,
      timeSpentSeconds: secTimeSpent,
    };

    grandTotalMarks += roundedSecMarks;
    grandTotalMaxMarks += sectionMaxMarks;
    grandAttempted += secAttempted;
    grandCorrect += secCorrect;
    grandIncorrect += secIncorrect;
    grandPartial += secPartial;
    grandUnattempted += secUnattempted;
    grandTimeSpent += secTimeSpent;
  }

  const roundedGrandMarks = roundScore(grandTotalMarks, 2);
  const overallAccuracy = grandAttempted > 0 ? roundScore((grandCorrect / grandAttempted) * 100, 1) : 0;
  const overallPercentage =
    grandTotalMaxMarks > 0 ? roundScore((roundedGrandMarks / grandTotalMaxMarks) * 100, 1) : 0;

  return {
    totalMarksAwarded: roundedGrandMarks,
    totalMaxMarks: grandTotalMaxMarks,
    percentage: overallPercentage,
    accuracy: overallAccuracy,
    totalAttempted: grandAttempted,
    totalCorrect: grandCorrect,
    totalIncorrect: grandIncorrect,
    totalPartial: grandPartial,
    totalUnattempted: grandUnattempted,
    totalTimeSpentSeconds: grandTimeSpent,
    sectionScores,
    questionScores,
    evaluatedAt: new Date().toISOString(),
  };
}
