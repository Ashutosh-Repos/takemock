/**
 * Results & Solutions Review Page.
 * Detailed scorecard, section breakdowns, and question-by-question verified solutions.
 * Adheres strictly to docs/master_architecture_prompt_v2.md Section 22.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock,
  HelpCircle,
  RotateCcw,
  Target,
  XCircle,
} from 'lucide-react';
import { MathRenderer } from '@/components/shared/MathRenderer';
import { QuestionDetailModal } from '@/components/shared/QuestionDetailModal';
import { formatTimeSeconds } from '@/core/engine/timingEngine';
import { assessmentRepository } from '@/core/storage/repository';
import type { AttemptState } from '@/types/attempt';
import type { QuestionScoreStatus } from '@/types/scoring';

export function Result() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();

  const [attempt, setAttempt] = useState<AttemptState | null>(null);
  const [loading, setLoading] = useState(true);

  // Review filter
  const [filterStatus, setFilterStatus] = useState<'ALL' | QuestionScoreStatus>('ALL');
  const [modalIndex, setModalIndex] = useState<number | null>(null);

  useEffect(() => {
    const fetchResult = async () => {
      if (!attemptId) return;
      try {
        const att = await assessmentRepository.getAttemptById(attemptId);
        if (!att) {
          alert('Attempt not found!');
          navigate('/');
          return;
        }

        // If not scored yet or missing scoreResult, submit and score it now
        if (!att.scoreResult) {
          const scored = await assessmentRepository.submitAttempt(attemptId);
          setAttempt(scored);
        } else {
          setAttempt(att);
        }
      } catch (err) {
        console.error('Failed to load result:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchResult();
  }, [attemptId, navigate]);

  if (loading || !attempt || !attempt.scoreResult) {
    return (
      <div className="flex min-h-screen items-center justify-center p-12">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  const { scoreResult, snapshot } = attempt;

  // Flatten all questions with their scores for the review list
  const allQuestionsWithScores = snapshot.sections.flatMap((sec) =>
    sec.questions.map((q) => {
      const qScore = scoreResult.questionScores[q.id];
      return {
        sectionTitle: sec.title,
        question: q,
        score: qScore,
      };
    })
  );

  const filteredQuestions = allQuestionsWithScores.filter((item) => {
    if (filterStatus === 'ALL') return true;
    return item.score?.status === filterStatus;
  });

  // Performance badge tier
  let performanceTier = 'Needs Practice';
  let badgeColor = 'badge-error';
  if (scoreResult.percentage >= 80) {
    performanceTier = 'Outstanding!';
    badgeColor = 'badge-success text-success-content';
  } else if (scoreResult.percentage >= 60) {
    performanceTier = 'Proficient';
    badgeColor = 'badge-primary';
  } else if (scoreResult.percentage >= 40) {
    performanceTier = 'Average';
    badgeColor = 'badge-warning text-warning-content';
  }

  return (
    <div className="mx-auto min-h-screen max-w-7xl space-y-8 p-6 pb-36 md:p-10">
      {/* Header */}
      <div className="border-base-300 flex flex-col justify-between gap-4 border-b pb-5 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight md:text-2xl">Scorecard</h1>
            <span className={`badge ${badgeColor} badge-sm font-bold`}>
              {performanceTier}
            </span>
          </div>
          <p className="text-base-content/50 mt-0.5 text-xs">
            {snapshot.testTitle}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/mistakes')} className="btn btn-ghost btn-sm gap-1.5">
            <Target className="size-3.5" />
            Mistakes
          </button>
          <button onClick={() => navigate('/')} className="btn btn-primary btn-sm gap-1.5 font-bold shadow-sm">
            <RotateCcw className="size-3.5" />
            Library
          </button>
        </div>
      </div>

      {/* Hero Stats Section */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Score */}
        <div className="bg-card border-border/80 rounded-2xl border p-5 shadow-xs">
          <div className="text-xs font-semibold uppercase tracking-wider text-base-content/60">Total Score</div>
          <div className="text-primary mt-1 text-3xl font-black">
            {scoreResult.totalMarksAwarded}{' '}
            <span className="text-sm font-normal text-base-content/60">/ {scoreResult.totalMaxMarks}</span>
          </div>
          <div className="text-xs text-base-content/70 mt-1 font-mono">{scoreResult.percentage}% Score</div>
        </div>

        {/* Accuracy */}
        <div className="bg-card border-border/80 rounded-2xl border p-5 shadow-xs">
          <div className="text-xs font-semibold uppercase tracking-wider text-base-content/60">Accuracy</div>
          <div className="text-secondary mt-1 text-3xl font-black">{scoreResult.accuracy}%</div>
          <div className="text-xs text-base-content/70 mt-1">
            {scoreResult.totalCorrect} correct of {scoreResult.totalAttempted} attempted
          </div>
        </div>

        {/* Breakdown Counts */}
        <div className="bg-card border-border/80 rounded-2xl border p-5 shadow-xs">
          <div className="text-xs font-semibold uppercase tracking-wider text-base-content/60">Breakdown</div>
          <div className="flex items-center gap-2 mt-1 font-bold text-sm">
            <span className="text-success">{scoreResult.totalCorrect} Correct</span> ·
            <span className="text-error">{scoreResult.totalIncorrect} Wrong</span> ·
            <span className="text-base-content/50">{scoreResult.totalUnattempted} Left</span>
          </div>
          <div className="text-xs text-base-content/60 mt-1">
            {allQuestionsWithScores.length} total questions in test
          </div>
        </div>

        {/* Time Spent */}
        <div className="bg-card border-border/80 rounded-2xl border p-5 shadow-xs">
          <div className="text-xs font-semibold uppercase tracking-wider text-base-content/60">Total Time</div>
          <div className="text-accent mt-1 text-3xl font-black font-mono">
            {formatTimeSeconds(scoreResult.totalTimeSpentSeconds)}
          </div>
          <div className="text-xs text-base-content/70 mt-1 flex items-center gap-1">
            <Clock className="size-3" /> Monotonic tracked
          </div>
        </div>
      </div>

      {/* Section-Wise Breakdown Table */}
      <div className="bg-card border-border/80 rounded-2xl overflow-hidden border shadow-xs">
        <div className="border-border/60 border-b p-4 sm:p-5">
          <h3 className="text-base font-bold flex items-center gap-2">
            <BarChart3 className="text-primary size-4" />
            Section Performance
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="table table-zebra w-full text-xs">
            <thead>
              <tr className="text-base-content/60 text-[11px] uppercase tracking-wider">
                <th>Section</th>
                <th>Questions</th>
                <th>Attempted</th>
                <th>Correct</th>
                <th>Incorrect</th>
                <th>Accuracy</th>
                <th>Score</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(scoreResult.sectionScores).map((sec) => (
                <tr key={sec.sectionId}>
                  <td className="font-bold">{sec.sectionTitle}</td>
                  <td>{sec.totalQuestions}</td>
                  <td>{sec.attemptedCount}</td>
                  <td className="text-success font-semibold">{sec.correctCount}</td>
                  <td className="text-error font-semibold">{sec.incorrectCount}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <progress
                        className="progress progress-primary w-14 h-1.5"
                        value={sec.accuracy}
                        max="100"
                      />
                      <span className="font-mono text-xs">{sec.accuracy}%</span>
                    </div>
                  </td>
                  <td className="font-bold font-mono">
                    {sec.marksAwarded} / {sec.maxMarks}
                  </td>
                  <td className="font-mono text-xs text-base-content/70">
                    {formatTimeSeconds(sec.timeSpentSeconds)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ======================================================================
          Question-by-Question Verified Solution Review
         ====================================================================== */}
      <div className="space-y-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-lg font-bold">Solutions & Explanations</h3>
            <p className="text-xs text-base-content/50">
              Step-by-step review for each question.
            </p>
          </div>

          {/* Filter Tabs */}
          <div className="join bg-base-200/60 p-0.5 rounded-xl border border-border/60">
            <button
              onClick={() => setFilterStatus('ALL')}
              className={`btn btn-xs join-item font-semibold ${filterStatus === 'ALL' ? 'btn-primary' : 'btn-ghost'}`}
            >
              All ({allQuestionsWithScores.length})
            </button>
            <button
              onClick={() => setFilterStatus('CORRECT')}
              className={`btn btn-xs join-item font-semibold ${filterStatus === 'CORRECT' ? 'btn-success text-success-content' : 'btn-ghost'}`}
            >
              Correct ({scoreResult.totalCorrect})
            </button>
            <button
              onClick={() => setFilterStatus('INCORRECT')}
              className={`btn btn-xs join-item font-semibold ${filterStatus === 'INCORRECT' ? 'btn-error text-error-content' : 'btn-ghost'}`}
            >
              Incorrect ({scoreResult.totalIncorrect})
            </button>
            <button
              onClick={() => setFilterStatus('UNATTEMPTED')}
              className={`btn btn-xs join-item font-semibold ${filterStatus === 'UNATTEMPTED' ? 'btn-neutral' : 'btn-ghost'}`}
            >
              Skipped ({scoreResult.totalUnattempted})
            </button>
          </div>
        </div>

        {/* Questions Cards */}
        <div className="space-y-4">
          {filteredQuestions.map((item, idx) => {
            const { question, score, sectionTitle } = item;
            const status = score?.status || 'UNATTEMPTED';

            let statusBadge = (
              <span className="badge badge-neutral gap-1 text-xs font-semibold">
                <HelpCircle className="size-3" /> Unattempted
              </span>
            );

            if (status === 'CORRECT') {
              statusBadge = (
                <span className="badge badge-success text-success-content gap-1 text-xs font-semibold">
                  <CheckCircle2 className="size-3" /> Correct (+{score?.marksAwarded})
                </span>
              );
            } else if (status === 'INCORRECT') {
              statusBadge = (
                <span className="badge badge-error text-error-content gap-1 text-xs font-semibold">
                  <XCircle className="size-3" /> Incorrect ({score?.marksAwarded})
                </span>
              );
            } else if (status === 'PARTIAL') {
              statusBadge = (
                <span className="badge badge-warning text-warning-content gap-1 text-xs font-semibold">
                  Partial (+{score?.marksAwarded})
                </span>
              );
            }

            return (
              <div
                key={question.id}
                onClick={() => setModalIndex(idx)}
                className="bg-card border-border/80 hover:border-primary/50 cursor-pointer rounded-2xl border p-5 shadow-xs space-y-4 transition-all group"
              >
                {/* Top Badge Banner */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-300/70 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="badge badge-sm font-bold font-mono">Q{idx + 1}</span>
                    <span className="text-xs font-semibold text-base-content/70">{sectionTitle}</span>
                    <span className="badge badge-ghost badge-xs font-mono">{question.type}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {statusBadge}
                    {score?.timeSpentSeconds ? (
                      <span className="text-xs font-mono text-base-content/60">
                        {formatTimeSeconds(score.timeSpentSeconds)}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Question Body with KaTeX */}
                <div className="text-sm leading-relaxed line-clamp-3">
                  <MathRenderer content={question.body} />
                </div>

                {/* Candidate Response Summary & Card Action */}
                <div className="flex flex-wrap items-center justify-between border-t border-border/40 pt-3 text-xs gap-2">
                  <div className="flex items-center gap-2 text-base-content/60">
                    {score?.candidateResponse !== null && score?.candidateResponse !== undefined ? (
                      <span className="font-mono text-xs">
                        Attempted:{' '}
                        <span className="font-bold">
                          {typeof score.candidateResponse === 'object'
                            ? JSON.stringify(score.candidateResponse)
                            : String(score.candidateResponse)}
                        </span>
                      </span>
                    ) : (
                      <span className="italic text-base-content/40">Unattempted</span>
                    )}
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setModalIndex(idx);
                    }}
                    className="btn btn-ghost btn-xs text-primary gap-1 font-semibold group-hover:bg-primary/10"
                  >
                    View Answer & Explanation
                    <ChevronRight className="size-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Interactive Question Detail Modal with Arrow Keys Navigation */}
      <QuestionDetailModal
        isOpen={modalIndex !== null}
        onClose={() => setModalIndex(null)}
        questions={filteredQuestions.map((i) => i.question)}
        currentIndex={modalIndex ?? 0}
        onNavigateIndex={(newIdx) => setModalIndex(newIdx)}
        scores={scoreResult.questionScores}
        titlePrefix="Q"
      />
    </div>
  );
}
