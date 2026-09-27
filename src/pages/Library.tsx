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
  Copy,
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
import { saveExportFile, showNativeAlert, showNativeConfirm } from '@/core/native/tauriBridge';
import { serializeTestToMarkdown } from '@/core/parser/testSerializer';
import { assessmentRepository } from '@/core/storage/repository';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { MacContextMenuPortal } from '@/components/ui/context-menu';
import { useMacContextMenu } from '@/hooks/useMacContextMenu';
import type { QuestionModel } from '@/types/question';
import type { TestDefinition } from '@/types/test';

export function Library() {
  const navigate = useNavigate();
  const { contextMenuState, openContextMenu, closeContextMenu } = useMacContextMenu();

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
  const [analytics, setAnalytics] = useState<Awaited<
    ReturnType<typeof assessmentRepository.getComprehensiveAnalytics>
  > | null>(null);

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
      await showNativeAlert(`Could not launch exam: ${err.message || 'Unknown error'}`, {
        title: 'Launch Error',
        kind: 'error',
      });
    }
  };

  // Launch Paper in Practice Mode (Untimed, Instant Feedback)
  const handleLaunchPaperPractice = useCallback(
    async (paper: TestDefinition) => {
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
        await showNativeAlert(`Could not start practice: ${err.message || 'Unknown error'}`, {
          title: 'Practice Mode Error',
          kind: 'error',
        });
      }
    },
    [navigate],
  );

  // 1-Click Mistake Drill Launcher
  const handleLaunchMistakeDrill = async (maxCount = 10) => {
    try {
      const attempt = await assessmentRepository.generateMistakeDrill(maxCount);
      navigate(`/runner/${attempt.id}`);
    } catch (err: any) {
      await showNativeAlert(err.message || 'No mistakes available to practice.', {
        title: 'Mistake Drill',
        kind: 'info',
      });
    }
  };

  // Delete Paper
  const handleDeletePaper = async (e: React.MouseEvent, testId: string) => {
    e.stopPropagation();
    const confirmed = await showNativeConfirm(
      'Are you sure you want to delete this paper? This action cannot be undone.',
      {
        title: 'Delete Paper',
        kind: 'warning',
        okLabel: 'Delete',
        cancelLabel: 'Cancel',
      },
    );
    if (!confirmed) return;
    try {
      await assessmentRepository.deleteTest(testId);
      await loadData();
    } catch (err: any) {
      await showNativeAlert(`Failed to delete paper: ${err.message || 'Unknown error'}`, {
        title: 'Delete Error',
        kind: 'error',
      });
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
        sectionsWithQuestions,
      );

      const safeName = paper.title.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      await saveExportFile(`${safeName}_blueprint.md`, md, 'text/markdown;charset=utf-8;');
    } catch (err: any) {
      await showNativeAlert(`Export failed: ${err.message || 'Unknown error'}`, {
        title: 'Export Error',
        kind: 'error',
      });
    }
  };

  // Duplicate Paper
  const handleDuplicatePaper = async (paper: TestDefinition) => {
    try {
      const newPaper: TestDefinition = {
        ...paper,
        id: crypto.randomUUID(),
        title: `${paper.title} (Copy)`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await assessmentRepository.saveTest(newPaper);
      await loadData();
    } catch (err: any) {
      await showNativeAlert(`Failed to duplicate paper: ${err.message || 'Unknown error'}`, {
        title: 'Duplicate Error',
        kind: 'error',
      });
    }
  };

  // macOS Native Contextual Menu Handler
  const handlePaperContextMenu = (e: React.MouseEvent, paper: TestDefinition) => {
    openContextMenu(e, [
      {
        id: 'launch-exam',
        label: 'Launch Timed CBT Exam',
        icon: Play,
        shortcut: '↵',
        onClick: () => handleLaunchPaperExam(paper.id),
      },
      {
        id: 'start-practice',
        label: 'Start Practice Mode',
        icon: Zap,
        onClick: () => handleLaunchPaperPractice(paper),
      },
      { type: 'divider' },
      {
        id: 'duplicate',
        label: 'Duplicate Paper',
        icon: Copy,
        shortcut: '⌘D',
        onClick: () => handleDuplicatePaper(paper),
      },
      {
        id: 'export-md',
        label: 'Export Blueprint (.md)',
        icon: Download,
        shortcut: '⌘E',
        onClick: () => handleExportPaper(e, paper),
      },
      { type: 'divider' },
      {
        id: 'delete-paper',
        label: 'Move to Trash',
        icon: Trash2,
        shortcut: '⌘⌫',
        destructive: true,
        onClick: () => handleDeletePaper(e, paper.id),
      },
    ]);
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-6 py-5 pb-20 lg:px-8">
      {/* Standard Header */}
      <div className="border-border/60 border-b pb-3">
        <h1 className="text-foreground text-xl font-bold tracking-tight">Papers</h1>
        <p className="text-muted-foreground mt-0.5 text-xs">
          Full examination papers, blueprint mocks, and practice sets. Double-click any row to
          launch.
        </p>
      </div>

      {/* Desktop Sub-Toolbar / Action Bar */}
      <div className="border-border/60 flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {/* Segmented Filter */}
          <SegmentedControl
            value={filterMode}
            onValueChange={(val) => setFilterMode(val as typeof filterMode)}
            size="sm"
            options={[
              { value: 'ALL', label: 'All Papers' },
              { value: 'EXAM', label: 'Timed Mocks' },
              { value: 'PRACTICE', label: 'Practice Sets' },
            ]}
          />

          <span className="text-muted-foreground font-mono text-xs">
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
              aria-label="Search papers"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-40 sm:w-52"
            />
          </div>

          <SegmentedControl
            value={viewMode}
            onValueChange={(val) => setViewMode(val as typeof viewMode)}
            size="sm"
            ariaLabel="View layout"
            options={[
              { value: 'list', icon: List, title: 'List View' },
              { value: 'grid', icon: LayoutGrid, title: 'Grid View' },
            ]}
          />
        </div>
      </div>

      {/* Mistake Vault Native Inset Callout */}
      {mistakes.unresolvedQuestions.length > 0 && (
        <div className="card border-border flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <AlertCircle className="size-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-foreground text-xs font-semibold">Mistake Vault</span>
                <span className="badge font-mono text-[10px] text-rose-600 dark:text-rose-400">
                  {mistakes.unresolvedQuestions.length} unresolved
                </span>
              </div>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Questions requiring review from recent mock assessments.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => navigate('/mistakes')}
              className="btn btn-ghost btn-sm gap-1 text-xs"
            >
              <span>View Vault</span>
              <ChevronRight className="size-3" />
            </button>
            <button
              onClick={() => handleLaunchMistakeDrill(10)}
              className="btn btn-error btn-sm gap-1.5 text-xs"
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
            <BookOpen className="text-muted-foreground/50 mb-2 size-8" />
            <h3 className="text-foreground text-sm font-semibold">No Papers Found</h3>
            <p className="text-muted-foreground mt-1 max-w-sm text-xs">
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
                <tr className="border-border/80 border-b">
                  <th className="text-muted-foreground w-1/3 px-3.5 py-2.5 text-[11px] font-semibold tracking-wider uppercase">
                    Paper Title
                  </th>
                  <th className="text-muted-foreground px-3 py-2.5 text-[11px] font-semibold tracking-wider uppercase">
                    Mode
                  </th>
                  <th className="text-muted-foreground px-3 py-2.5 text-[11px] font-semibold tracking-wider uppercase">
                    Structure
                  </th>
                  <th className="text-muted-foreground px-3 py-2.5 text-[11px] font-semibold tracking-wider uppercase">
                    Duration
                  </th>
                  <th className="text-muted-foreground px-3 py-2.5 text-[11px] font-semibold tracking-wider uppercase">
                    Best Score
                  </th>
                  <th className="text-muted-foreground px-3 py-2.5 text-[11px] font-semibold tracking-wider uppercase">
                    Attempts
                  </th>
                  <th className="text-muted-foreground px-3.5 py-2.5 text-right text-[11px] font-semibold tracking-wider uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredPapers.map((paper) => {
                  const stats = paperStats[paper.id];
                  const totalQ = paper.sections.reduce(
                    (sum, s) => sum + (s.selection.staticQuestionIds?.length || 0),
                    0,
                  );
                  const durationMin = Math.round(paper.timing.totalDurationSeconds / 60);

                  return (
                    <tr
                      key={paper.id}
                      onDoubleClick={() => handleLaunchPaperExam(paper.id)}
                      onContextMenu={(e) => handlePaperContextMenu(e, paper)}
                      title="Double-click to start CBT Exam • Right-click for options"
                      className="border-border/40 cursor-default border-b transition-colors hover:bg-black/2.5 dark:hover:bg-white/4"
                    >
                      <td className="px-3.5 py-3">
                        <div className="flex flex-col">
                          <span className="text-foreground text-[13px] font-semibold tracking-tight">
                            {paper.title}
                          </span>
                          {paper.description && (
                            <span className="text-muted-foreground mt-0.5 line-clamp-1 text-[11px]">
                              {paper.description}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-blue-600 dark:text-blue-400">
                          {paper.mode}
                        </span>
                      </td>
                      <td className="text-muted-foreground px-3 py-3 font-mono text-[12px]">
                        {paper.sections.length} sec • {totalQ} Qs
                      </td>
                      <td className="text-muted-foreground px-3 py-3 font-mono text-[12px]">
                        {durationMin > 0 ? `${durationMin}m` : 'Untimed'}
                      </td>
                      <td className="px-3 py-3 font-mono text-[12px]">
                        {stats?.bestScore !== undefined ? (
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {stats.bestScore}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono text-[12px]">
                        {stats?.attemptsCount ? (
                          <span className="text-foreground/90">
                            {stats.attemptsCount} attempt{stats.attemptsCount !== 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">Unattempted</span>
                        )}
                      </td>
                      <td className="px-3.5 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleLaunchPaperExam(paper.id)}
                            className="btn btn-primary btn-xs h-6 gap-1 rounded-full px-2.5 text-[11px] font-medium shadow-2xs"
                            title="Start Timed CBT Exam"
                          >
                            <Play className="size-2.5 fill-current" />
                            <span>Exam</span>
                          </button>
                          <button
                            onClick={() => handleLaunchPaperPractice(paper)}
                            className="btn btn-outline btn-xs text-foreground/80 hover:text-foreground h-6 gap-1 rounded-full px-2.5 text-[11px] font-medium"
                            title="Start Practice Mode"
                          >
                            <Zap className="size-2.5" />
                            <span>Practice</span>
                          </button>
                          <button
                            onClick={(e) => handleExportPaper(e, paper)}
                            className="btn btn-ghost btn-xs text-muted-foreground hover:text-foreground h-6 w-6 rounded-md p-0"
                            title="Export as Markdown"
                          >
                            <Download className="size-3" />
                          </button>
                          <button
                            onClick={(e) => handleDeletePaper(e, paper.id)}
                            className="btn btn-ghost btn-xs text-muted-foreground h-6 w-6 rounded-md p-0 hover:text-red-500"
                            title="Delete Paper"
                          >
                            <Trash2 className="size-3" />
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
                0,
              );
              const durationMin = Math.round(paper.timing.totalDurationSeconds / 60);

              return (
                <div
                  key={paper.id}
                  onDoubleClick={() => handleLaunchPaperExam(paper.id)}
                  onContextMenu={(e) => handlePaperContextMenu(e, paper)}
                  title="Double-click to start CBT Exam • Right-click for options"
                  className="card hover:border-border/80 flex cursor-default flex-col justify-between space-y-3 p-4 transition-all"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-blue-600 dark:text-blue-400">
                        {paper.mode}
                      </span>
                      {stats?.attemptsCount ? (
                        <span className="text-muted-foreground flex items-center gap-1 font-mono text-[11px]">
                          <CheckCircle2 className="size-3 text-emerald-500" />
                          {stats.attemptsCount} Attempt{stats.attemptsCount !== 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50 font-mono text-[11px]">
                          Unattempted
                        </span>
                      )}
                    </div>

                    <h3 className="text-foreground line-clamp-2 text-[13px] leading-snug font-semibold tracking-tight">
                      {paper.title}
                    </h3>

                    {paper.description && (
                      <p className="text-muted-foreground line-clamp-2 text-[11px]">
                        {paper.description}
                      </p>
                    )}

                    <div className="text-muted-foreground flex items-center gap-3 pt-1 font-mono text-[11px]">
                      <span className="flex items-center gap-1">
                        <Clock className="text-muted-foreground/70 size-3" />
                        {durationMin > 0 ? `${durationMin}m` : 'Untimed'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers className="text-muted-foreground/70 size-3" />
                        {paper.sections.length} sec
                      </span>
                      <span className="flex items-center gap-1">
                        <Award className="text-muted-foreground/70 size-3" />
                        {totalQ} Qs
                      </span>
                    </div>

                    {stats?.bestScore !== undefined && (
                      <div className="border-border/40 flex items-center justify-between border-t pt-1.5 text-xs">
                        <span className="text-muted-foreground text-[11px]">Best Score</span>
                        <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                          {stats.bestScore}%
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="border-border/60 flex items-center justify-between border-t pt-2.5">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleLaunchPaperExam(paper.id)}
                        className="btn btn-primary btn-xs h-6 gap-1 rounded-full px-2.5 text-[11px] font-medium shadow-2xs"
                      >
                        <Play className="size-2.5 fill-current" />
                        <span>Exam</span>
                      </button>
                      <button
                        onClick={() => handleLaunchPaperPractice(paper)}
                        className="btn btn-outline btn-xs text-foreground/80 hover:text-foreground h-6 gap-1 rounded-full px-2.5 text-[11px] font-medium"
                      >
                        <Zap className="size-2.5" />
                        <span>Practice</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => handleExportPaper(e, paper)}
                        className="btn btn-ghost btn-xs text-muted-foreground hover:text-foreground h-6 w-6 rounded-md p-0"
                        title="Export Markdown"
                      >
                        <Download className="size-3" />
                      </button>
                      <button
                        onClick={(e) => handleDeletePaper(e, paper.id)}
                        className="btn btn-ghost btn-xs text-muted-foreground h-6 w-6 rounded-md p-0 hover:text-red-500"
                        title="Delete"
                      >
                        <Trash2 className="size-3" />
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
              <h2 className="text-foreground text-sm font-semibold">Recent Attempts</h2>
              <p className="text-muted-foreground text-xs">Recent exam scorecards and history.</p>
            </div>
            <button
              onClick={() => navigate('/analysis')}
              className="text-primary text-xs font-medium hover:underline"
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
                    <td className="text-foreground text-xs font-medium">{att.testTitle}</td>
                    <td className="text-muted-foreground font-mono text-[11px]">
                      <span className="flex items-center gap-1">
                        <Calendar className="text-muted-foreground/70 size-3" />
                        {new Date(att.date).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="font-mono text-[11px] tabular-nums">
                      <span className="text-foreground font-semibold">{att.scorePercentage}%</span>
                      <span className="text-muted-foreground ml-1">
                        ({att.totalMarks}/{att.maxMarks})
                      </span>
                    </td>
                    <td>
                      <span className="badge font-mono text-[10px]">{att.accuracy}%</span>
                    </td>
                    <td className="text-muted-foreground font-mono text-[11px]">
                      <span className="flex items-center gap-1">
                        <Clock className="text-muted-foreground/70 size-3" />
                        {formatTimeSeconds(att.timeSpentSeconds)}
                      </span>
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => navigate(`/result/${att.attemptId}`)}
                        className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
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
              <h2 className="text-foreground text-sm font-semibold">Subject Accuracy</h2>
              <p className="text-muted-foreground text-xs">
                Historical mastery by topic and domain.
              </p>
            </div>
            <button
              onClick={() => navigate('/analysis')}
              className="text-primary text-xs font-medium hover:underline"
            >
              Detailed Breakdown →
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {analytics.subjectBreakdown.slice(0, 6).map((subj) => (
              <div
                key={subj.subject}
                onClick={() => navigate(`/practice?subject=${encodeURIComponent(subj.subject)}`)}
                className="card hover:border-foreground/20 flex cursor-pointer flex-col justify-between p-3 transition-colors"
              >
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-foreground truncate font-semibold">{subj.subject}</span>
                    <span className="text-foreground font-mono text-xs font-semibold">
                      {subj.accuracy}%
                    </span>
                  </div>
                  <p className="text-muted-foreground font-mono text-[11px]">
                    {subj.correct} of {subj.total} correct
                  </p>
                </div>

                <div className="mt-2.5">
                  <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                    <div
                      className="bg-primary h-full rounded-full transition-all duration-300"
                      style={{ width: `${subj.accuracy}%` }}
                    />
                  </div>
                  <div className="text-muted-foreground mt-1.5 flex items-center justify-between font-mono text-[10px]">
                    <span>
                      {subj.topics.length} topic{subj.topics.length !== 1 ? 's' : ''}
                    </span>
                    <span className="text-primary font-medium">Practice Drills →</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      {/* Native macOS Contextual Menu Portal */}
      <MacContextMenuPortal state={contextMenuState} onClose={closeContextMenu} />
    </div>
  );
}
