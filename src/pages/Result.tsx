/**
 * Results & Solutions Review Page.
 * Detailed scorecard, section breakdowns, and question-by-question verified solutions.
 * Adheres strictly to docs/master_architecture_prompt_v2.md Section 22.
 */

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Award,
  BarChart3,
  CheckCircle2,
  Clock,
  HelpCircle,
  RotateCcw,
  Sparkles,
  Trophy,
  XCircle,
} from 'lucide-react';
import { MathRenderer } from '@/components/shared/MathRenderer';
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
      <div className="border-base-300 flex flex-col justify-between gap-4 border-b pb-6 md:flex-row md:items-center">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className={`badge ${badgeColor} gap-1 font-bold shadow-sm`}>
              <Trophy className="size-3.5" />
              {performanceTier}
            </span>
            <span className="badge badge-outline border-base-300 gap-1 text-xs">
              <Award className="size-3" />
              Evaluated via Pure Scoring Engine
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">Performance Scorecard</h1>
          <p className="text-base-content/70 mt-1 text-sm md:text-base">
            Detailed score breakdown and verified derivations for <span className="font-semibold text-base-content">{snapshot.testTitle}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/builder')} className="btn btn-primary gap-2 shadow-sm font-bold">
            <RotateCcw className="size-4" />
            Retake or Build Test
          </button>
        </div>
      </div>

      {/* Hero Stats Section */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Score */}
        <div className="bg-base-100 border-base-300 rounded-box border p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-base-content/60">Total Score</div>
          <div className="text-primary mt-1 text-3xl font-black">
            {scoreResult.totalMarksAwarded}{' '}
            <span className="text-sm font-normal text-base-content/60">/ {scoreResult.totalMaxMarks}</span>
          </div>
          <div className="text-xs text-base-content/70 mt-1 font-mono">{scoreResult.percentage}% Score</div>
        </div>

        {/* Accuracy */}
        <div className="bg-base-100 border-base-300 rounded-box border p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-base-content/60">Accuracy</div>
          <div className="text-secondary mt-1 text-3xl font-black">{scoreResult.accuracy}%</div>
          <div className="text-xs text-base-content/70 mt-1">
            {scoreResult.totalCorrect} correct of {scoreResult.totalAttempted} attempted
          </div>
        </div>

        {/* Breakdown Counts */}
        <div className="bg-base-100 border-base-300 rounded-box border p-5 shadow-sm">
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
        <div className="bg-base-100 border-base-300 rounded-box border p-5 shadow-sm">
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
      <div className="bg-base-100 border-base-300 rounded-box overflow-hidden border shadow-sm">
        <div className="border-base-300 border-b p-5">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <BarChart3 className="text-primary size-5" />
            Section-Wise Performance
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="table table-zebra w-full text-sm">
            <thead>
              <tr className="text-base-content/70 text-xs">
                <th>Section</th>
                <th>Questions</th>
                <th>Attempted</th>
                <th>Correct</th>
                <th>Incorrect</th>
                <th>Accuracy</th>
                <th>Score</th>
                <th>Time Spent</th>
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
                        className="progress progress-primary w-16"
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
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Sparkles className="text-primary size-5" />
              Detailed Solutions & Question Review
            </h3>
            <p className="text-xs text-base-content/60">
              Review full step-by-step mathematical derivations and compare your answers.
            </p>
          </div>

          {/* Filter Tabs */}
          <div className="tabs tabs-boxed bg-base-200/60 p-1 flex-wrap">
            <button
              onClick={() => setFilterStatus('ALL')}
              className={`tab tab-sm font-semibold ${filterStatus === 'ALL' ? 'tab-active bg-primary text-primary-content shadow-xs' : ''}`}
            >
              All ({allQuestionsWithScores.length})
            </button>
            <button
              onClick={() => setFilterStatus('CORRECT')}
              className={`tab tab-sm font-semibold ${filterStatus === 'CORRECT' ? 'tab-active bg-success text-success-content shadow-xs' : ''}`}
            >
              Correct ({scoreResult.totalCorrect})
            </button>
            <button
              onClick={() => setFilterStatus('INCORRECT')}
              className={`tab tab-sm font-semibold ${filterStatus === 'INCORRECT' ? 'tab-active bg-error text-error-content shadow-xs' : ''}`}
            >
              Incorrect ({scoreResult.totalIncorrect})
            </button>
            <button
              onClick={() => setFilterStatus('UNATTEMPTED')}
              className={`tab tab-sm font-semibold ${filterStatus === 'UNATTEMPTED' ? 'tab-active bg-neutral text-neutral-content shadow-xs' : ''}`}
            >
              Skipped ({scoreResult.totalUnattempted})
            </button>
          </div>
        </div>

        {/* Questions Cards */}
        <div className="space-y-6">
          {filteredQuestions.map((item, idx) => {
            const { question, score, sectionTitle } = item;
            const status = score?.status || 'UNATTEMPTED';

            let statusBadge = (
              <span className="badge badge-neutral gap-1 text-xs font-semibold">
                <HelpCircle className="size-3" /> Unattempted (0 marks)
              </span>
            );

            if (status === 'CORRECT') {
              statusBadge = (
                <span className="badge badge-success text-success-content gap-1 text-xs font-semibold">
                  <CheckCircle2 className="size-3" /> Correct (+{score?.marksAwarded} marks)
                </span>
              );
            } else if (status === 'INCORRECT') {
              statusBadge = (
                <span className="badge badge-error text-error-content gap-1 text-xs font-semibold">
                  <XCircle className="size-3" /> Incorrect ({score?.marksAwarded} marks)
                </span>
              );
            } else if (status === 'PARTIAL') {
              statusBadge = (
                <span className="badge badge-warning text-warning-content gap-1 text-xs font-semibold">
                  Partial (+{score?.marksAwarded} marks)
                </span>
              );
            }

            return (
              <div
                key={question.id}
                className="bg-base-100 border-base-300 rounded-box border p-6 shadow-sm space-y-4"
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
                <div className="text-base leading-relaxed">
                  <MathRenderer content={question.body} />
                </div>

                {/* Answer Comparison */}
                <div className="bg-base-200/50 rounded-xl border border-base-300 p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-base-content/60 mb-1">
                      Your Response
                    </div>
                    <div className="font-mono font-medium">
                      {score?.candidateResponse !== null && score?.candidateResponse !== undefined ? (
                        typeof score.candidateResponse === 'object' ? (
                          <pre className="text-xs">{JSON.stringify(score.candidateResponse, null, 2)}</pre>
                        ) : (
                          String(score.candidateResponse)
                        )
                      ) : (
                        <span className="text-base-content/40 italic">Not attempted</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-success mb-1">
                      Correct Answer
                    </div>
                    <div className="font-mono font-bold text-success">
                      {typeof score?.correctAnswer === 'object' ? (
                        <pre className="text-xs">{JSON.stringify(score?.correctAnswer, null, 2)}</pre>
                      ) : (
                        String(score?.correctAnswer || 'N/A')
                      )}
                    </div>
                  </div>
                </div>

                {/* Verified Derivation & Solution */}
                {question.solution && (
                  <div className="bg-primary/5 border-primary/20 rounded-xl border p-4 text-sm">
                    <div className="text-primary flex items-center gap-1.5 mb-2 text-xs font-bold uppercase tracking-wider">
                      <Sparkles className="size-4" />
                      Verified Derivation & Explanation
                    </div>
                    <MathRenderer content={question.solution} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
