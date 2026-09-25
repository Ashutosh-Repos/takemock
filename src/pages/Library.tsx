import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Award,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Layers,
  Play,
  Plus,
  Target,
  Trash2,
  Zap,
} from 'lucide-react';
import { formatTimeSeconds } from '@/core/engine/timingEngine';
import { saveExportFile } from '@/core/native/tauriBridge';
import { serializeTestToMarkdown } from '@/core/parser/testSerializer';
import { assessmentRepository } from '@/core/storage/repository';
import type { QuestionModel } from '@/types/question';
import type { TestDefinition } from '@/types/test';

export function Library() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [papers, setPapers] = useState<TestDefinition[]>([]);
  const [paperStats, setPaperStats] = useState<
    Record<
      string,
      {
        attemptsCount: number;
        latestAttemptId?: string;
        latestScore?: number;
        bestScore?: number;
        lastAttemptedAt?: string;
      }
    >
  >({});

  // Mistake Analytics
  const [mistakes, setMistakes] = useState<{
    unresolvedQuestions: QuestionModel[];
    timeSinkQuestions: QuestionModel[];
    bookmarkedQuestions: QuestionModel[];
    resolvedCount: number;
  }>({
    unresolvedQuestions: [],
    timeSinkQuestions: [],
    bookmarkedQuestions: [],
    resolvedCount: 0,
  });

  // Zero-Hardcoded Performance Analytics Snapshot
  const [analytics, setAnalytics] = useState<
    Awaited<ReturnType<typeof assessmentRepository.getComprehensiveAnalytics>> | null
  >(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [allTests, mistakeData, compAnalytics] = await Promise.all([
        assessmentRepository.getTests(),
        assessmentRepository.getMistakeAnalytics(),
        assessmentRepository.getComprehensiveAnalytics(),
      ]);

      setPapers(allTests);
      setMistakes(mistakeData);
      setAnalytics(compAnalytics);

      // Load analytics for each test
      const statsMap: Record<string, any> = {};
      for (const t of allTests) {
        statsMap[t.id] = await assessmentRepository.getPaperAnalytics(t.id);
      }
      setPaperStats(statsMap);
    } catch (err) {
      console.error('Failed to load library data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Launch Paper as CBT Timed Exam
  const handleLaunchPaperExam = async (testId: string) => {
    try {
      const attempt = await assessmentRepository.startAttempt(testId);
      navigate(`/runner/${attempt.id}`);
    } catch (err: any) {
      alert(`Could not launch exam: ${err.message || 'Unknown error'}`);
    }
  };

  // Launch Paper in Practice Mode (Untimed, Instant Feedback)
  const handleLaunchPaperPractice = async (paper: TestDefinition) => {
    try {
      let testIdToRun = paper.id;
      if (paper.mode !== 'PRACTICE' || paper.timing.mode !== 'NONE') {
        const practiceClone: TestDefinition = {
          ...paper,
          id: `${paper.id}_practice_${Date.now()}`,
          title: `${paper.title} (Practice)`,
          mode: 'PRACTICE',
          timing: { ...paper.timing, mode: 'NONE', totalDurationSeconds: 0, allowPause: true },
          feedback: {
            ...paper.feedback,
            showImmediateSolution: true,
            showHint: true,
            allowCheckAnswer: true,
            showDetailedSolutionsAfterSubmit: true,
          },
        };
        await assessmentRepository.saveTest(practiceClone);
        testIdToRun = practiceClone.id;
      }
      const attempt = await assessmentRepository.startAttempt(testIdToRun);
      navigate(`/runner/${attempt.id}`);
    } catch (err: any) {
      alert(`Could not start practice: ${err.message || 'Unknown error'}`);
    }
  };

  // 1-Click Mistake Drill Launcher
  const handleLaunchMistakeDrill = async (maxCount = 10) => {
    try {
      const attempt = await assessmentRepository.generateMistakeDrill(maxCount);
      navigate(`/runner/${attempt.id}`);
    } catch (err: any) {
      alert(err.message || 'No mistakes available to practice.');
    }
  };

  // Delete Paper
  const handleDeletePaper = async (e: React.MouseEvent, testId: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this paper?')) return;
    try {
      await assessmentRepository.deleteTest(testId);
      await loadData();
    } catch (err: any) {
      alert(`Failed to delete paper: ${err.message || 'Unknown error'}`);
    }
  };

  // Export Paper as Markdown
  const handleExportPaper = async (e: React.MouseEvent, paper: TestDefinition) => {
    e.stopPropagation();
    try {
      const allQ = await assessmentRepository.getQuestions();
      const qMap = new Map(allQ.map((q) => [q.id, q]));

      const sectionsWithQuestions = paper.sections.map((s) => ({
        id: s.id,
        title: s.title,
        questions: (s.selection.staticQuestionIds || [])
          .map((item) => qMap.get(item.id))
          .filter((q): q is QuestionModel => !!q),
      }));

      const md = serializeTestToMarkdown(
        {
          title: paper.title,
          description: paper.description || '',
          instructions: paper.instructions,
          mode: paper.mode,
          timingMode: paper.timing.mode,
          durationMinutes: Math.round(paper.timing.totalDurationSeconds / 60),
          navigation: paper.navigation,
          defaultMarks: paper.scoring.defaultMarks,
          negativeMarks: paper.scoring.defaultNegativeMarks,
          allowPartialCredit: paper.scoring.allowPartialCredit,
        },
        sectionsWithQuestions
      );

      const safeName = paper.title.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      await saveExportFile(`${safeName}_blueprint.md`, md, 'text/markdown;charset=utf-8;');
    } catch (err: any) {
      alert(`Export failed: ${err.message || 'Unknown error'}`);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 pb-36 md:p-8">
      {/* Top Banner / Navigation */}
      <div className="border-base-300 flex flex-col justify-between gap-4 border-b pb-5 md:flex-row md:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">Your Library</h1>
          <p className="text-base-content/50 mt-0.5 text-xs">
            {papers.length} paper{papers.length !== 1 ? 's' : ''} saved
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/analysis')}
            className="btn btn-ghost btn-sm gap-1.5"
          >
            <BarChart3 className="size-3.5" />
            Analysis
          </button>
          <button
            onClick={() => navigate('/builder')}
            className="btn btn-primary btn-sm gap-1.5 shadow-sm"
          >
            <Plus className="size-3.5" />
            New Paper
          </button>
        </div>
      </div>

      {/* SECTION 2: Mistake Vault Summary & Quick Exam Button */}
      {mistakes.unresolvedQuestions.length > 0 && (
        <div className="bg-card border-error/40 overflow-hidden rounded-2xl border p-5 shadow-xs">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="bg-error/15 text-error rounded-xl p-2.5 shrink-0">
                <Target className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm">Mistakes</h3>
                  <span className="badge badge-error badge-xs font-bold text-error-content">
                    {mistakes.unresolvedQuestions.length}
                  </span>
                </div>
                <p className="text-base-content/50 mt-0.5 text-xs">
                  Questions you got wrong — practise them again.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => navigate('/mistakes')}
                className="btn btn-ghost btn-sm gap-1 text-xs"
              >
                View All
                <ChevronRight className="size-3.5" />
              </button>
              <button
                onClick={() => handleLaunchMistakeDrill(10)}
                className="btn btn-error btn-sm text-error-content font-bold gap-1.5 shadow-sm"
              >
                <Play className="size-3.5" />
                Practise ({Math.min(10, mistakes.unresolvedQuestions.length)})
              </button>
            </div>
          </div>

          {/* Inline Preview of Mistakes */}
          <div className="mt-4 grid grid-cols-1 gap-2 pt-3 border-t border-border/40 sm:grid-cols-2 lg:grid-cols-3">
            {mistakes.unresolvedQuestions.slice(0, 3).map((q, idx) => (
              <div
                key={q.id}
                onClick={() => navigate('/mistakes')}
                className="bg-base-200/50 hover:bg-base-200/80 rounded-xl p-3 text-xs cursor-pointer border border-border/60 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-bold text-error">Error #{idx + 1}</span>
                    <span className="badge badge-ghost badge-xs">{q.subject}</span>
                  </div>
                  <p className="line-clamp-2 text-base-content/80 text-[11px] leading-relaxed">
                    {q.body.replace(/[*#_`$]/g, '')}
                  </p>
                </div>
                <span className="text-primary hover:underline text-[10px] font-semibold mt-2 block">
                  Inspect in Vault →
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 1: All Papers List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Papers</h2>
            <p className="text-base-content/50 text-xs">
              Mock exams and practice sets.
            </p>
          </div>
          <span className="badge badge-ghost text-xs">{papers.length} paper{papers.length !== 1 ? 's' : ''}</span>
        </div>

        {loading ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <span className="loading loading-spinner text-primary loading-md" />
          </div>
        ) : papers.length === 0 ? (
          <div className="border-border/60 bg-card flex flex-col items-center justify-center rounded-2xl border p-12 text-center shadow-xs">
            <BookOpen className="text-base-content/30 size-12" />
            <h3 className="mt-3 text-base font-bold">No Papers Yet</h3>
            <p className="text-base-content/60 mx-auto mt-1 max-w-sm text-xs">
              Import a full exam paper from ChatGPT/Claude, or build your own test in seconds.
            </p>
            <button
              onClick={() => navigate('/builder')}
              className="btn btn-primary btn-sm mt-4 gap-1.5 shadow-sm"
            >
              <Plus className="size-3.5" />
              Build or Ingest Papers
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {papers.map((paper) => {
              const stats = paperStats[paper.id];
              const totalQ = paper.sections.reduce(
                (sum, s) => sum + (s.selection.staticQuestionIds?.length || 0),
                0
              );
              const durationMin = Math.round(paper.timing.totalDurationSeconds / 60);

              return (
                <div
                  key={paper.id}
                  className="bg-card border-border/80 flex flex-col justify-between rounded-2xl border p-5 shadow-xs transition-all hover:border-primary/50 space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="badge badge-primary text-[10px] font-bold">
                        {paper.mode}
                      </span>
                      {stats?.attemptsCount ? (
                        <span className="badge badge-success badge-sm font-bold gap-1 text-success-content">
                          <CheckCircle2 className="size-3" />
                          {stats.attemptsCount} Attempt(s)
                        </span>
                      ) : (
                        <span className="badge badge-ghost text-[10px] text-base-content/60">
                          Unattempted
                        </span>
                      )}
                    </div>

                    <h3 className="font-bold text-base leading-snug line-clamp-2">{paper.title}</h3>
                    {paper.description && (
                      <p className="text-base-content/60 text-xs line-clamp-2 leading-relaxed">
                        {paper.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-2 text-xs font-semibold text-base-content/70">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3.5 text-warning" />
                        {durationMin > 0 ? `${durationMin} mins` : 'Untimed'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers className="size-3.5 text-info" />
                        {paper.sections.length} Section(s)
                      </span>
                      <span className="flex items-center gap-1">
                        <Award className="size-3.5 text-success" />
                        {totalQ} Qs
                      </span>
                    </div>

                    {/* Historical Score Highlight if available */}
                    {stats?.latestScore !== undefined && (
                      <div className="bg-base-200/50 rounded-xl p-2.5 mt-2 flex items-center justify-between text-xs">
                        <div>
                          <span className="text-base-content/50 text-[10px] block uppercase font-bold">Latest Score</span>
                          <span className="font-bold text-sm">{stats.latestScore}%</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {stats.bestScore !== undefined && (
                            <div className="text-right">
                              <span className="text-base-content/50 text-[10px] block uppercase font-bold">Best Score</span>
                              <span className="font-bold text-sm text-success">{stats.bestScore}%</span>
                            </div>
                          )}
                          {stats.latestAttemptId && (
                            <button
                              onClick={() => navigate(`/result/${stats.latestAttemptId}`)}
                              className="btn btn-ghost btn-xs text-primary gap-1 ml-1"
                              title="View Scorecard"
                            >
                              Scorecard
                              <ExternalLink className="size-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="border-border/50 pt-3 border-t flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleLaunchPaperExam(paper.id)}
                        className="btn btn-primary btn-sm font-bold shadow-xs gap-1"
                      >
                        <Play className="size-3.5 fill-current" />
                        Start Exam
                      </button>

                      <button
                        onClick={() => handleLaunchPaperPractice(paper)}
                        className="btn btn-outline btn-sm font-bold gap-1"
                      >
                        <Zap className="size-3.5" />
                        Practice
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-xs">
                      {stats?.latestAttemptId ? (
                        <button
                          onClick={() => navigate(`/result/${stats.latestAttemptId}`)}
                          className="btn btn-ghost btn-xs text-primary gap-1"
                        >
                          Scorecard
                          <ExternalLink className="size-3" />
                        </button>
                      ) : (
                        <button
                          disabled
                          className="btn btn-ghost btn-xs text-base-content/30 gap-1 cursor-not-allowed opacity-50"
                          title="Complete an attempt first"
                        >
                          Scorecard
                          <ExternalLink className="size-3" />
                        </button>
                      )}

                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => handleExportPaper(e, paper)}
                          className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-base-content"
                          title="Export as Markdown"
                        >
                          <Download className="size-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDeletePaper(e, paper.id)}
                          className="btn btn-ghost btn-xs btn-square text-base-content/40 hover:text-error"
                          title="Delete Paper"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION: Recent Completed Attempts & Scorecards */}
      {analytics && analytics.recentScoreTrends.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight">Recent Attempts</h2>
              <p className="text-base-content/50 text-xs">Test scorecards and completion history.</p>
            </div>
            <button
              onClick={() => navigate('/analysis')}
              className="text-primary hover:underline text-xs font-semibold"
            >
              View all in analysis →
            </button>
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
                {analytics.recentScoreTrends.slice(0, 5).map((att) => (
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
      )}

      {/* SECTION 3: Dynamic Subject Performance Snapshot (Zero Hardcoding) */}
      {analytics && analytics.subjectBreakdown.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight">Subject Accuracy</h2>
              <p className="text-base-content/50 text-xs">
                Performance across subjects from your practice history.
              </p>
            </div>
            <button
              onClick={() => navigate('/analysis')}
              className="text-primary hover:underline text-xs font-semibold"
            >
              View all analysis →
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {analytics.subjectBreakdown.slice(0, 6).map((subj) => (
              <div
                key={subj.subject}
                onClick={() => navigate(`/practice?subject=${encodeURIComponent(subj.subject)}`)}
                className="bg-card border-border/80 hover:border-primary/50 flex cursor-pointer flex-col justify-between rounded-xl border p-4 shadow-2xs transition-all"
              >
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-bold text-sm truncate">{subj.subject}</span>
                    <span
                      className={`badge badge-sm font-bold ${
                        subj.accuracy >= 75
                          ? 'badge-success text-success-content'
                          : subj.accuracy >= 50
                          ? 'badge-warning text-warning-content'
                          : 'badge-error text-error-content'
                      }`}
                    >
                      {subj.accuracy}%
                    </span>
                  </div>
                  <p className="text-base-content/50 text-[11px]">
                    {subj.correct} of {subj.total} questions answered correctly
                  </p>
                </div>

                <div className="mt-3">
                  <progress
                    className={`progress h-1.5 w-full ${
                      subj.accuracy >= 75
                        ? 'progress-success'
                        : subj.accuracy >= 50
                        ? 'progress-warning'
                        : 'progress-error'
                    }`}
                    value={subj.accuracy}
                    max="100"
                  />
                  <div className="flex items-center justify-between text-[10px] text-base-content/50 mt-1">
                    <span>{subj.topics.length} topic(s)</span>
                    <span className="text-primary font-medium">Practice →</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
