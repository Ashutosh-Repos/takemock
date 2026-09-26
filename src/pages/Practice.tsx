import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  ChevronLeft,
  ChevronRight,
  Compass,
  RotateCcw,
  Search,
  Zap,
} from 'lucide-react';
import { MathRenderer } from '@/components/shared/MathRenderer';
import { QuestionDetailModal } from '@/components/shared/QuestionDetailModal';
import { assessmentRepository } from '@/core/storage/repository';
import type { QuestionModel } from '@/types/question';
import type { TestDefinition } from '@/types/test';

export function Practice() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

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
    [page, pageSize, selectedSubject, selectedTopic, selectedDifficulty, selectedType, selectedTag, search]
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
  }, [selectedSubject, selectedTopic, selectedDifficulty, selectedType, selectedTag, search]);

  // Launch Drill
  const handleLaunchDrill = async () => {
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
        alert('No questions match your current filters.');
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
          totalDurationSeconds: drillTimed ? selectedSubset.length * 120 : 0,
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
      alert(`Could not launch drill: ${err.message || 'Unknown error'}`);
    } finally {
      setLaunchingDrill(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 pb-24 md:px-6">
      {/* Header */}
      <div className="border-border/60 flex flex-col justify-between gap-3 border-b pb-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl text-foreground">Drills</h1>
          <p className="text-muted-foreground mt-0.5 text-xs font-mono tabular-nums">
            {totalCount} question{totalCount !== 1 ? 's' : ''} available across topics
          </p>
        </div>

        {/* 1-Click Instant Drill Launch Card */}
        <div className="liquid-glass-card flex flex-wrap items-center gap-2.5 rounded-xl p-2 px-3 shadow-xs">
          <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <span>Count:</span>
            <select
              value={drillCount}
              onChange={(e) => setDrillCount(Number(e.target.value))}
              className="h-7 text-xs rounded-lg liquid-glass-pill px-2 font-mono text-foreground"
            >
              <option value={5}>5 Qs</option>
              <option value={10}>10 Qs</option>
              <option value={20}>20 Qs</option>
              <option value={30}>30 Qs</option>
            </select>
          </div>

          <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer text-foreground/80">
            <input
              type="checkbox"
              checked={drillTimed}
              onChange={(e) => setDrillTimed(e.target.checked)}
              className="checkbox checkbox-xs checkbox-primary"
            />
            <span>Timed (2m/Q)</span>
          </label>

          <button
            onClick={handleLaunchDrill}
            disabled={totalCount === 0 || launchingDrill}
            className="btn btn-primary btn-sm h-7 px-3 text-xs font-medium shadow-xs gap-1.5 rounded-lg active:scale-95"
          >
            {launchingDrill ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <Zap className="size-3 fill-current" />
            )}
            Launch Drill ({Math.min(drillCount, totalCount)})
          </button>
        </div>
      </div>

      {/* Adaptive Facets Filtering Bar */}
      <div className="liquid-glass-card space-y-3 rounded-xl p-3.5 shadow-xs">
        {/* Row 1: Search & Dropdowns */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="text-muted-foreground/60 absolute top-2.5 left-2.5 size-3.5" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search question text or tags..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 pr-3 w-full text-xs rounded-lg liquid-glass-input placeholder:text-muted-foreground/50 focus:outline-primary"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Difficulty Segmented Control */}
            <div className="liquid-glass-pill p-0.5 rounded-lg flex items-center">
              {(['ALL', 'easy', 'medium', 'hard'] as const).map((diff) => (
                <button
                  key={diff}
                  onClick={() => setSelectedDifficulty(diff)}
                  className={`px-2 py-0.5 text-xs rounded-md transition-all capitalize font-medium ${
                    selectedDifficulty === diff
                      ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {diff}
                </button>
              ))}
            </div>

            {/* Question Type */}
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="h-7 text-xs rounded border border-border/70 bg-background px-2 text-foreground"
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
                className="btn btn-ghost btn-xs h-7 text-xs text-muted-foreground hover:text-red-500 gap-1"
              >
                <RotateCcw className="size-3" />
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Subjects Chips */}
        {subjects.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/40">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mr-1">
              Subjects:
            </span>
            <button
              onClick={() => {
                setSelectedSubject('ALL');
                setSelectedTopic('ALL');
              }}
              className={`text-xs px-2 py-0.5 rounded transition-colors cursor-pointer ${
                selectedSubject === 'ALL'
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60'
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
                className={`text-xs px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  selectedSubject === s
                    ? 'bg-primary text-primary-foreground font-medium'
                    : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Row 3: Topics Chips (for active subject) */}
        {topics.length > 0 && selectedSubject !== 'ALL' && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/40">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mr-1">
              Topics ({selectedSubject}):
            </span>
            <button
              onClick={() => setSelectedTopic('ALL')}
              className={`text-xs px-2 py-0.5 rounded transition-colors cursor-pointer ${
                selectedTopic === 'ALL'
                  ? 'bg-secondary text-secondary-foreground font-medium'
                  : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60'
              }`}
            >
              All Topics
            </button>
            {topics.map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTopic(t)}
                className={`text-xs px-2 py-0.5 rounded transition-colors cursor-pointer ${
                  selectedTopic === t
                    ? 'bg-secondary text-secondary-foreground font-medium'
                    : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {/* Row 4: Tags Chips */}
        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/40">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mr-1">
              Tags:
            </span>
            {(showAllTags ? tags : tags.slice(0, 10)).map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTag(selectedTag === t ? 'ALL' : t)}
                className={`text-[11px] font-mono px-1.5 py-0.2 rounded transition-colors cursor-pointer ${
                  selectedTag === t
                    ? 'bg-primary/10 text-primary border border-primary/30 font-medium'
                    : 'bg-muted/30 hover:bg-muted text-muted-foreground border border-border/50'
                }`}
              >
                #{t}
              </button>
            ))}
            {tags.length > 10 && (
              <button
                onClick={() => setShowAllTags(!showAllTags)}
                className="text-[11px] text-primary hover:underline ml-1 font-mono"
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
          <h3 className="mt-3 text-sm font-semibold text-foreground">No Questions Match Filters</h3>
          <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-xs">
            Reset filter selections or import new questions in the Builder.
          </p>
          <button
            onClick={() => navigate('/builder')}
            className="btn btn-primary btn-sm h-8 px-3 text-xs font-medium mt-4 gap-1.5 shadow-xs"
          >
            <Zap className="size-3.5" />
            Ingest Questions
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-mono tabular-nums">
            <span>
              Showing {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, totalCount)} of {totalCount}
            </span>
            <span>Page {page} of {totalPages}</span>
          </div>

          <div className="space-y-2.5">
            {questions.map((q, idx) => {
              const questionGlobalNum = (page - 1) * pageSize + idx + 1;
              return (
                <div
                  key={q.id}
                  onClick={() => setModalIndex(idx)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setModalIndex(idx);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Question ${questionGlobalNum} in ${q.subject}. Click to view solution.`}
                  className="liquid-glass-card hover:scale-[1.008] cursor-pointer rounded-xl p-3.5 space-y-2.5 group focus-visible:outline-2 focus-visible:outline-primary transition-all"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 text-foreground">
                        {q.subject}
                      </span>
                      {q.topic && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground">
                          {q.topic}
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-mono capitalize px-1.5 py-0.5 rounded border font-medium ${
                          q.difficulty === 'easy'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : q.difficulty === 'medium'
                            ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
                        }`}
                      >
                        {q.difficulty}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground tabular-nums">
                      <span>+{q.marks || 1} mark{q.marks !== 1 ? 's' : ''}</span>
                      <span className="font-semibold text-foreground">Q{questionGlobalNum}</span>
                    </div>
                  </div>

                  {/* Question Prompt Snippet */}
                  <div className="text-sm leading-relaxed line-clamp-3 selectable-content text-foreground/90">
                    <MathRenderer content={q.body} />
                  </div>

                  {/* Tags */}
                  {q.tags && q.tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      {q.tags.map((t) => (
                        <span key={t} className="text-[10px] font-mono text-muted-foreground/75 px-1 rounded bg-muted/40">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Card Action Hint */}
                  <div className="flex items-center justify-between border-t border-border/40 pt-2 text-xs">
                    <span className="text-muted-foreground/50 text-[11px] group-hover:text-muted-foreground transition-colors">
                      Click to review question & solution
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setModalIndex(idx);
                      }}
                      className="text-primary hover:underline text-xs font-medium flex items-center gap-1"
                    >
                      View Solution
                      <ChevronRight className="size-3" />
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
              <span className="text-xs font-mono tabular-nums px-2 text-muted-foreground">
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
    </div>
  );
}
