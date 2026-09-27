import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Compass,
  Copy,
  RotateCcw,
  Search,
  Zap,
} from 'lucide-react';
import { MathRenderer } from '@/components/shared/MathRenderer';
import { QuestionDetailModal } from '@/components/shared/QuestionDetailModal';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { MacContextMenuPortal } from '@/components/ui/context-menu';
import { useMacContextMenu } from '@/hooks/useMacContextMenu';
import { assessmentRepository } from '@/core/storage/repository';
import { showNativeAlert, writeToClipboard } from '@/core/native/tauriBridge';
import type { QuestionModel } from '@/types/question';
import type { TestDefinition } from '@/types/test';

export function Practice() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { contextMenuState, openContextMenu, closeContextMenu } = useMacContextMenu();

  // Loading & Paging
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<QuestionModel[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  // Facets
  const [subjects, setSubjects] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  // Active Filters (initialized from URL if present)
  const [selectedSubject, setSelectedSubject] = useState(searchParams.get('subject') || 'ALL');
  const [selectedTopic, setSelectedTopic] = useState(searchParams.get('topic') || 'ALL');
  const [selectedTag, setSelectedTag] = useState(searchParams.get('tag') || 'ALL');
  const [selectedDifficulty, setSelectedDifficulty] = useState('ALL');
  const [selectedType, setSelectedType] = useState('ALL');
  const [search, setSearch] = useState('');
  const [showAllTags, setShowAllTags] = useState(false);

  // Modal index for reviewing question & explanation with arrow keys
  const [modalIndex, setModalIndex] = useState<number | null>(null);

  // Drill Launcher Drawer
  const [drillCount, setDrillCount] = useState(10);
  const [drillTimed, setDrillTimed] = useState(false);
  const [paceMinutes, setPaceMinutes] = useState(1.5);
  const [launchingDrill, setLaunchingDrill] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load Facets
  const loadFacets = useCallback(async () => {
    try {
      const [distSubjects, distTags] = await Promise.all([
        assessmentRepository.getDistinctSubjects(),
        assessmentRepository.getDistinctTags(),
      ]);
      setSubjects(distSubjects);
      setTags(distTags);
    } catch (err) {
      console.error('Failed to load facets:', err);
    }
  }, []);

  const loadTopicsForSubject = useCallback(async (subj: string) => {
    try {
      const distTopics = await assessmentRepository.getDistinctTopics(subj);
      setTopics(distTopics);
    } catch (err) {
      console.error('Failed to load topics:', err);
    }
  }, []);

  // Load Questions
  const loadQuestions = useCallback(
    async (targetPage = page) => {
      setLoading(true);
      try {
        const res = await assessmentRepository.getQuestionsPaged({
          page: targetPage,
          pageSize,
          filters: {
            subject: selectedSubject !== 'ALL' ? selectedSubject : undefined,
            topic: selectedTopic !== 'ALL' ? selectedTopic : undefined,
            difficulty: selectedDifficulty !== 'ALL' ? selectedDifficulty : undefined,
            type: selectedType !== 'ALL' ? selectedType : undefined,
            search: search.trim() ? search : selectedTag !== 'ALL' ? selectedTag : undefined,
          },
        });
        setQuestions(res.items);
        setTotalCount(res.totalCount);
        setTotalPages(res.totalPages);
        setPage(res.page);
      } catch (err) {
        console.error('Failed to load questions:', err);
      } finally {
        setLoading(false);
      }
    },
    [
      page,
      pageSize,
      selectedSubject,
      selectedTopic,
      selectedDifficulty,
      selectedType,
      selectedTag,
      search,
    ],
  );

  useEffect(() => {
    loadFacets();
  }, [loadFacets]);

  useEffect(() => {
    loadTopicsForSubject(selectedSubject);
    assessmentRepository
      .getDistinctTags(selectedSubject !== 'ALL' ? selectedSubject : undefined)
      .then(setTags)
      .catch(() => {});
  }, [selectedSubject, loadTopicsForSubject]);

  useEffect(() => {
    loadQuestions(1);
  }, [
    selectedSubject,
    selectedTopic,
    selectedDifficulty,
    selectedType,
    selectedTag,
    search,
    loadQuestions,
  ]);

  // Launch Drill
  const handleLaunchDrill = useCallback(async () => {
    setLaunchingDrill(true);
    try {
      const activeQuestions = await assessmentRepository.getQuestions({
        subject: selectedSubject !== 'ALL' ? selectedSubject : undefined,
        topic: selectedTopic !== 'ALL' ? selectedTopic : undefined,
        difficulty: selectedDifficulty !== 'ALL' ? selectedDifficulty : undefined,
        type: selectedType !== 'ALL' ? selectedType : undefined,
        search: search.trim() ? search : selectedTag !== 'ALL' ? selectedTag : undefined,
      });

      if (activeQuestions.length === 0) {
        await showNativeAlert('No questions match your current filters.', {
          title: 'Drill Filter',
          kind: 'info',
        });
        return;
      }

      // Shuffle
      const shuffled = [...activeQuestions].sort(() => Math.random() - 0.5);
      const selectedSubset = shuffled.slice(0, Math.min(drillCount, shuffled.length));

      const drillDef: TestDefinition = {
        id: `drill_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: `Drill: ${selectedSubject !== 'ALL' ? selectedSubject : 'Mixed'} (${selectedSubset.length} Qs)`,
        description: `Adaptive drill matching ${[
          selectedSubject !== 'ALL' ? selectedSubject : null,
          selectedTopic !== 'ALL' ? selectedTopic : null,
          selectedTag !== 'ALL' ? selectedTag : null,
          selectedDifficulty !== 'ALL' ? selectedDifficulty : null,
        ]
          .filter(Boolean)
          .join(' • ')}`,
        mode: drillTimed ? 'EXAM' : 'PRACTICE',
        schemaVersion: '2.0',
        version: 1,
        sections: [
          {
            id: 'sec_drill',
            title: 'Drill Section',
            order: 0,
            selection: {
              mode: 'STATIC',
              staticQuestionIds: selectedSubset.map((q) => ({ id: q.id })),
            },
          },
        ],
        timing: {
          mode: drillTimed ? 'GLOBAL' : 'NONE',
          totalDurationSeconds: drillTimed
            ? Math.round(selectedSubset.length * paceMinutes * 60)
            : 0,
          allowPause: true,
          autoSubmitOnExpiry: drillTimed,
        },
        scoring: {
          defaultMarks: 4,
          defaultNegativeMarks: drillTimed ? 1 : 0,
          allowPartialCredit: true,
        },
        navigation: 'FREE',
        randomization: {
          shuffleQuestions: true,
          shuffleOptions: true,
          seed: Math.floor(Math.random() * 2147483647),
        },
        feedback: {
          showImmediateSolution: !drillTimed,
          showHint: !drillTimed,
          allowCheckAnswer: !drillTimed,
          showDetailedSolutionsAfterSubmit: true,
        },
        tags: ['practice-drill'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await assessmentRepository.saveTest(drillDef);
      const attempt = await assessmentRepository.startAttempt(drillDef.id);
      navigate(`/runner/${attempt.id}`);
    } catch (err: any) {
      await showNativeAlert(`Could not launch drill: ${err.message || 'Unknown error'}`, {
        title: 'Launch Error',
        kind: 'error',
      });
    } finally {
      setLaunchingDrill(false);
    }
  }, [
    selectedSubject,
    selectedTopic,
    selectedDifficulty,
    selectedType,
    search,
    selectedTag,
    drillCount,
    drillTimed,
    paceMinutes,
    navigate,
  ]);

  // Dynamic drill max based on available questions
  const availableQuestions = totalCount;
  const maxDrillQuestions = Math.max(1, Math.min(availableQuestions || 50, 100));
  const effectiveDrillCount = Math.min(drillCount, maxDrillQuestions);
  const totalDrillMinutes = Math.round(effectiveDrillCount * paceMinutes);

  // Auto-clamp drill count when filters reduce available pool
  useEffect(() => {
    if (availableQuestions > 0 && drillCount > availableQuestions) {
      setDrillCount(availableQuestions);
    }
  }, [availableQuestions, drillCount]);

  const handleQuestionContextMenu = (e: React.MouseEvent, q: QuestionModel, idx: number) => {
    openContextMenu(e, [
      {
        id: 'inspect-question',
        label: 'Inspect Question & Explanation',
        icon: BookOpen,
        shortcut: '↵',
        onClick: () => setModalIndex(idx),
      },
      {
        id: 'copy-prompt',
        label: 'Copy Question Text',
        icon: Copy,
        shortcut: '⌘C',
        onClick: () => {
          writeToClipboard(q.body);
        },
      },
      { type: 'divider' },
      {
        id: 'launch-filtered-drill',
        label: `Launch Drill (${Math.min(effectiveDrillCount, totalCount)} Qs)`,
        icon: Zap,
        onClick: handleLaunchDrill,
      },
    ]);
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-6 py-5 pb-20 lg:px-8">
      {/* Standard Header */}
      <div className="border-border/60 flex flex-col justify-between gap-3 border-b pb-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-foreground text-xl font-bold tracking-tight">Drills</h1>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {totalCount} question{totalCount !== 1 ? 's' : ''} available across topics. Configure
            and practice below.
          </p>
        </div>
      </div>

      {/* Drill Configuration Inspector Card */}
      <div className="card border-border/70 flex flex-wrap items-center justify-between gap-3 p-3 sm:px-4 sm:py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Questions:
            </span>
            <span className="text-foreground bg-muted/60 border-border/50 rounded-md border px-2 py-0.5 font-mono text-xs font-semibold">
              {effectiveDrillCount} Qs
            </span>
          </div>

          <div className="w-32 sm:w-44">
            <Slider
              value={effectiveDrillCount}
              min={1}
              max={maxDrillQuestions}
              step={maxDrillQuestions > 10 ? 5 : 1}
              size="sm"
              disabled={totalCount === 0}
              onValueChange={setDrillCount}
              label="Question Count"
            />
          </div>

          <div className="bg-border/60 mx-1 hidden h-4 w-px sm:block" />

          <Switch
            checked={drillTimed}
            onCheckedChange={setDrillTimed}
            label={drillTimed ? `Timed (${totalDrillMinutes}m)` : 'Untimed'}
            variant="accent"
          />

          {drillTimed && (
            <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <span className="text-[11px] font-medium">Pace:</span>
              <select
                value={paceMinutes}
                onChange={(e) => setPaceMinutes(parseFloat(e.target.value))}
                aria-label="Target pace per question"
                className="border-border bg-input text-foreground focus:border-primary h-6.5 rounded-md border px-2 text-[11.5px] focus:outline-none"
              >
                <option value={1}>1.0 m/Q (Speed)</option>
                <option value={1.5}>1.5 m/Q (Standard)</option>
                <option value={2}>2.0 m/Q (Deep)</option>
                <option value={3}>3.0 m/Q (Conceptual)</option>
              </select>
            </div>
          )}
        </div>

        <button
          id="practice-launch-drill-btn"
          onClick={handleLaunchDrill}
          disabled={totalCount === 0 || launchingDrill}
          className="btn btn-primary btn-sm h-7 gap-1.5 rounded-md px-3 text-xs font-medium shadow-xs"
        >
          {launchingDrill ? (
            <span className="loading-spinner size-3.5" />
          ) : (
            <Zap className="size-3.5 fill-current" />
          )}
          <span>Launch Drill ({Math.min(effectiveDrillCount, totalCount)})</span>
        </button>
      </div>

      {/* Adaptive Facets Filtering Bar */}
      <div className="card space-y-3.5 p-4 sm:p-4.5">
        {/* Row 1: Search & Dropdowns */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="macos-search-field min-w-50 flex-1">
            <Search className="size-3.5" />
            <input
              ref={searchInputRef}
              type="search"
              placeholder="Search question text or tags..."
              aria-label="Search question text or tags"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Difficulty Segmented Control */}
            <SegmentedControl
              value={selectedDifficulty}
              onValueChange={(val) => setSelectedDifficulty(val as any)}
              size="sm"
              options={[
                { value: 'ALL', label: 'All' },
                { value: 'easy', label: 'Easy' },
                { value: 'medium', label: 'Medium' },
                { value: 'hard', label: 'Hard' },
              ]}
            />

            {/* Question Type */}
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              aria-label="Filter by question type"
              className="border-border bg-input text-foreground focus:border-primary h-8 rounded-md border px-2.5 text-xs focus:outline-none"
            >
              <option value="ALL">All Question Types</option>
              <option value="single_choice">Single Choice (MCQ)</option>
              <option value="multiple_choice">Multiple Correct</option>
              <option value="numerical">Numerical Range</option>
              <option value="true_false">True / False</option>
            </select>

            {(selectedSubject !== 'ALL' ||
              selectedTopic !== 'ALL' ||
              selectedTag !== 'ALL' ||
              selectedDifficulty !== 'ALL' ||
              selectedType !== 'ALL' ||
              search) && (
              <button
                onClick={() => {
                  setSelectedSubject('ALL');
                  setSelectedTopic('ALL');
                  setSelectedTag('ALL');
                  setSelectedDifficulty('ALL');
                  setSelectedType('ALL');
                  setSearch('');
                }}
                className="btn btn-ghost btn-xs text-muted-foreground hover:text-destructive border-border h-8 gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-all"
              >
                <RotateCcw className="size-3" />
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Subjects Chips */}
        {subjects.length > 0 && (
          <div className="border-border/60 flex flex-wrap items-center gap-1.5 border-t pt-2">
            <span className="text-muted-foreground mr-1 font-mono text-[11px] tracking-wider uppercase">
              Subjects:
            </span>
            <button
              onClick={() => {
                setSelectedSubject('ALL');
                setSelectedTopic('ALL');
              }}
              className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-all ${
                selectedSubject === 'ALL'
                  ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                  : 'bg-card/80 hover:bg-card text-foreground/80 hover:text-foreground border-border/80 shadow-2xs'
              }`}
            >
              All Subjects
            </button>
            {subjects.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSelectedSubject(s);
                  setSelectedTopic('ALL');
                }}
                className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-all ${
                  selectedSubject === s
                    ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                    : 'bg-card/80 hover:bg-card text-foreground/80 hover:text-foreground border-border/80 shadow-2xs'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Row 3: Topics Chips (for active subject) */}
        {topics.length > 0 && selectedSubject !== 'ALL' && (
          <div className="border-border/60 flex flex-wrap items-center gap-1.5 border-t pt-2">
            <span className="text-muted-foreground mr-1 font-mono text-[11px] tracking-wider uppercase">
              Topics ({selectedSubject}):
            </span>
            <button
              onClick={() => setSelectedTopic('ALL')}
              className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-all ${
                selectedTopic === 'ALL'
                  ? 'bg-secondary text-secondary-foreground border-border font-semibold shadow-xs'
                  : 'bg-card/80 hover:bg-card text-foreground/80 hover:text-foreground border-border/80 shadow-2xs'
              }`}
            >
              All Topics
            </button>
            {topics.map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTopic(t)}
                className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-all ${
                  selectedTopic === t
                    ? 'bg-secondary text-secondary-foreground border-border font-semibold shadow-xs'
                    : 'bg-card/80 hover:bg-card text-foreground/80 hover:text-foreground border-border/80 shadow-2xs'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {/* Row 4: Tags Chips */}
        {tags.length > 0 && (
          <div className="border-border/60 flex flex-wrap items-center gap-1.5 border-t pt-2">
            <span className="text-muted-foreground mr-1 font-mono text-[11px] tracking-wider uppercase">
              Tags:
            </span>
            {(showAllTags ? tags : tags.slice(0, 10)).map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTag(selectedTag === t ? 'ALL' : t)}
                className={`cursor-pointer rounded-md border px-2 py-0.5 font-mono text-xs transition-all ${
                  selectedTag === t
                    ? 'bg-primary/15 text-primary border-primary/30 font-medium'
                    : 'bg-card/80 hover:bg-card text-muted-foreground hover:text-foreground border-border/80'
                }`}
              >
                #{t}
              </button>
            ))}
            {tags.length > 10 && (
              <button
                onClick={() => setShowAllTags(!showAllTags)}
                className="text-primary ml-1 cursor-pointer font-mono text-xs hover:underline"
              >
                {showAllTags ? 'Show less' : `+${tags.length - 10} more`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Questions Listing */}
      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <span className="loading loading-spinner text-primary loading-md" />
        </div>
      ) : questions.length === 0 ? (
        <div className="border-border/60 bg-card flex flex-col items-center justify-center rounded-lg border p-10 text-center shadow-xs">
          <Compass className="text-muted-foreground/40 size-10" />
          <h3 className="text-foreground mt-3 text-sm font-semibold">No Questions Match Filters</h3>
          <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-xs">
            Reset filter selections or import new questions in the Builder.
          </p>
          <button
            onClick={() => navigate('/builder')}
            className="btn btn-primary btn-sm mt-4 h-8 gap-1.5 px-3 text-xs font-medium shadow-xs"
          >
            <Zap className="size-3.5" />
            Ingest Questions
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-muted-foreground flex items-center justify-between font-mono text-sm tabular-nums">
            <span>
              Showing {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, totalCount)} of{' '}
              {totalCount}
            </span>
            <span>
              Page {page} of {totalPages}
            </span>
          </div>

          <div className="space-y-3">
            {questions.map((q, idx) => {
              const questionGlobalNum = (page - 1) * pageSize + idx + 1;
              return (
                <div
                  key={q.id}
                  onClick={() => setModalIndex(idx)}
                  onContextMenu={(e) => handleQuestionContextMenu(e, q, idx)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setModalIndex(idx);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Question ${questionGlobalNum} in ${q.subject}. Click to view solution.`}
                  className="card focus-visible:outline-primary cursor-pointer space-y-3 p-4 transition-all duration-150 focus-visible:outline-2"
                >
                  <div className="border-border/40 flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="bg-secondary/80 text-foreground border-border/60 inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[11px] font-medium">
                        {q.subject}
                      </span>
                      {q.topic && (
                        <span className="text-muted-foreground bg-secondary/40 border-border/40 inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[11px]">
                          {q.topic}
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[11px] font-medium capitalize ${
                          q.difficulty === 'easy'
                            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : q.difficulty === 'medium'
                              ? 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              : 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400'
                        }`}
                      >
                        {q.difficulty}
                      </span>
                    </div>

                    <div className="text-muted-foreground flex items-center gap-2 font-mono text-xs tabular-nums">
                      <span>
                        +{q.marks || 1} mark{q.marks !== 1 ? 's' : ''}
                      </span>
                      <span className="text-foreground font-bold">Q{questionGlobalNum}</span>
                    </div>
                  </div>

                  {/* Question Prompt Snippet - Fully responsive with zero text clipping */}
                  <div className="selectable-content text-foreground overflow-visible text-[13px] leading-relaxed font-normal wrap-break-word">
                    <MathRenderer content={q.body} />
                  </div>

                  {/* Tags */}
                  {q.tags && q.tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {q.tags.map((t) => (
                        <span
                          key={t}
                          className="text-muted-foreground bg-secondary/50 border-border/50 rounded-full border px-2 py-0.5 font-mono text-[11px]"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Card Action Hint */}
                  <div className="border-border/40 flex items-center justify-between border-t pt-2.5 text-xs">
                    <span className="text-muted-foreground text-[11px]">
                      Click to review question & explanation
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setModalIndex(idx);
                      }}
                      className="text-primary flex cursor-pointer items-center gap-1 text-xs font-semibold transition-colors hover:underline"
                    >
                      <span>View Solution</span>
                      <ChevronRight className="size-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Interactive Question Detail Modal with Arrow Keys Navigation */}
          <QuestionDetailModal
            isOpen={modalIndex !== null}
            onClose={() => setModalIndex(null)}
            questions={questions}
            currentIndex={modalIndex ?? 0}
            onNavigateIndex={(newIdx) => setModalIndex(newIdx)}
            titlePrefix="Q"
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn btn-outline border-border/70 hover:bg-muted text-foreground btn-sm h-7 px-2.5 text-xs font-medium active:scale-95"
              >
                <ChevronLeft className="size-3.5" />
                Previous
              </button>
              <span className="text-muted-foreground px-2 font-mono text-xs tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn btn-outline border-border/70 hover:bg-muted text-foreground btn-sm h-7 px-2.5 text-xs font-medium active:scale-95"
              >
                Next
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
      {/* Native macOS Contextual Menu Portal */}
      <MacContextMenuPortal state={contextMenuState} onClose={closeContextMenu} />
    </div>
  );
}
