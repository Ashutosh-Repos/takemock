import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Award,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Flame,
  Play,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';
import { formatTimeSeconds } from '@/core/engine/timingEngine';
import { assessmentRepository } from '@/core/storage/repository';

export function Analysis() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Awaited<
    ReturnType<typeof assessmentRepository.getComprehensiveAnalytics>
  > | null>(null);
  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>({});

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const res = await assessmentRepository.getComprehensiveAnalytics();
      setData(res);
      // Auto-expand first subject if available
      if (res.subjectBreakdown.length > 0) {
        setExpandedSubjects({ [res.subjectBreakdown[0].subject]: true });
      }
    } catch (err) {
      console.error('Failed to load comprehensive analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  const toggleSubject = (subj: string) => {
    setExpandedSubjects((prev) => ({ ...prev, [subj]: !prev[subj] }));
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-8">
        <span className="loading-spinner" />
        <p className="text-muted-foreground mt-3 text-xs font-medium">
          Aggregating your learning diagnostics...
        </p>
      </div>
    );
  }

  if (!data || data.completedAttempts === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <div className="bg-primary/10 text-primary mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl shadow-inner">
          <BarChart3 className="size-8" />
        </div>
        <h2 className="text-foreground text-xl font-bold tracking-tight md:text-2xl">
          No Assessment Data Yet
        </h2>
        <p className="text-muted-foreground mx-auto mt-2 max-w-md text-xs leading-relaxed">
          Your diagnostic analytics adapt dynamically to your mock exams and drills. Complete your
          first test or topic drill to see your accuracy and mastery breakdown.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="btn btn-primary btn-sm h-8 gap-1.5 px-3.5 font-medium shadow-xs"
          >
            <Play className="size-3.5 fill-current" />
            <span>Explore Papers & Tests</span>
          </button>
          <button
            onClick={() => navigate('/practice')}
            className="btn btn-outline btn-sm h-8 gap-1.5 px-3.5 font-medium"
          >
            <Zap className="size-3.5" />
            <span>Start Topic Drills</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-6 py-5 pb-20 lg:px-8">
      {/* Standard Header */}
      <div className="border-border/60 border-b pb-3">
        <h1 className="text-foreground text-xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {data.completedAttempts} test{data.completedAttempts !== 1 ? 's' : ''} completed.
          Historical performance and cognitive mastery.
        </p>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
              Overall Accuracy
            </span>
            <div className="rounded-lg bg-purple-500/10 p-2 text-purple-600 dark:text-purple-400">
              <TrendingUp className="size-3.5" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <span className="text-foreground font-mono text-2xl font-bold tracking-tight tabular-nums">
              {data.overallAccuracy}%
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">
            {data.totalQuestionsCorrect} of {data.totalQuestionsAttempted} correct
          </p>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
              Average Score
            </span>
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400">
              <Award className="size-3.5" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-foreground font-mono text-2xl font-bold tracking-tight tabular-nums">
              {data.overallScorePercentage}%
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">
            Across {data.completedAttempts} test{data.completedAttempts !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
              Speed Per Question
            </span>
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
              <Clock className="size-3.5" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <span className="text-foreground font-mono text-2xl font-bold tracking-tight tabular-nums">
              {data.averageTimePerQuestionSeconds}s
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">Average response pace</p>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
              Total Time
            </span>
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
              <Flame className="size-3.5" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <span className="text-foreground font-mono text-2xl font-bold tracking-tight tabular-nums">
              {Math.round(data.totalTimeSpentSeconds / 60)}m
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">
            {formatTimeSeconds(data.totalTimeSpentSeconds)} total practice
          </p>
        </div>
      </div>

      {/* Dynamic Subject & Topic Performance */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-foreground text-base font-semibold tracking-tight">
              Subject & Topic Performance
            </h2>
            <p className="text-muted-foreground text-xs">
              Performance breakdown across subjects and topics.
            </p>
          </div>
          <span className="text-muted-foreground border-border/50 inline-flex items-center rounded-full border bg-black/4 px-2 py-0.5 font-mono text-[11px] font-medium dark:bg-white/6">
            {data.subjectBreakdown.length} subject{data.subjectBreakdown.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="space-y-2.5">
          {data.subjectBreakdown.map((subj) => {
            const isExpanded = !!expandedSubjects[subj.subject];
            return (
              <div key={subj.subject} className="card overflow-hidden transition-all">
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onClick={() => toggleSubject(subj.subject)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleSubject(subj.subject);
                    }
                  }}
                  className="flex cursor-pointer flex-col gap-2.5 p-3.5 transition-colors select-none hover:bg-black/2.5 sm:flex-row sm:items-center sm:justify-between dark:hover:bg-white/4"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="btn-icon btn-ghost btn-xs text-muted-foreground">
                      {isExpanded ? (
                        <ChevronDown className="size-3.5" />
                      ) : (
                        <ChevronRight className="size-3.5" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-foreground text-[13px] font-semibold tracking-tight">
                        {subj.subject}
                      </h3>
                      <p className="text-muted-foreground mt-0.5 text-[11px]">
                        {subj.topics.length} topic{subj.topics.length !== 1 ? 's' : ''} •{' '}
                        {subj.total} question{subj.total !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 pl-8 sm:pl-0">
                    <div className="w-32 text-right">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="text-muted-foreground text-[11px]">Accuracy</span>
                        <span className="text-foreground font-mono font-semibold">
                          {subj.accuracy}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            subj.accuracy >= 75
                              ? 'bg-emerald-500'
                              : subj.accuracy >= 50
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                          }`}
                          style={{ width: `${subj.accuracy}%` }}
                        />
                      </div>
                    </div>

                    <div className="hidden items-center gap-2 font-mono text-xs md:flex">
                      <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-3" />
                        {subj.correct}
                      </span>
                      <span className="flex items-center gap-1 font-medium text-rose-600 dark:text-rose-400">
                        <XCircle className="size-3" />
                        {subj.incorrect}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/practice?subject=${encodeURIComponent(subj.subject)}`);
                      }}
                      className="btn btn-ghost btn-xs text-primary gap-0.5"
                    >
                      <span>Drills</span>
                      <ChevronRight className="size-3" />
                    </button>
                  </div>
                </div>

                {/* Expanded Topics Sub-List */}
                {isExpanded && subj.topics.length > 0 && (
                  <div className="border-border/40 border-t bg-black/2 p-3.5 dark:bg-white/2">
                    <h4 className="text-muted-foreground mb-2.5 text-[11px] font-semibold tracking-wider uppercase">
                      Topic Breakdown ({subj.subject})
                    </h4>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                      {subj.topics.map((top) => (
                        <div key={top.topic} className="card flex flex-col justify-between p-3">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-foreground truncate text-xs font-medium">
                              {top.topic}
                            </span>
                            <span
                              className={`inline-flex items-center rounded-full border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                                top.accuracy >= 75
                                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : top.accuracy >= 50
                                    ? 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                    : 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400'
                              }`}
                            >
                              {top.accuracy}%
                            </span>
                          </div>

                          <div className="text-muted-foreground mt-2.5 flex items-center justify-between font-mono text-[11px]">
                            <span>
                              {top.correct} / {top.total} correct
                            </span>
                            <button
                              onClick={() =>
                                navigate(
                                  `/practice?subject=${encodeURIComponent(subj.subject)}&topic=${encodeURIComponent(
                                    top.topic,
                                  )}`,
                                )
                              }
                              className="text-primary font-sans text-[11px] font-medium hover:underline"
                            >
                              Drill Topic →
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Difficulty & Question Type Breakdown Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Difficulty Breakdown */}
        <div className="card p-4">
          <h3 className="text-foreground text-sm font-semibold">Mastery by Difficulty</h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Performance across difficulty tiers
          </p>

          <div className="mt-3.5 space-y-3">
            {(['easy', 'medium', 'hard'] as const).map((diff) => {
              const item = data.difficultyBreakdown[diff];
              const color =
                diff === 'easy'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : diff === 'medium'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-rose-600 dark:text-rose-400';
              const progressBg =
                diff === 'easy'
                  ? 'bg-emerald-500'
                  : diff === 'medium'
                    ? 'bg-amber-500'
                    : 'bg-rose-500';
              return (
                <div key={diff} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-semibold capitalize ${color}`}>{diff}</span>
                    <span className="text-muted-foreground font-mono text-[11px]">
                      {item.correct} / {item.total} ({item.accuracy}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${progressBg}`}
                      style={{ width: `${item.accuracy}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Question Type Breakdown */}
        <div className="card p-4">
          <h3 className="text-foreground text-sm font-semibold">Question Format Accuracy</h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Single choice, multiple selection, and numerical
          </p>

          <div className="mt-3.5 space-y-3">
            {Object.entries(data.typeBreakdown).map(([typeName, tInfo]) => {
              const formattedName = typeName
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (c) => c.toUpperCase());
              return (
                <div key={typeName} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-foreground font-medium">{formattedName}</span>
                    <span className="text-muted-foreground font-mono text-[11px]">
                      {tInfo.correct} / {tInfo.total} ({tInfo.accuracy}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                    <div
                      className="bg-primary h-full rounded-full transition-all duration-300"
                      style={{ width: `${tInfo.accuracy}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent Attempts History Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-foreground text-base font-semibold tracking-tight">
              Recent Attempts
            </h2>
            <p className="text-muted-foreground text-xs">Test scores and completion history.</p>
          </div>
          <span className="text-muted-foreground border-border/50 inline-flex items-center rounded-full border bg-black/4 px-2 py-0.5 font-mono text-[11px] font-medium dark:bg-white/6">
            {data.recentScoreTrends.length} attempt{data.recentScoreTrends.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="card overflow-hidden">
          <table className="table">
            <thead>
              <tr className="border-border/80 border-b">
                <th className="text-muted-foreground px-3.5 py-2.5 text-[11px] font-semibold tracking-wider uppercase">
                  Exam / Paper
                </th>
                <th className="text-muted-foreground px-3 py-2.5 text-[11px] font-semibold tracking-wider uppercase">
                  Date
                </th>
                <th className="text-muted-foreground px-3 py-2.5 text-[11px] font-semibold tracking-wider uppercase">
                  Score
                </th>
                <th className="text-muted-foreground px-3 py-2.5 text-[11px] font-semibold tracking-wider uppercase">
                  Accuracy
                </th>
                <th className="text-muted-foreground px-3 py-2.5 text-[11px] font-semibold tracking-wider uppercase">
                  Duration
                </th>
                <th className="text-muted-foreground px-3.5 py-2.5 text-right text-[11px] font-semibold tracking-wider uppercase">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {data.recentScoreTrends.map((att) => (
                <tr
                  key={att.attemptId}
                  className="border-border/40 border-b transition-colors hover:bg-black/2.5 dark:hover:bg-white/4"
                >
                  <td className="text-foreground px-3.5 py-3 text-[13px] font-medium">
                    {att.testTitle}
                  </td>
                  <td className="text-muted-foreground px-3 py-3 text-[12px]">
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3" />
                      {new Date(att.date).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="font-mono text-xs font-semibold">{att.scorePercentage}%</span>
                    <span className="text-muted-foreground ml-1 font-mono text-[11px]">
                      ({att.totalMarks}/{att.maxMarks})
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[11px] font-medium ${
                        att.accuracy >= 75
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : att.accuracy >= 50
                            ? 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400'
                      }`}
                    >
                      {att.accuracy}%
                    </span>
                  </td>
                  <td className="text-muted-foreground px-3 py-3 text-[12px]">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="size-3" />
                      {formatTimeSeconds(att.timeSpentSeconds)}
                    </span>
                  </td>
                  <td className="px-3.5 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => navigate(`/result/${att.attemptId}`)}
                      aria-label={`View scorecard for ${att.testTitle}`}
                      className="btn btn-ghost btn-xs text-primary gap-1"
                    >
                      <span>Scorecard</span>
                      <ExternalLink className="size-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
