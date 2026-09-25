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
  Compass,
  ExternalLink,
  Flame,
  Play,
  Target,
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
            <Compass className="size-4" />
            Start Topic Practice
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 pb-36 md:p-8">
      {/* Header */}
      <div className="border-base-300 flex flex-col justify-between gap-4 border-b pb-5 md:flex-row md:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">Analysis</h1>
          <p className="text-base-content/50 mt-0.5 text-xs">
            {data.completedAttempts} test{data.completedAttempts !== 1 ? 's' : ''} completed
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/mistakes')} className="btn btn-ghost btn-sm gap-1.5">
            <Target className="size-3.5" />
            Mistakes
          </button>
          <button onClick={() => navigate('/practice')} className="btn btn-primary btn-sm gap-1.5 shadow-sm">
            <Zap className="size-3.5" />
            Practice
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="bg-card border-border/80 rounded-2xl border p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-base-content/60 text-xs font-semibold uppercase tracking-wider">Overall Accuracy</span>
            <div className="bg-primary/10 text-primary rounded-xl p-2">
              <TrendingUp className="size-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight">{data.overallAccuracy}%</span>
          </div>
          <p className="text-base-content/50 mt-1 text-[11px]">
            {data.totalQuestionsCorrect} correct of {data.totalQuestionsAttempted} answered
          </p>
        </div>

        <div className="bg-card border-border/80 rounded-2xl border p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-base-content/60 text-xs font-semibold uppercase tracking-wider">Average Score</span>
            <div className="bg-success/10 text-success rounded-xl p-2">
              <Award className="size-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight">{data.overallScorePercentage}%</span>
          </div>
          <p className="text-base-content/50 mt-1 text-[11px]">Across {data.completedAttempts} completed exam mock(s)</p>
        </div>

        <div className="bg-card border-border/80 rounded-2xl border p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-base-content/60 text-xs font-semibold uppercase tracking-wider">Speed Per Question</span>
            <div className="bg-warning/10 text-warning rounded-xl p-2">
              <Clock className="size-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight">{data.averageTimePerQuestionSeconds}s</span>
          </div>
          <p className="text-base-content/50 mt-1 text-[11px]">Avg pace across answered questions</p>
        </div>

        <div className="bg-card border-border/80 rounded-2xl border p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-base-content/60 text-xs font-semibold uppercase tracking-wider">Total Practice Time</span>
            <div className="bg-info/10 text-info rounded-xl p-2">
              <Flame className="size-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight">
              {Math.round(data.totalTimeSpentSeconds / 60)}m
            </span>
          </div>
          <p className="text-base-content/50 mt-1 text-[11px]">{formatTimeSeconds(data.totalTimeSpentSeconds)} total focus</p>
        </div>
      </div>

      {/* Dynamic Subject & Topic Performance */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Subject & Topic Performance</h2>
            <p className="text-base-content/50 text-xs">
              Performance breakdown across subjects and topics.
            </p>
          </div>
          <span className="badge badge-ghost text-xs">{data.subjectBreakdown.length} subject{data.subjectBreakdown.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="space-y-3">
          {data.subjectBreakdown.map((subj) => {
            const isExpanded = !!expandedSubjects[subj.subject];
            return (
              <div
                key={subj.subject}
                className="bg-card border-border/80 overflow-hidden rounded-2xl border shadow-xs transition-all"
              >
                <div
                  onClick={() => toggleSubject(subj.subject)}
                  className="hover:bg-base-200/50 flex cursor-pointer flex-col gap-3 p-4 select-none sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <button className="btn btn-ghost btn-xs btn-square">
                      {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </button>
                    <div>
                      <h3 className="font-bold">{subj.subject}</h3>
                      <p className="text-base-content/50 text-xs">
                        {subj.topics.length} Topic(s) • {subj.total} Question(s)
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 pl-9 sm:pl-0">
                    <div className="w-36 text-right">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-base-content/60">Accuracy</span>
                        <span>{subj.accuracy}%</span>
                      </div>
                      <progress
                        className={`progress mt-1.5 h-2 w-full ${
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

                    <div className="hidden items-center gap-2 text-xs md:flex">
                      <span className="text-success flex items-center gap-1 font-semibold">
                        <CheckCircle2 className="size-3.5" />
                        {subj.correct}
                      </span>
                      <span className="text-error flex items-center gap-1 font-semibold">
                        <XCircle className="size-3.5" />
                        {subj.incorrect}
                      </span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/practice?subject=${encodeURIComponent(subj.subject)}`);
                      }}
                      className="btn btn-ghost btn-xs text-primary gap-1"
                    >
                      Practice
                      <ChevronRight className="size-3" />
                    </button>
                  </div>
                </div>

                {/* Expanded Topics Sub-List */}
                {isExpanded && subj.topics.length > 0 && (
                  <div className="bg-base-200/30 border-border/50 border-t p-4">
                    <h4 className="text-base-content/60 mb-3 text-xs font-bold uppercase tracking-wider">
                      Topic Breakdown ({subj.subject})
                    </h4>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {subj.topics.map((top) => (
                        <div
                          key={top.topic}
                          className="bg-card border-border/70 flex flex-col justify-between rounded-xl border p-3 shadow-2xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-sm font-semibold truncate">{top.topic}</span>
                            <span
                              className={`badge badge-sm font-bold ${
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

                          <div className="mt-3 flex items-center justify-between text-[11px] text-base-content/60">
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
                              className="text-primary hover:underline font-medium"
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
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Difficulty Breakdown */}
        <div className="bg-card border-border/80 rounded-2xl border p-5 shadow-xs">
          <h3 className="font-bold text-base">Mastery by Difficulty</h3>
          <p className="text-base-content/60 text-xs mt-0.5">Performance across calibrated difficulty tiers</p>

          <div className="mt-4 space-y-4">
            {(['easy', 'medium', 'hard'] as const).map((diff) => {
              const item = data.difficultyBreakdown[diff];
              const color =
                diff === 'easy' ? 'text-success' : diff === 'medium' ? 'text-warning' : 'text-error';
              const progressColor =
                diff === 'easy'
                  ? 'progress-success'
                  : diff === 'medium'
                  ? 'progress-warning'
                  : 'progress-error';
              return (
                <div key={diff} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-bold capitalize ${color}`}>{diff}</span>
                    <span className="font-mono text-base-content/70">
                      {item.correct} / {item.total} ({item.accuracy}%)
                    </span>
                  </div>
                  <progress
                    className={`progress ${progressColor} h-2 w-full`}
                    value={item.accuracy}
                    max="100"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Question Type Breakdown */}
        <div className="bg-card border-border/80 rounded-2xl border p-5 shadow-xs">
          <h3 className="font-bold text-base">Question Format Accuracy</h3>
          <p className="text-base-content/60 text-xs mt-0.5">Single choice, multiple selection, and numerical formats</p>

          <div className="mt-4 space-y-4">
            {Object.entries(data.typeBreakdown).map(([typeName, tInfo]) => {
              const formattedName = typeName
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (c) => c.toUpperCase());
              return (
                <div key={typeName} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">{formattedName}</span>
                    <span className="font-mono text-base-content/70">
                      {tInfo.correct} / {tInfo.total} ({tInfo.accuracy}%)
                    </span>
                  </div>
                  <progress
                    className="progress progress-primary h-2 w-full"
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
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Recent Attempts</h2>
            <p className="text-base-content/50 text-xs">Test scores and completion history.</p>
          </div>
          <span className="badge badge-ghost text-xs">{data.recentScoreTrends.length} attempt{data.recentScoreTrends.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="bg-card border-border/80 overflow-x-auto rounded-2xl border shadow-xs">
          <table className="table table-zebra w-full text-xs">
            <thead>
              <tr className="border-border/60 bg-base-200/50">
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
                <tr key={att.attemptId} className="hover:bg-base-200/30">
                  <td className="font-semibold">{att.testTitle}</td>
                  <td className="text-base-content/60">
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3" />
                      {new Date(att.date).toLocaleDateString()}
                    </span>
                  </td>
                  <td>
                    <span className="font-bold text-sm">{att.scorePercentage}%</span>
                    <span className="text-base-content/50 ml-1 text-[11px]">
                      ({att.totalMarks}/{att.maxMarks})
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge badge-xs font-semibold ${
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
                  <td className="text-base-content/60">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="size-3" />
                      {formatTimeSeconds(att.timeSpentSeconds)}
                    </span>
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => navigate(`/result/${att.attemptId}`)}
                      className="btn btn-ghost btn-xs text-primary gap-1"
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
