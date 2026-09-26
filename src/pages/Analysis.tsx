import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertCircle,
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
  const [data, setData] = useState<Awaited<ReturnType<typeof assessmentRepository.getComprehensiveAnalytics>> | null>(
    null
  );
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
        <span className="loading loading-spinner text-primary loading-lg" />
        <p className="text-base-content/60 mt-4 text-sm font-medium">Aggregating your learning diagnostics...</p>
      </div>
    );
  }

  if (!data || data.completedAttempts === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 text-center">
        <div className="bg-primary/10 text-primary mx-auto mb-6 flex size-20 items-center justify-center rounded-3xl shadow-inner">
          <BarChart3 className="size-10" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight md:text-3xl">No Assessment Data Yet</h2>
        <p className="text-base-content/70 mx-auto mt-3 max-w-md text-sm leading-relaxed">
          Your diagnostic analytics adapt 100% dynamically to whatever subjects and topics you study. Complete your
          first mock test or practice drill to see your accuracy and mastery breakdown.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button onClick={() => navigate('/')} className="btn btn-primary shadow-md">
            <Play className="size-4" />
            Explore Papers & Tests
          </button>
          <button onClick={() => navigate('/practice')} className="btn btn-outline">
            <Zap className="size-4" />
            Start Topic Drills
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl w-full px-6 py-6 pb-20 space-y-6">
      {/* Standard Header */}
      <div className="flex flex-col justify-between gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Analysis</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {data.completedAttempts} test{data.completedAttempts !== 1 ? 's' : ''} completed. Historical performance and topic breakdown.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/mistakes')}
            className="btn btn-ghost btn-sm h-7 px-2.5 gap-1.5 text-xs rounded-md"
          >
            <AlertCircle className="size-3.5" />
            Mistakes
          </button>
          <button
            onClick={() => navigate('/practice')}
            className="btn btn-primary btn-sm h-7 px-3 gap-1.5 text-xs font-medium shadow-xs rounded-md"
          >
            <Zap className="size-3.5" />
            Drills
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">Overall Accuracy</span>
            <div className="p-1.5 rounded-md bg-muted text-purple-600 dark:text-purple-400">
              <TrendingUp className="size-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono tabular-nums tracking-tight text-foreground">{data.overallAccuracy}%</span>
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">
            {data.totalQuestionsCorrect} of {data.totalQuestionsAttempted} correct
          </p>
        </div>

        <div className="card p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">Average Score</span>
            <div className="p-1.5 rounded-md bg-muted text-blue-600 dark:text-blue-400">
              <Award className="size-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums tracking-tight text-foreground">{data.overallScorePercentage}%</span>
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">Across {data.completedAttempts} test{data.completedAttempts !== 1 ? 's' : ''}</p>
        </div>

        <div className="card p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">Speed Per Question</span>
            <div className="p-1.5 rounded-md bg-muted text-amber-600 dark:text-amber-400">
              <Clock className="size-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono tabular-nums tracking-tight text-foreground">{data.averageTimePerQuestionSeconds}s</span>
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">Average response pace</p>
        </div>

        <div className="card p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[11px] font-medium uppercase tracking-wider">Total Time</span>
            <div className="p-1.5 rounded-md bg-muted text-emerald-600 dark:text-emerald-400">
              <Flame className="size-3.5" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold font-mono tabular-nums tracking-tight text-foreground">
              {Math.round(data.totalTimeSpentSeconds / 60)}m
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-[11px]">{formatTimeSeconds(data.totalTimeSpentSeconds)} total practice</p>
        </div>
      </div>

      {/* Dynamic Subject & Topic Performance */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">Subject & Topic Performance</h2>
            <p className="text-muted-foreground text-xs">
              Performance breakdown across subjects and topics.
            </p>
          </div>
          <span className="badge badge-ghost badge-sm text-[11px]">{data.subjectBreakdown.length} subject{data.subjectBreakdown.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="space-y-2.5">
          {data.subjectBreakdown.map((subj) => {
            const isExpanded = !!expandedSubjects[subj.subject];
            return (
              <div
                key={subj.subject}
                className="card overflow-hidden rounded-xl transition-all"
              >
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
                  className="hover:bg-muted/40 active:scale-[0.99] transition-transform flex cursor-pointer flex-col gap-2.5 p-3.5 select-none sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="btn btn-ghost btn-xs btn-square pointer-events-none text-muted-foreground">
                      {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-foreground">{subj.subject}</h3>
                      <p className="text-muted-foreground text-xs">
                        {subj.topics.length} topic{subj.topics.length !== 1 ? 's' : ''} • {subj.total} question{subj.total !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3.5 pl-8 sm:pl-0">
                    <div className="w-32 text-right">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="text-muted-foreground text-[11px]">Accuracy</span>
                        <span className="font-mono">{subj.accuracy}%</span>
                      </div>
                      <progress
                        className={`progress mt-1 h-1.5 w-full ${
                          subj.accuracy >= 75
                            ? 'progress-success'
                            : subj.accuracy >= 50
                            ? 'progress-warning'
                            : 'progress-error'
                        }`}
                        value={subj.accuracy}
                        max="100"
                      />
                    </div>

                    <div className="hidden items-center gap-2 text-xs md:flex font-mono">
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                        <CheckCircle2 className="size-3" />
                        {subj.correct}
                      </span>
                      <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1 font-medium">
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
                      className="btn btn-ghost btn-xs text-primary gap-0.5 active:scale-95"
                    >
                      Drills
                      <ChevronRight className="size-3" />
                    </button>
                  </div>
                </div>

                {/* Expanded Topics Sub-List */}
                {isExpanded && subj.topics.length > 0 && (
                  <div className="bg-muted/30 border-border border-t p-3">
                    <h4 className="text-muted-foreground mb-2.5 text-[11px] font-semibold uppercase tracking-wider">
                      Topic Breakdown ({subj.subject})
                    </h4>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {subj.topics.map((top) => (
                        <div
                          key={top.topic}
                          className="bg-card border-border flex flex-col justify-between rounded-md border p-2.5 shadow-2xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-medium truncate text-foreground">{top.topic}</span>
                            <span
                              className={`badge badge-xs font-semibold font-mono ${
                                top.accuracy >= 75
                                  ? 'badge-success text-success-content'
                                  : top.accuracy >= 50
                                  ? 'badge-warning text-warning-content'
                                  : 'badge-error text-error-content'
                              }`}
                            >
                              {top.accuracy}%
                            </span>
                          </div>

                          <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                            <span>
                              {top.correct} / {top.total} correct
                            </span>
                            <button
                              onClick={() =>
                                navigate(
                                  `/practice?subject=${encodeURIComponent(subj.subject)}&topic=${encodeURIComponent(
                                    top.topic
                                  )}`
                                )
                              }
                              className="text-primary hover:underline font-sans font-medium text-[11px]"
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
          <h3 className="font-semibold text-sm text-foreground">Mastery by Difficulty</h3>
          <p className="text-muted-foreground text-xs mt-0.5">Performance across difficulty tiers</p>

          <div className="mt-3.5 space-y-3">
            {(['easy', 'medium', 'hard'] as const).map((diff) => {
              const item = data.difficultyBreakdown[diff];
              const color =
                diff === 'easy' ? 'text-emerald-600 dark:text-emerald-400' : diff === 'medium' ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';
              const progressColor =
                diff === 'easy'
                  ? 'progress-success'
                  : diff === 'medium'
                  ? 'progress-warning'
                  : 'progress-error';
              return (
                <div key={diff} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-semibold capitalize ${color}`}>{diff}</span>
                    <span className="font-mono text-muted-foreground text-[11px]">
                      {item.correct} / {item.total} ({item.accuracy}%)
                    </span>
                  </div>
                  <progress
                    className={`progress ${progressColor} h-1.5 w-full`}
                    value={item.accuracy}
                    max="100"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Question Type Breakdown */}
        <div className="card p-4">
          <h3 className="font-semibold text-sm text-foreground">Question Format Accuracy</h3>
          <p className="text-muted-foreground text-xs mt-0.5">Single choice, multiple selection, and numerical</p>

          <div className="mt-3.5 space-y-3">
            {Object.entries(data.typeBreakdown).map(([typeName, tInfo]) => {
              const formattedName = typeName
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (c) => c.toUpperCase());
              return (
                <div key={typeName} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{formattedName}</span>
                    <span className="font-mono text-muted-foreground text-[11px]">
                      {tInfo.correct} / {tInfo.total} ({tInfo.accuracy}%)
                    </span>
                  </div>
                  <progress
                    className="progress progress-primary h-1.5 w-full"
                    value={tInfo.accuracy}
                    max="100"
                  />
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
            <h2 className="text-base font-semibold tracking-tight text-foreground">Recent Attempts</h2>
            <p className="text-muted-foreground text-xs">Test scores and completion history.</p>
          </div>
          <span className="badge badge-ghost badge-sm text-[11px]">{data.recentScoreTrends.length} attempt{data.recentScoreTrends.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="card overflow-x-auto">
          <table className="table table-zebra w-full text-xs">
            <thead>
              <tr className="border-border/60 bg-muted/30 text-muted-foreground">
                <th>Exam / Paper</th>
                <th>Date</th>
                <th>Score</th>
                <th>Accuracy</th>
                <th>Duration</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.recentScoreTrends.map((att) => (
                <tr key={att.attemptId} className="hover:bg-muted/30">
                  <td className="font-medium text-foreground">{att.testTitle}</td>
                  <td className="text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3" />
                      {new Date(att.date).toLocaleDateString()}
                    </span>
                  </td>
                  <td>
                    <span className="font-semibold text-xs font-mono">{att.scorePercentage}%</span>
                    <span className="text-muted-foreground ml-1 text-[11px] font-mono">
                      ({att.totalMarks}/{att.maxMarks})
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge badge-xs font-semibold font-mono ${
                        att.accuracy >= 75
                          ? 'badge-success text-success-content'
                          : att.accuracy >= 50
                          ? 'badge-warning text-warning-content'
                          : 'badge-error text-error-content'
                      }`}
                    >
                      {att.accuracy}%
                    </span>
                  </td>
                  <td className="text-muted-foreground">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="size-3" />
                      {formatTimeSeconds(att.timeSpentSeconds)}
                    </span>
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      onClick={() => navigate(`/result/${att.attemptId}`)}
                      aria-label={`View scorecard for ${att.testTitle}`}
                      className="btn btn-ghost btn-xs text-primary gap-1 active:scale-95"
                    >
                      Scorecard
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
