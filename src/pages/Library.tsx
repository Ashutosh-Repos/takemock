import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertCircle,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Layers,
  LayoutGrid,
  List,
  Play,
  Plus,
  Search,
  Trash2,
  Zap,
} from 'lucide-react';
import { formatTimeSeconds } from '@/core/engine/timingEngine';
import { saveExportFile } from '@/core/native/tauriBridge';
import { serializeTestToMarkdown } from '@/core/parser/testSerializer';
import { assessmentRepository } from '@/core/storage/repository';
import { SegmentedControl } from '@/components/ui/segmented-control';
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

  // Filters & View Mode
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'EXAM' | 'PRACTICE'>('ALL');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

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

  // Analytics Snapshot
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

  // Filtered Papers
  const filteredPapers = useMemo(() => {
    return papers.filter((p) => {
      const matchesSearch =
        searchQuery.trim() === '' ||
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesMode =
        filterMode === 'ALL' ||
        (filterMode === 'EXAM' && p.mode === 'EXAM') ||
        (filterMode === 'PRACTICE' && p.mode === 'PRACTICE');

      return matchesSearch && matchesMode;
    });
  }, [papers, searchQuery, filterMode]);

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
    <div className="mx-auto max-w-6xl w-full px-6 py-6 pb-20 space-y-6">
      {/* Standard Header */}
      <div className="flex flex-col justify-between gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Papers</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Full examination papers, blueprint mocks, and practice sets.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/builder')}
            className="btn btn-primary btn-sm h-7 px-3 text-xs font-medium gap-1.5 shadow-xs"
          >
            <Plus className="size-3.5" />
            <span>Create Paper</span>
          </button>
        </div>
      </div>

      {/* Desktop Sub-Toolbar / Action Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4 border-border/60">
        <div className="flex items-center gap-3">
          {/* Segmented Filter */}
          <SegmentedControl
            value={filterMode}
            onValueChange={setFilterMode}
            size="sm"
            options={[
              { value: 'ALL', label: 'All Papers' },
              { value: 'EXAM', label: 'Timed Mocks' },
              { value: 'PRACTICE', label: 'Practice Sets' },
            ]}
          />

          <span className="text-xs text-muted-foreground font-mono">
            {filteredPapers.length} of {papers.length}
          </span>
        </div>

        {/* Search & View Switcher */}
        <div className="flex items-center gap-2.5">
          <div className="macos-search-field">
            <Search className="size-3.5" />
            <input
              type="search"
              placeholder="Search papers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-48 sm:w-60"
            />
          </div>

          <SegmentedControl
            value={viewMode}
            onValueChange={setViewMode}
            size="sm"
            options={[
              { value: 'list', icon: List, label: '', title: 'List View' },
              { value: 'grid', icon: LayoutGrid, label: '', title: 'Grid View' },
            ]}
          />
        </div>
      </div>

      {/* Mistake Vault Native Inset Callout */}
      {mistakes.unresolvedQuestions.length > 0 && (
        <div className="card p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-border">
          <div className="flex items-center gap-3">
            <div className="size-7 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <AlertCircle className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs text-foreground">Mistake Vault</span>
                <span className="badge text-[10px] text-rose-600 dark:text-rose-400 font-mono">
                  {mistakes.unresolvedQuestions.length} unresolved
                </span>
              </div>
              <p className="text-muted-foreground text-xs mt-0.5">
                Questions requiring review from recent mock assessments.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => navigate('/mistakes')}
              className="btn btn-ghost btn-sm text-xs gap-1"
            >
              <span>View Vault</span>
              <ChevronRight className="size-3" />
            </button>
            <button
              onClick={() => handleLaunchMistakeDrill(10)}
              className="btn btn-error btn-sm text-xs gap-1.5"
            >
              <Play className="size-3 fill-current" />
              <span>Practice Errors ({Math.min(10, mistakes.unresolvedQuestions.length)})</span>
            </button>
          </div>
        </div>
      )}

      {/* Primary Papers Section */}
      <section className="space-y-3">
        {loading ? (
          <div className="flex min-h-[25vh] items-center justify-center">
            <span className="loading-spinner" />
          </div>
        ) : filteredPapers.length === 0 ? (
          <div className="card flex flex-col items-center justify-center p-12 text-center">
            <BookOpen className="size-8 text-muted-foreground/50 mb-2" />
            <h3 className="text-sm font-semibold text-foreground">No Papers Found</h3>
            <p className="text-muted-foreground text-xs max-w-sm mt-1">
              {searchQuery
                ? 'No assessments match your search criteria.'
                : 'Get started by creating or importing a mock exam paper.'}
            </p>
            <button
              onClick={() => navigate('/builder')}
              className="btn btn-primary btn-sm mt-4 gap-1.5"
            >
              <Plus className="size-3.5" />
              <span>Create Paper</span>
            </button>
          </div>
        ) : viewMode === 'list' ? (
          /* Native macOS Desktop Table View */
          <div className="card overflow-hidden">
            <table className="table">
              <thead>
                <tr>
                  <th className="w-1/3">Paper Title</th>
                  <th>Mode</th>
                  <th>Structure</th>
                  <th>Duration</th>
                  <th>Best Score</th>
                  <th>Attempts</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPapers.map((paper) => {
                  const stats = paperStats[paper.id];
                  const totalQ = paper.sections.reduce(
                    (sum, s) => sum + (s.selection.staticQuestionIds?.length || 0),
                    0
                  );
                  const durationMin = Math.round(paper.timing.totalDurationSeconds / 60);

                  return (
                    <tr key={paper.id} className="hover:bg-muted/40 transition-colors">
                      <td className="py-2.5">
                        <div className="flex flex-col">
                          <span className="font-semibold text-sm text-foreground">
                            {paper.title}
                          </span>
                          {paper.description && (
                            <span className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                              {paper.description}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5">
                        <span className="badge font-mono text-xs">{paper.mode}</span>
                      </td>
                      <td className="font-mono text-xs text-muted-foreground py-2.5">
                        {paper.sections.length} sec • {totalQ} Qs
                      </td>
                      <td className="font-mono text-xs text-muted-foreground py-2.5">
                        {durationMin > 0 ? `${durationMin}m` : 'Untimed'}
                      </td>
                      <td className="font-mono text-xs py-2.5">
                        {stats?.bestScore !== undefined ? (
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {stats.bestScore}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>
                      <td className="font-mono text-xs py-2.5">
                        {stats?.attemptsCount ? (
                          <span className="text-foreground">
                            {stats.attemptsCount} attempt{stats.attemptsCount !== 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">Unattempted</span>
                        )}
                      </td>
                      <td className="text-right py-2.5">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleLaunchPaperExam(paper.id)}
                            className="btn btn-primary btn-sm h-7 px-2.5 text-xs gap-1.5 font-medium"
                            title="Start Timed CBT Exam"
                          >
                            <Play className="size-3 fill-current" />
                            <span>Exam</span>
                          </button>
                          <button
                            onClick={() => handleLaunchPaperPractice(paper)}
                            className="btn btn-sm h-7 px-2.5 text-xs gap-1.5 font-medium"
                            title="Start Practice Mode"
                          >
                            <Zap className="size-3" />
                            <span>Practice</span>
                          </button>
                          <button
                            onClick={(e) => handleExportPaper(e, paper)}
                            className="btn btn-ghost btn-sm h-7 w-7 p-0 flex items-center justify-center text-muted-foreground hover:text-foreground"
                            title="Export as Markdown"
                          >
                            <Download className="size-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDeletePaper(e, paper.id)}
                            className="btn btn-ghost btn-sm h-7 w-7 p-0 flex items-center justify-center text-muted-foreground hover:text-red-500"
                            title="Delete Paper"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Native macOS Document Grid View */
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPapers.map((paper) => {
              const stats = paperStats[paper.id];
              const totalQ = paper.sections.reduce(
                (sum, s) => sum + (s.selection.staticQuestionIds?.length || 0),
                0
              );
              const durationMin = Math.round(paper.timing.totalDurationSeconds / 60);

              return (
                <div
                  key={paper.id}
                  className="card p-4 flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="badge text-[10px] font-mono">{paper.mode}</span>
                      {stats?.attemptsCount ? (
                        <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
                          <CheckCircle2 className="size-3 text-emerald-500" />
                          {stats.attemptsCount} Attempt{stats.attemptsCount !== 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono text-muted-foreground/60">
                          Unattempted
                        </span>
                      )}
                    </div>

                    <h3 className="font-semibold text-xs leading-snug line-clamp-2 text-foreground">
                      {paper.title}
                    </h3>

                    {paper.description && (
                      <p className="text-muted-foreground text-xs line-clamp-2">
                        {paper.description}
                      </p>
                    )}

                    <div className="flex items-center gap-3 pt-1 text-[11px] font-mono text-muted-foreground">
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

                    {stats?.bestScore !== undefined && (
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-border/40">
                        <span className="text-[11px] text-muted-foreground">Best Score</span>
                        <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                          {stats.bestScore}%
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border/60">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleLaunchPaperExam(paper.id)}
                        className="btn btn-primary btn-xs gap-1"
                      >
                        <Play className="size-2.5 fill-current" />
                        <span>Exam</span>
                      </button>
                      <button
                        onClick={() => handleLaunchPaperPractice(paper)}
                        className="btn btn-xs gap-1"
                      >
                        <Zap className="size-2.5" />
                        <span>Practice</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => handleExportPaper(e, paper)}
                        className="btn btn-ghost btn-xs px-1.5"
                        title="Export Markdown"
                      >
                        <Download className="size-3 text-muted-foreground" />
                      </button>
                      <button
                        onClick={(e) => handleDeletePaper(e, paper.id)}
                        className="btn btn-ghost btn-xs px-1.5 hover:text-red-500"
                        title="Delete"
                      >
                        <Trash2 className="size-3 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent Attempts History Table */}
      {analytics && analytics.recentScoreTrends.length > 0 && (
        <section className="space-y-3 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Recent Attempts</h2>
              <p className="text-xs text-muted-foreground">Recent exam scorecards and history.</p>
            </div>
            <button
              onClick={() => navigate('/analysis')}
              className="text-xs text-primary hover:underline font-medium"
            >
              View all in Analysis →
            </button>
          </div>

          <div className="card overflow-hidden">
            <table className="table">
              <thead>
                <tr>
                  <th>Assessment</th>
                  <th>Date</th>
                  <th>Score</th>
                  <th>Accuracy</th>
                  <th>Duration</th>
                  <th className="text-right">Scorecard</th>
                </tr>
              </thead>
              <tbody>
                {analytics.recentScoreTrends.slice(0, 5).map((att) => (
                  <tr key={att.attemptId} className="hover:bg-muted/30">
                    <td className="font-medium text-xs text-foreground">{att.testTitle}</td>
                    <td className="text-muted-foreground font-mono text-[11px]">
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3 text-muted-foreground/70" />
                        {new Date(att.date).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="font-mono text-[11px] tabular-nums">
                      <span className="font-semibold text-foreground">{att.scorePercentage}%</span>
                      <span className="text-muted-foreground ml-1">
                        ({att.totalMarks}/{att.maxMarks})
                      </span>
                    </td>
                    <td>
                      <span className="badge font-mono text-[10px]">
                        {att.accuracy}%
                      </span>
                    </td>
                    <td className="text-muted-foreground font-mono text-[11px]">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3 text-muted-foreground/70" />
                        {formatTimeSeconds(att.timeSpentSeconds)}
                      </span>
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => navigate(`/result/${att.attemptId}`)}
                        className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
                      >
                        <span>Scorecard</span>
                        <ExternalLink className="size-2.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Subject Performance Breakdown */}
      {analytics && analytics.subjectBreakdown.length > 0 && (
        <section className="space-y-3 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Subject Accuracy</h2>
              <p className="text-xs text-muted-foreground">Historical mastery by topic and domain.</p>
            </div>
            <button
              onClick={() => navigate('/analysis')}
              className="text-xs text-primary hover:underline font-medium"
            >
              Detailed Breakdown →
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {analytics.subjectBreakdown.slice(0, 6).map((subj) => (
              <div
                key={subj.subject}
                onClick={() => navigate(`/practice?subject=${encodeURIComponent(subj.subject)}`)}
                className="card p-3 flex flex-col justify-between cursor-pointer hover:border-foreground/20 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-semibold text-foreground truncate">{subj.subject}</span>
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {subj.accuracy}%
                    </span>
                  </div>
                  <p className="text-muted-foreground text-[11px] font-mono">
                    {subj.correct} of {subj.total} correct
                  </p>
                </div>

                <div className="mt-2.5">
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${subj.accuracy}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-1.5 font-mono">
                    <span>{subj.topics.length} topic{subj.topics.length !== 1 ? 's' : ''}</span>
                    <span className="text-primary font-medium">Practice Drills →</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
