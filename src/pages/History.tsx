/**
 * Attempts History & Performance Tracker Page.
 * Displays past exam and practice attempts, accuracy trends, and direct links to review solutions.
 * Adheres strictly to docs/master_architecture_prompt_v2.md Sections 22 & 47.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Award,
  Calendar,
  Clock,
  ExternalLink,
  History as HistoryIcon,
  Play,
  RotateCcw,
  Sparkles,
  Trash2,
  Trophy,
} from 'lucide-react';
import { formatTimeSeconds } from '@/core/engine/timingEngine';
import { assessmentRepository } from '@/core/storage/repository';
import type { AttemptState } from '@/types/attempt';

export function History() {
  const navigate = useNavigate();
  const [attempts, setAttempts] = useState<AttemptState[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAttempts = async () => {
    setLoading(true);
    try {
      const data = await assessmentRepository.getAttempts();
      setAttempts(data);
    } catch (err) {
      console.error('Failed to load attempts history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttempts();
  }, []);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this attempt record?')) return;
    try {
      await assessmentRepository.deleteAttempt(id);
      await loadAttempts();
    } catch (err: any) {
      alert(`Failed to delete attempt: ${err.message || 'Unknown error'}`);
    }
  };

  // Aggregated analytics
  const completedAttempts = attempts.filter(
    (a) => (a.status === 'SCORED' || a.status === 'AUTO_SUBMITTED') && !!a.scoreResult
  );
  const totalCompleted = completedAttempts.length;

  const avgAccuracy =
    totalCompleted > 0
      ? Number(
          (
            completedAttempts.reduce((sum, a) => sum + (a.scoreResult?.accuracy || 0), 0) / totalCompleted
          ).toFixed(1)
        )
      : 0;

  const avgScorePercentage =
    totalCompleted > 0
      ? Number(
          (
            completedAttempts.reduce((sum, a) => sum + (a.scoreResult?.percentage || 0), 0) / totalCompleted
          ).toFixed(1)
        )
      : 0;

  const totalTimeSpent = completedAttempts.reduce(
    (sum, a) => sum + (a.scoreResult?.totalTimeSpentSeconds || 0),
    0
  );

  return (
    <div className="mx-auto min-h-screen max-w-7xl space-y-8 p-6 pb-36 md:p-10">
      {/* Header */}
      <div className="border-base-300 flex flex-col justify-between gap-4 border-b pb-6 md:flex-row md:items-center">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="badge badge-primary gap-1 font-medium shadow-sm">
              <HistoryIcon className="size-3.5" />
              Attempts Log
            </span>
            <span className="badge badge-outline border-base-300 gap-1 text-xs">
              <Award className="size-3" />
              {totalCompleted} Completed Mock Exam(s)
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">Past Attempts & Analytics</h1>
          <p className="text-base-content/70 mt-1 text-sm md:text-base">
            Review detailed historical performance, accuracy trends, and step-by-step derivations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/builder')} className="btn btn-primary gap-2 shadow-sm font-bold">
            <Play className="size-4 fill-current" />
            Start New Test
          </button>
        </div>
      </div>

      {/* Analytics Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Completed */}
        <div className="bg-base-100 border-base-300 rounded-box border p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-base-content/60">Tests Taken</div>
          <div className="text-primary mt-1 text-3xl font-black">{totalCompleted}</div>
          <div className="text-xs text-base-content/60 mt-1">Total recorded sessions</div>
        </div>

        {/* Average Score */}
        <div className="bg-base-100 border-base-300 rounded-box border p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-base-content/60">Avg. Score</div>
          <div className="text-secondary mt-1 text-3xl font-black">{avgScorePercentage}%</div>
          <div className="text-xs text-base-content/60 mt-1">Across all completed attempts</div>
        </div>

        {/* Average Accuracy */}
        <div className="bg-base-100 border-base-300 rounded-box border p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-base-content/60">Avg. Accuracy</div>
          <div className="text-accent mt-1 text-3xl font-black">{avgAccuracy}%</div>
          <div className="text-xs text-base-content/60 mt-1">Correct / Attempted ratio</div>
        </div>

        {/* Practice Time */}
        <div className="bg-base-100 border-base-300 rounded-box border p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wider text-base-content/60">Practice Time</div>
          <div className="mt-1 text-3xl font-black font-mono">{formatTimeSeconds(totalTimeSpent)}</div>
          <div className="text-xs text-base-content/70 mt-1 flex items-center gap-1">
            <Clock className="size-3" /> Monotonic tracked
          </div>
        </div>
      </div>

      {/* Attempts List */}
      <div className="space-y-4">
        <h3 className="text-xl font-bold flex items-center gap-2">
          <Trophy className="text-primary size-5" />
          Attempt History Records
        </h3>

        {loading ? (
          <div className="flex items-center justify-center p-12">
            <span className="loading loading-spinner loading-lg text-primary" />
          </div>
        ) : attempts.length === 0 ? (
          <div className="bg-base-200/40 border-base-300 rounded-box border p-12 text-center">
            <HistoryIcon className="text-base-content/30 mx-auto size-12" />
            <h3 className="mt-4 text-lg font-bold">No test attempts recorded yet</h3>
            <p className="text-base-content/60 mt-1 text-sm">
              Take your first mock examination or practice drill to see your scorecard and metrics.
            </p>
            <button onClick={() => navigate('/builder')} className="btn btn-primary btn-sm mt-4 gap-2 shadow-xs">
              <Play className="size-4 fill-current" />
              Launch Mock Test
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {attempts.map((att) => {
              const isScored = (att.status === 'SCORED' || att.status === 'AUTO_SUBMITTED') && !!att.scoreResult;
              const dateStr = new Date(att.startedAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={att.id}
                  className="bg-base-100 border-base-300 hover:border-primary/40 rounded-box flex flex-col justify-between gap-4 border p-5 shadow-sm transition-all sm:flex-row sm:items-center"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="badge badge-primary badge-sm font-semibold uppercase font-mono">
                        {att.snapshot.mode}
                      </span>
                      <span
                        className={`badge badge-sm font-bold ${
                          isScored
                            ? 'badge-success text-success-content'
                            : 'badge-warning text-warning-content'
                        }`}
                      >
                        {att.status}
                      </span>
                      <span className="text-xs text-base-content/60 flex items-center gap-1 font-mono">
                        <Calendar className="size-3" />
                        {dateStr}
                      </span>
                    </div>

                    <h4 className="text-base font-bold md:text-lg">{att.snapshot.testTitle}</h4>

                    {isScored && att.scoreResult && (
                      <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-base-content/80 pt-1">
                        <div>
                          Score:{' '}
                          <span className="text-primary font-mono text-sm font-bold">
                            {att.scoreResult.totalMarksAwarded} / {att.scoreResult.totalMaxMarks}
                          </span>
                        </div>
                        <div>
                          Accuracy:{' '}
                          <span className="text-secondary font-mono text-sm font-bold">
                            {att.scoreResult.accuracy}%
                          </span>
                        </div>
                        <div>
                          Time Spent:{' '}
                          <span className="font-mono text-sm">
                            {formatTimeSeconds(att.scoreResult.totalTimeSpentSeconds)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isScored ? (
                      <button
                        onClick={() => navigate(`/result/${att.id}`)}
                        className="btn btn-primary btn-sm gap-1.5 font-bold shadow-xs"
                      >
                        <Sparkles className="size-3.5" />
                        Review Solutions
                        <ExternalLink className="size-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => navigate(`/runner/${att.id}`)}
                        className="btn btn-secondary btn-sm gap-1.5 font-bold shadow-xs"
                      >
                        <RotateCcw className="size-3.5" />
                        Resume Attempt
                      </button>
                    )}

                    <button
                      onClick={(e) => handleDelete(e, att.id)}
                      className="btn btn-ghost btn-sm text-error btn-square"
                      title="Delete Record"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
