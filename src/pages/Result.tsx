/**
 * Results & Solutions Review Page.
 * Detailed scorecard, section breakdowns, and question-by-question verified solutions.
 * Adheres strictly to docs/master_architecture_prompt_v2.md Section 22.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock,
  HelpCircle,
  Home,
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
    <div className="mx-auto min-h-screen max-w-7xl space-y-6 p-4 pb-36 md:p-6">
      {/* Header */}
      <div className="border-border flex flex-col justify-between gap-3 border-b pb-4 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight md:text-xl text-foreground">Scorecard</h1>
            <span className={`badge ${badgeColor} badge-xs font-semibold`}>
              {performanceTier}
            </span>
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {snapshot.testTitle}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/mistakes')} className="btn btn-ghost btn-sm gap-1.5 text-xs rounded-md">
            <AlertCircle className="size-3.5" />
            Mistakes
          </button>
          <button onClick={() => navigate('/')} className="btn btn-primary btn-sm gap-1.5 text-xs font-medium rounded-md shadow-xs">
            <Home className="size-3.5" />
            Home
          </button>
        </div>
      </div>

      {/* Hero Stats Section */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Score */}
        <div className="bg-card border-border rounded-lg border p-3.5 shadow-2xs">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Total Score</div>
          <div className="text-primary mt-1 text-2xl font-bold font-mono tabular-nums">
            {scoreResult.totalMarksAwarded}{' '}
            <span className="text-xs font-normal text-muted-foreground">/ {scoreResult.totalMaxMarks}</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1 font-mono">{scoreResult.percentage}% Score</div>
        </div>

        {/* Accuracy */}
        <div className="bg-card border-border rounded-lg border p-3.5 shadow-2xs">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Accuracy</div>
          <div className="text-foreground mt-1 text-2xl font-bold font-mono tabular-nums">{scoreResult.accuracy}%</div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {scoreResult.totalCorrect} of {scoreResult.totalAttempted} correct
          </div>
        </div>

        {/* Breakdown Counts */}
        <div className="bg-card border-border rounded-lg border p-3.5 shadow-2xs">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Breakdown</div>
          <div className="flex items-center gap-1.5 mt-1 font-medium text-xs font-mono">
            <span className="text-emerald-600 dark:text-emerald-400">{scoreResult.totalCorrect} Correct</span> ·
            <span className="text-rose-600 dark:text-rose-400">{scoreResult.totalIncorrect} Wrong</span> ·
            <span className="text-muted-foreground">{scoreResult.totalUnattempted} Left</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-1 font-mono">
            {allQuestionsWithScores.length} total questions
          </div>
        </div>

        {/* Time Spent */}
        <div className="bg-card border-border rounded-lg border p-3.5 shadow-2xs">
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Total Time</div>
          <div className="text-foreground mt-1 text-2xl font-bold font-mono tabular-nums">
            {formatTimeSeconds(scoreResult.totalTimeSpentSeconds)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1 font-mono">
            <Clock className="size-3" /> Time elapsed
          </div>
        </div>
      </div>

      {/* Section-Wise Breakdown Table */}
      <div className="bg-card border-border rounded-lg overflow-hidden border shadow-2xs">
        <div className="border-border border-b p-3 sm:p-3.5">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <BarChart3 className="text-primary size-4" />
            Section Performance
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="table table-zebra w-full text-xs">
            <thead>
              <tr className="text-muted-foreground text-[11px] uppercase tracking-wider border-border bg-muted/40">
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
                <tr key={sec.sectionId} className="hover:bg-muted/30">
                  <td className="font-semibold text-foreground">{sec.sectionTitle}</td>
                  <td className="font-mono">{sec.totalQuestions}</td>
                  <td className="font-mono">{sec.attemptedCount}</td>
                  <td className="text-emerald-600 dark:text-emerald-400 font-semibold font-mono">{sec.correctCount}</td>
                  <td className="text-rose-600 dark:text-rose-400 font-semibold font-mono">{sec.incorrectCount}</td>
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
                  <td className="font-semibold font-mono">
                    {sec.marksAwarded} / {sec.maxMarks}
                  </td>
                  <td className="font-mono text-xs text-muted-foreground">
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
      <div className="space-y-3">
        <div className="flex flex-col justify-between gap-2.5 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-base font-semibold text-foreground">Solutions & Explanations</h3>
            <p className="text-xs text-muted-foreground">
              Step-by-step review for each question.
            </p>
          </div>

          {/* Filter Tabs */}
          <div className="join bg-muted/50 p-0.5 rounded-md border border-border">
            <button
              onClick={() => setFilterStatus('ALL')}
              className={`btn btn-xs join-item font-medium rounded-md ${filterStatus === 'ALL' ? 'btn-primary' : 'btn-ghost'}`}
            >
              All ({allQuestionsWithScores.length})
            </button>
            <button
              onClick={() => setFilterStatus('CORRECT')}
              className={`btn btn-xs join-item font-medium rounded-md ${filterStatus === 'CORRECT' ? 'btn-success text-success-content' : 'btn-ghost'}`}
            >
              Correct ({scoreResult.totalCorrect})
            </button>
            <button
              onClick={() => setFilterStatus('INCORRECT')}
              className={`btn btn-xs join-item font-medium rounded-md ${filterStatus === 'INCORRECT' ? 'btn-error text-error-content' : 'btn-ghost'}`}
            >
              Incorrect ({scoreResult.totalIncorrect})
            </button>
            <button
              onClick={() => setFilterStatus('UNATTEMPTED')}
              className={`btn btn-xs join-item font-medium rounded-md ${filterStatus === 'UNATTEMPTED' ? 'btn-neutral' : 'btn-ghost'}`}
            >
              Skipped ({scoreResult.totalUnattempted})
            </button>
          </div>
        </div>

        {/* Questions Cards */}
        <div className="space-y-2.5">
          {filteredQuestions.map((item, idx) => {
            const { question, score, sectionTitle } = item;
            const status = score?.status || 'UNATTEMPTED';

            let statusBadge = (
              <span className="badge badge-neutral gap-1 text-[11px] font-medium">
                <HelpCircle className="size-3" /> Unattempted
              </span>
            );

            if (status === 'CORRECT') {
              statusBadge = (
                <span className="badge badge-success text-success-content gap-1 text-[11px] font-medium">
                  <CheckCircle2 className="size-3" /> Correct (+{score?.marksAwarded})
                </span>
              );
            } else if (status === 'INCORRECT') {
              statusBadge = (
                <span className="badge badge-error text-error-content gap-1 text-[11px] font-medium">
                  <XCircle className="size-3" /> Incorrect ({score?.marksAwarded})
                </span>
              );
            } else if (status === 'PARTIAL') {
              statusBadge = (
                <span className="badge badge-warning text-warning-content gap-1 text-[11px] font-medium">
                  Partial (+{score?.marksAwarded})
                </span>
              );
            }

            return (
              <div
                key={question.id}
                onClick={() => setModalIndex(idx)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setModalIndex(idx);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`Question ${idx + 1}, ${status.toLowerCase()}. Click to inspect answer and explanation.`}
                className="bg-card border-border hover:border-primary/50 cursor-pointer rounded-lg border p-4 shadow-2xs space-y-2.5 transition-all duration-150 active:scale-[0.99] group focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              >
                {/* Top Badge Banner */}
                <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-border/60 pb-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="badge badge-xs font-bold font-mono">Q{idx + 1}</span>
                    <span className="text-xs font-semibold text-foreground/80">{sectionTitle}</span>
                    <span className="badge badge-ghost badge-xs font-mono text-[10px]">{question.type}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {statusBadge}
                    {score?.timeSpentSeconds ? (
                      <span className="text-xs font-mono text-muted-foreground">
                        {formatTimeSeconds(score.timeSpentSeconds)}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Question Body with KaTeX */}
                <div className="text-xs leading-relaxed line-clamp-2 md:line-clamp-3 selectable-content text-foreground/90">
                  <MathRenderer content={question.body} />
                </div>

                {/* Candidate Response Summary & Card Action */}
                <div className="flex flex-wrap items-center justify-between border-t border-border/50 pt-2 text-xs gap-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {score?.candidateResponse !== null && score?.candidateResponse !== undefined ? (
                      <span className="font-mono text-xs">
                        Attempted:{' '}
                        <span className="font-semibold text-foreground">
                          {typeof score.candidateResponse === 'object'
                            ? JSON.stringify(score.candidateResponse)
                            : String(score.candidateResponse)}
                        </span>
                      </span>
                    ) : (
                      <span className="italic text-muted-foreground text-xs">Unattempted</span>
                    )}
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setModalIndex(idx);
                    }}
                    className="btn btn-ghost btn-xs text-primary gap-1 font-medium group-hover:bg-primary/10 active:scale-95"
                  >
                    View Answer & Explanation
                    <ChevronRight className="size-3" />
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
