/**
 * Results & Solutions Review Page.
 * Detailed scorecard, section breakdowns, and question-by-question verified solutions.
 * Adheres strictly to docs/master_architecture_prompt_v2.md Section 22.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  AlertCircle,
  Award,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock,
  HelpCircle,
  Home,
  Target,
  XCircle,
} from 'lucide-react';
import { MathRenderer } from '@/components/shared/MathRenderer';
import { QuestionDetailModal } from '@/components/shared/QuestionDetailModal';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { formatTimeSeconds } from '@/core/engine/timingEngine';
import { assessmentRepository } from '@/core/storage/repository';
import { showNativeAlert } from '@/core/native/tauriBridge';
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
          await showNativeAlert('Attempt not found!', {
            title: 'Not Found',
            kind: 'warning',
          });
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
    }),
  );

  const filteredQuestions = allQuestionsWithScores.filter((item) => {
    if (filterStatus === 'ALL') return true;
    return item.score?.status === filterStatus;
  });

  // Performance badge tier
  let performanceTier = 'Needs Practice';
  let badgeClasses = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
  if (scoreResult.percentage >= 80) {
    performanceTier = 'Outstanding!';
    badgeClasses = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
  } else if (scoreResult.percentage >= 60) {
    performanceTier = 'Proficient';
    badgeClasses = 'bg-primary/10 text-primary border-primary/20';
  } else if (scoreResult.percentage >= 40) {
    performanceTier = 'Average';
    badgeClasses = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-6 py-5 pb-20 lg:px-8">
      {/* Standard Header */}
      <div className="border-border/60 flex flex-col justify-between gap-3 border-b pb-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-foreground text-xl font-bold tracking-tight">Scorecard</h1>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${badgeClasses}`}
            >
              {performanceTier}
            </span>
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs">{snapshot.testTitle}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/mistakes')}
            className="btn btn-ghost btn-sm h-7 gap-1.5 rounded-md px-2.5 text-xs"
          >
            <AlertCircle className="size-3.5" />
            Mistakes
          </button>
          <button
            onClick={() => navigate('/')}
            className="btn btn-primary btn-sm h-7 gap-1.5 rounded-md px-3 text-xs font-medium shadow-xs"
          >
            <Home className="size-3.5" />
            Papers
          </button>
        </div>
      </div>

      {/* Hero Stats Section */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Score */}
        <div className="card p-3.5 sm:p-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
              Total Score
            </span>
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
              <Award className="size-4" />
            </span>
          </div>
          <div className="text-foreground mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums">
            {scoreResult.totalMarksAwarded}{' '}
            <span className="text-muted-foreground text-xs font-normal">
              / {scoreResult.totalMaxMarks}
            </span>
          </div>
          <div className="text-muted-foreground mt-1 font-mono text-xs">
            {scoreResult.percentage}% Score
          </div>
        </div>

        {/* Accuracy */}
        <div className="card p-3.5 sm:p-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
              Accuracy
            </span>
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <Target className="size-4" />
            </span>
          </div>
          <div className="text-foreground mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums">
            {scoreResult.accuracy}%
          </div>
          <div className="text-muted-foreground mt-1 text-xs">
            {scoreResult.totalCorrect} of {scoreResult.totalAttempted} correct
          </div>
        </div>

        {/* Breakdown Counts */}
        <div className="card p-3.5 sm:p-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
              Breakdown
            </span>
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
              <BarChart3 className="size-4" />
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 font-mono text-xs font-medium">
            <span className="text-emerald-600 dark:text-emerald-400">
              {scoreResult.totalCorrect} Correct
            </span>{' '}
            ·
            <span className="text-rose-600 dark:text-rose-400">
              {scoreResult.totalIncorrect} Wrong
            </span>{' '}
            ·<span className="text-muted-foreground">{scoreResult.totalUnattempted} Left</span>
          </div>
          <div className="text-muted-foreground mt-1 font-mono text-xs">
            {allQuestionsWithScores.length} total questions
          </div>
        </div>

        {/* Total Time */}
        <div className="card p-3.5 sm:p-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
              Total Time
            </span>
            <span className="inline-flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <Clock className="size-4" />
            </span>
          </div>
          <div className="text-foreground mt-2 font-mono text-2xl font-bold tracking-tight tabular-nums">
            {formatTimeSeconds(scoreResult.totalTimeSpentSeconds)}
          </div>
          <div className="text-muted-foreground mt-1 font-mono text-xs">Time elapsed</div>
        </div>
      </div>

      {/* Section-Wise Breakdown Table */}
      <div className="card overflow-hidden shadow-xs">
        <div className="border-border/60 border-b px-4 py-3">
          <h3 className="text-foreground flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
            <BarChart3 className="text-primary size-3.5" />
            Section Performance
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="macos-table w-full text-xs">
            <thead>
              <tr className="border-border/60 bg-muted/20 text-muted-foreground border-b text-[10px] font-semibold tracking-wider uppercase">
                <th className="px-4 py-2.5 text-left">Section</th>
                <th className="px-3 py-2.5 text-center">Questions</th>
                <th className="px-3 py-2.5 text-center">Attempted</th>
                <th className="px-3 py-2.5 text-center">Correct</th>
                <th className="px-3 py-2.5 text-center">Incorrect</th>
                <th className="px-4 py-2.5 text-left">Accuracy</th>
                <th className="px-3 py-2.5 text-right">Score</th>
                <th className="px-4 py-2.5 text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-border/40 divide-y">
              {Object.values(scoreResult.sectionScores).map((sec) => (
                <tr
                  key={sec.sectionId}
                  className="transition-colors hover:bg-black/2 dark:hover:bg-white/3"
                >
                  <td className="text-foreground px-4 py-2.5 font-medium">{sec.sectionTitle}</td>
                  <td className="text-muted-foreground px-3 py-2.5 text-center font-mono">
                    {sec.totalQuestions}
                  </td>
                  <td className="text-muted-foreground px-3 py-2.5 text-center font-mono">
                    {sec.attemptedCount}
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    {sec.correctCount}
                  </td>
                  <td className="px-3 py-2.5 text-center font-mono font-semibold text-rose-600 dark:text-rose-400">
                    {sec.incorrectCount}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                        <div
                          className="bg-primary h-full rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(0, sec.accuracy))}%` }}
                        />
                      </div>
                      <span className="text-muted-foreground font-mono text-xs">
                        {sec.accuracy}%
                      </span>
                    </div>
                  </td>
                  <td className="text-foreground px-3 py-2.5 text-right font-mono font-medium">
                    {sec.marksAwarded} / {sec.maxMarks}
                  </td>
                  <td className="text-muted-foreground px-4 py-2.5 text-right font-mono text-xs">
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
            <h3 className="text-foreground text-base font-semibold">Solutions & Explanations</h3>
            <p className="text-muted-foreground text-xs">Step-by-step review for each question.</p>
          </div>

          {/* Filter Tabs */}
          <SegmentedControl
            value={filterStatus}
            onValueChange={(val) => setFilterStatus(val as typeof filterStatus)}
            options={[
              { value: 'ALL', label: `All (${allQuestionsWithScores.length})` },
              { value: 'CORRECT', label: `Correct (${scoreResult.totalCorrect})` },
              { value: 'INCORRECT', label: `Incorrect (${scoreResult.totalIncorrect})` },
              { value: 'UNATTEMPTED', label: `Skipped (${scoreResult.totalUnattempted})` },
            ]}
          />
        </div>

        {/* Questions Cards */}
        <div className="space-y-2.5">
          {filteredQuestions.map((item, idx) => {
            const { question, score, sectionTitle } = item;
            const status = score?.status || 'UNATTEMPTED';

            let statusBadge = (
              <span className="bg-muted text-muted-foreground border-border/60 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium">
                <HelpCircle className="size-3" /> Unattempted
              </span>
            );

            if (status === 'CORRECT') {
              statusBadge = (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-3" /> Correct (+{score?.marksAwarded})
                </span>
              );
            } else if (status === 'INCORRECT') {
              statusBadge = (
                <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-600 dark:text-rose-400">
                  <XCircle className="size-3" /> Incorrect ({score?.marksAwarded})
                </span>
              );
            } else if (status === 'PARTIAL') {
              statusBadge = (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
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
                className="card hover:border-primary/40 group focus-visible:ring-primary cursor-pointer space-y-2.5 p-4 shadow-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                {/* Top Badge Banner */}
                <div className="border-border/60 flex flex-wrap items-center justify-between gap-1.5 border-b pb-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="bg-muted text-foreground inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-bold">
                      Q{idx + 1}
                    </span>
                    <span className="text-foreground/80 text-xs font-semibold">{sectionTitle}</span>
                    <span className="bg-muted/60 text-muted-foreground border-border/60 inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px]">
                      {question.type}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {statusBadge}
                    {score?.timeSpentSeconds ? (
                      <span className="text-muted-foreground font-mono text-xs">
                        {formatTimeSeconds(score.timeSpentSeconds)}
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Question Body with KaTeX - Fully responsive with zero text clipping */}
                <div className="selectable-content text-foreground/90 overflow-visible text-xs leading-relaxed wrap-break-word">
                  <MathRenderer content={question.body} />
                </div>

                {/* Candidate Response Summary & Card Action */}
                <div className="border-border/50 flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs">
                  <div className="text-muted-foreground flex items-center gap-2">
                    {score?.candidateResponse !== null && score?.candidateResponse !== undefined ? (
                      <span className="font-mono text-xs">
                        Attempted:{' '}
                        <span className="text-foreground font-semibold">
                          {typeof score.candidateResponse === 'object'
                            ? JSON.stringify(score.candidateResponse)
                            : String(score.candidateResponse)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs italic">Unattempted</span>
                    )}
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setModalIndex(idx);
                    }}
                    className="btn btn-ghost btn-xs text-primary group-hover:bg-primary/10 gap-1 font-medium active:scale-95"
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
