import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertCircle,
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
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 pb-24 md:px-6">
      {/* Top Banner / Navigation */}
      <div className="border-border/60 flex flex-col justify-between gap-3 border-b pb-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl text-foreground">Home</h1>
          <p className="text-muted-foreground mt-0.5 text-xs font-mono tabular-nums">
            {papers.length} paper{papers.length !== 1 ? 's' : ''} available
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/analysis')}
            className="btn btn-ghost btn-sm h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1.5"
          >
            <BarChart3 className="size-3.5" />
            Analysis
          </button>
          <button
            onClick={() => navigate('/builder')}
            className="btn btn-primary btn-sm h-8 px-3 text-xs font-medium gap-1.5 shadow-xs"
          >
            <Plus className="size-3.5" />
            New Paper
          </button>
        </div>
      </div>

      {/* SECTION 2: Mistake Vault Summary & Quick Exam Button */}
      {mistakes.unresolvedQuestions.length > 0 && (
        <div className="bg-card border-red-500/20 overflow-hidden rounded-lg border p-4 shadow-xs">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="bg-red-500/10 text-red-600 dark:text-red-400 rounded-md p-2 shrink-0">
                <AlertCircle className="size-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-xs tracking-tight">Mistake Vault</h3>
                  <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.2 rounded border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 font-medium">
                    {mistakes.unresolvedQuestions.length}
                  </span>
                </div>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Questions marked incorrect during mock tests.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => navigate('/mistakes')}
                className="btn btn-ghost btn-sm h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
              >
                View Vault
                <ChevronRight className="size-3" />
              </button>
              <button
                onClick={() => handleLaunchMistakeDrill(10)}
                className="btn btn-error btn-sm h-7 px-3 text-white text-xs font-medium gap-1.5 shadow-xs"
              >
                <Play className="size-3 fill-current" />
                Practice ({Math.min(10, mistakes.unresolvedQuestions.length)})
              </button>
            </div>
          </div>

          {/* Inline Preview of Mistakes */}
          <div className="mt-3 grid grid-cols-1 gap-2 pt-3 border-t border-border/40 sm:grid-cols-2 lg:grid-cols-3">
            {mistakes.unresolvedQuestions.slice(0, 3).map((q, idx) => (
              <div
                key={q.id}
                onClick={() => navigate('/mistakes')}
                className="bg-muted/30 hover:bg-muted/60 rounded-md p-2.5 text-xs cursor-pointer border border-border/50 transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-mono text-[10px] text-red-600 dark:text-red-400 font-semibold">Error #{idx + 1}</span>
                    <span className="text-[10px] font-mono text-muted-foreground px-1 rounded bg-muted/60">{q.subject}</span>
                  </div>
                  <p className="line-clamp-2 text-foreground/80 text-[11px] leading-relaxed">
                    {q.body.replace(/[*#_`$]/g, '')}
                  </p>
                </div>
                <span className="text-primary hover:underline text-[10px] font-medium mt-1.5 block">
                  Inspect in Vault →
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 1: All Papers List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">Papers</h2>
            <p className="text-muted-foreground text-xs">
              Mock exams and practice sets.
            </p>
          </div>
          <span className="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded border border-border/60 bg-muted/40 text-muted-foreground">
            {papers.length} paper{papers.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div className="flex min-h-[30vh] items-center justify-center">
            <span className="loading loading-spinner text-primary loading-md" />
          </div>
        ) : papers.length === 0 ? (
          <div className="border-border/60 bg-card flex flex-col items-center justify-center rounded-lg border p-10 text-center shadow-xs">
            <BookOpen className="text-muted-foreground/40 size-10" />
            <h3 className="mt-3 text-sm font-semibold text-foreground">No Papers Available</h3>
            <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-xs">
              Import an exam paper or construct a custom test.
            </p>
            <button
              onClick={() => navigate('/builder')}
              className="btn btn-primary btn-sm h-8 px-3 text-xs font-medium mt-4 gap-1.5 shadow-xs"
            >
              <Plus className="size-3.5" />
              Build Paper
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
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
                  className="bg-card border-border/70 hover:border-border flex flex-col justify-between rounded-lg border p-4 shadow-xs transition-colors space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-primary/20 bg-primary/10 text-primary font-medium">
                        {paper.mode}
                      </span>
                      {stats?.attemptsCount ? (
                        <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                          <CheckCircle2 className="size-2.5" />
                          {stats.attemptsCount} Attempt{stats.attemptsCount !== 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-muted-foreground/70">
                          Unattempted
                        </span>
                      )}
                    </div>

                    <h3 className="font-semibold text-sm leading-snug line-clamp-2 text-foreground tracking-tight">{paper.title}</h3>
                    {paper.description && (
                      <p className="text-muted-foreground text-xs line-clamp-2 leading-relaxed">
                        {paper.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-1 text-xs font-mono tabular-nums text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3 text-muted-foreground/70" />
                        {durationMin > 0 ? `${durationMin}m` : 'Untimed'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers className="size-3 text-muted-foreground/70" />
                        {paper.sections.length} sec
                      </span>
                      <span className="flex items-center gap-1">
                        <Award className="size-3 text-muted-foreground/70" />
                        {totalQ} Qs
                      </span>
                    </div>

                    {/* Historical Score Highlight if available */}
                    {stats?.latestScore !== undefined && (
                      <div className="bg-muted/30 border border-border/60 rounded-md p-2 mt-2 flex items-center justify-between text-xs">
                        <div>
                          <span className="text-muted-foreground text-[10px] block uppercase font-mono">Latest Score</span>
                          <span className="font-mono tabular-nums font-semibold text-xs text-foreground">{stats.latestScore}%</span>
                        </div>
                        {stats.bestScore !== undefined && (
                          <div className="text-right">
                            <span className="text-muted-foreground text-[10px] block uppercase font-mono">Best Score</span>
                            <span className="font-mono tabular-nums font-semibold text-xs text-emerald-600 dark:text-emerald-400">{stats.bestScore}%</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="border-border/50 pt-2.5 border-t flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleLaunchPaperExam(paper.id)}
                        className="btn btn-primary btn-sm h-8 px-3 text-xs font-medium shadow-xs gap-1.5 active:scale-95"
                      >
                        <Play className="size-3 fill-current" />
                        Start Exam
                      </button>

                      <button
                        onClick={() => handleLaunchPaperPractice(paper)}
                        className="btn btn-outline border-border/70 hover:bg-muted text-foreground btn-sm h-8 px-3 text-xs font-medium gap-1.5 active:scale-95"
                      >
                        <Zap className="size-3" />
                        Practice
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-0.5 text-xs">
                      {stats?.latestAttemptId ? (
                        <button
                          onClick={() => navigate(`/result/${stats.latestAttemptId}`)}
                          className="text-xs text-primary hover:underline font-medium flex items-center gap-1"
                          aria-label={`View scorecard for ${paper.title}`}
                        >
                          Scorecard
                          <ExternalLink className="size-2.5" />
                        </button>
                      ) : (
                        <span className="text-muted-foreground/60 text-[11px] font-mono">
                          Ready
                        </span>
                      )}

                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => handleExportPaper(e, paper)}
                          className="btn btn-ghost btn-xs h-6 w-6 p-0 text-muted-foreground hover:text-foreground active:scale-90"
                          title="Export as Markdown"
                          aria-label="Export paper as Markdown"
                        >
                          <Download className="size-3" />
                        </button>
                        <button
                          onClick={(e) => handleDeletePaper(e, paper.id)}
                          className="btn btn-ghost btn-xs h-6 w-6 p-0 text-muted-foreground hover:text-red-600 active:scale-90"
                          title="Delete paper"
                          aria-label="Delete paper"
                        >
                          <Trash2 className="size-3" />
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
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">Recent Attempts</h2>
              <p className="text-muted-foreground text-xs">Scorecards and completion history.</p>
            </div>
            <button
              onClick={() => navigate('/analysis')}
              className="text-primary hover:underline text-xs font-medium"
            >
              View in analysis →
            </button>
          </div>

          <div className="bg-card border-border/70 overflow-x-auto rounded-lg border shadow-xs">
            <table className="table w-full text-xs">
              <thead>
                <tr className="border-border/60 bg-muted/40 text-muted-foreground">
                  <th className="font-medium py-2">Exam / Paper</th>
                  <th className="font-medium py-2">Date</th>
                  <th className="font-medium py-2">Score</th>
                  <th className="font-medium py-2">Accuracy</th>
                  <th className="font-medium py-2">Duration</th>
                  <th className="font-medium py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {analytics.recentScoreTrends.slice(0, 5).map((att) => (
                  <tr key={att.attemptId} className="hover:bg-muted/20">
                    <td className="font-medium text-foreground py-2.5">{att.testTitle}</td>
                    <td className="text-muted-foreground py-2.5">
                      <span className="flex items-center gap-1 font-mono text-[11px]">
                        <Calendar className="size-3 text-muted-foreground/70" />
                        {new Date(att.date).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="py-2.5 font-mono tabular-nums">
                      <span className="font-semibold text-foreground">{att.scorePercentage}%</span>
                      <span className="text-muted-foreground ml-1 text-[11px]">
                        ({att.totalMarks}/{att.maxMarks})
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded border font-medium ${
                          att.accuracy >= 75
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : att.accuracy >= 50
                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
                        }`}
                      >
                        {att.accuracy}%
                      </span>
                    </td>
                    <td className="text-muted-foreground py-2.5">
                      <span className="flex items-center gap-1 font-mono text-[11px] tabular-nums">
                        <Clock className="size-3 text-muted-foreground/70" />
                        {formatTimeSeconds(att.timeSpentSeconds)}
                      </span>
                    </td>
                    <td className="text-right py-2.5">
                      <button
                        onClick={() => navigate(`/result/${att.attemptId}`)}
                        className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
                      >
                        Scorecard
                        <ExternalLink className="size-2.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 3: Dynamic Subject Performance Snapshot */}
      {analytics && analytics.subjectBreakdown.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">Subject Accuracy</h2>
              <p className="text-muted-foreground text-xs">
                Performance across subjects from practice history.
              </p>
            </div>
            <button
              onClick={() => navigate('/analysis')}
              className="text-primary hover:underline text-xs font-medium"
            >
              View all in analysis →
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {analytics.subjectBreakdown.slice(0, 6).map((subj) => (
              <div
                key={subj.subject}
                onClick={() => navigate(`/practice?subject=${encodeURIComponent(subj.subject)}`)}
                className="bg-card border-border/70 hover:border-border flex cursor-pointer flex-col justify-between rounded-lg border p-3.5 shadow-xs transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-xs text-foreground truncate">{subj.subject}</span>
                    <span
                      className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded border font-medium ${
                        subj.accuracy >= 75
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : subj.accuracy >= 50
                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
                      }`}
                    >
                      {subj.accuracy}%
                    </span>
                  </div>
                  <p className="text-muted-foreground text-[11px] font-mono tabular-nums">
                    {subj.correct} of {subj.total} correct
                  </p>
                </div>

                <div className="mt-2.5">
                  <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        subj.accuracy >= 75
                          ? 'bg-emerald-500'
                          : subj.accuracy >= 50
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${subj.accuracy}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1 font-mono">
                    <span>{subj.topics.length} topic{subj.topics.length !== 1 ? 's' : ''}</span>
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
