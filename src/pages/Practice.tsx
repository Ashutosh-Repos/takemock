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
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { SegmentedControl } from '@/components/ui/segmented-control';
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

  // Dynamic drill max based on available questions (must be > min=5)
  const maxDrillQuestions = Math.max(10, Math.min(totalCount || 50, 50));
  const timePerQuestion = 2; // minutes per question
  const totalDrillMinutes = drillCount * timePerQuestion;

  // Auto-clamp drill count when filters reduce available pool
  useEffect(() => {
    if (totalCount > 0 && drillCount > maxDrillQuestions) {
      setDrillCount(Math.max(5, maxDrillQuestions));
    }
  }, [totalCount, maxDrillQuestions]);

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 pb-24 md:px-6">
      {/* Header */}
      <div className="border-border/60 flex flex-col justify-between gap-4 border-b pb-5 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Drills</h1>
          <p className="text-muted-foreground mt-1 text-sm font-mono tabular-nums">
            {totalCount} question{totalCount !== 1 ? 's' : ''} available across topics
          </p>
        </div>

        {/* 1-Click Instant Drill Launch Card (macOS Control Center Widget) */}
        <div className="card flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-tight text-foreground/90 whitespace-nowrap">
                Questions:
              </span>
              <span className="px-2.5 py-0.5 rounded-full font-mono text-xs font-bold bg-primary/20 text-primary border border-primary/30 tabular-nums">
                {drillCount} Qs
              </span>
            </div>
            <div className="w-48 sm:w-56">
              <Slider
                value={drillCount}
                min={5}
                max={maxDrillQuestions}
                step={5}
                variant="capsule"
                tickMarks={Math.min(Math.floor(maxDrillQuestions / 5), 10)}
                showValueTooltip
                formatValue={(val) => `${val} Questions`}
                onValueChange={setDrillCount}
              />
            </div>
          </div>

          <div className="hidden sm:block h-6 w-px bg-white/10" />

          <div className="flex items-center gap-4">
            <Switch
              checked={drillTimed}
              onCheckedChange={setDrillTimed}
              label={drillTimed ? `Timed (${totalDrillMinutes}m)` : 'Untimed'}
              variant="accent"
            />

            <button
              onClick={handleLaunchDrill}
              disabled={totalCount === 0 || launchingDrill}
              className="h-10 px-5 text-sm font-semibold rounded-xl inline-flex items-center justify-center gap-2 bg-[#007AFF] hover:bg-[#0071E3] text-white shadow-[0_4px_16px_rgba(0,122,255,0.45)] border border-[#3897FF]/30 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {launchingDrill ? (
                <span className="loading-spinner" />
              ) : (
                <Zap className="size-4 fill-current" />
              )}
              <span>Launch Drill ({Math.min(drillCount, totalCount)})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Adaptive Facets Filtering Bar */}
      <div className="card space-y-3.5 p-4 sm:p-5">
        {/* Row 1: Search & Dropdowns */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="text-muted-foreground/60 absolute top-2.5 left-3 size-4 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="search"
              placeholder="Search question text or tags..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9 pr-3.5 w-full text-sm rounded-xl bg-black/20 dark:bg-black/30 border border-white/10 backdrop-blur-md text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Difficulty Segmented Control */}
            <SegmentedControl
              value={selectedDifficulty}
              onValueChange={(val) => setSelectedDifficulty(val as any)}
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
              className="h-9 text-sm rounded-xl border border-white/10 bg-black/20 dark:bg-black/30 backdrop-blur-md px-3 text-foreground focus:outline-none focus:border-primary/60"
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
                className="h-9 px-3 text-xs font-medium rounded-xl text-muted-foreground hover:text-red-400 bg-white/[0.04] hover:bg-red-500/10 border border-white/10 flex items-center gap-1.5 transition-all"
              >
                <RotateCcw className="size-3.5" />
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Subjects Chips */}
        {subjects.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground mr-1">
              Subjects:
            </span>
            <button
              onClick={() => {
                setSelectedSubject('ALL');
                setSelectedTopic('ALL');
              }}
              className={`text-xs px-3.5 py-1 rounded-full transition-all cursor-pointer font-medium ${
                selectedSubject === 'ALL'
                  ? 'bg-[#007AFF] text-white shadow-[0_2px_8px_rgba(0,122,255,0.4)] border border-[#0A84FF]'
                  : 'bg-white/[0.06] hover:bg-white/[0.12] text-foreground/80 hover:text-foreground border border-white/10'
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
                className={`text-xs px-3.5 py-1 rounded-full transition-all cursor-pointer font-medium ${
                  selectedSubject === s
                    ? 'bg-[#007AFF] text-white shadow-[0_2px_8px_rgba(0,122,255,0.4)] border border-[#0A84FF]'
                    : 'bg-white/[0.06] hover:bg-white/[0.12] text-foreground/80 hover:text-foreground border border-white/10'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Row 3: Topics Chips (for active subject) */}
        {topics.length > 0 && selectedSubject !== 'ALL' && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground mr-1">
              Topics ({selectedSubject}):
            </span>
            <button
              onClick={() => setSelectedTopic('ALL')}
              className={`text-xs px-3.5 py-1 rounded-full transition-all cursor-pointer font-medium ${
                selectedTopic === 'ALL'
                  ? 'bg-white/20 text-white border border-white/30 shadow-xs'
                  : 'bg-white/[0.06] hover:bg-white/[0.12] text-foreground/80 hover:text-foreground border border-white/10'
              }`}
            >
              All Topics
            </button>
            {topics.map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTopic(t)}
                className={`text-xs px-3.5 py-1 rounded-full transition-all cursor-pointer font-medium ${
                  selectedTopic === t
                    ? 'bg-white/20 text-white border border-white/30 shadow-xs'
                    : 'bg-white/[0.06] hover:bg-white/[0.12] text-foreground/80 hover:text-foreground border border-white/10'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {/* Row 4: Tags Chips */}
        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10">
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground mr-1">
              Tags:
            </span>
            {(showAllTags ? tags : tags.slice(0, 10)).map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTag(selectedTag === t ? 'ALL' : t)}
                className={`text-xs font-mono px-2.5 py-0.5 rounded-full transition-all cursor-pointer ${
                  selectedTag === t
                    ? 'bg-primary/20 text-primary border border-primary/40 font-medium'
                    : 'bg-white/[0.05] hover:bg-white/[0.1] text-muted-foreground border border-white/10'
                }`}
              >
                #{t}
              </button>
            ))}
            {tags.length > 10 && (
              <button
                onClick={() => setShowAllTags(!showAllTags)}
                className="text-xs text-primary hover:underline ml-1 font-mono cursor-pointer"
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
          <div className="flex items-center justify-between text-sm text-muted-foreground font-mono tabular-nums">
            <span>
              Showing {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, totalCount)} of {totalCount}
            </span>
            <span>Page {page} of {totalPages}</span>
          </div>

          <div className="space-y-3">
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
                  className="card cursor-pointer p-5 space-y-3.5 focus-visible:outline-2 focus-visible:outline-primary transition-all duration-200"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono font-semibold px-2.5 py-0.5 rounded-full border border-white/12 bg-white/5 text-foreground/90">
                        {q.subject}
                      </span>
                      {q.topic && (
                        <span className="text-xs font-mono px-2.5 py-0.5 rounded-full border border-white/10 text-muted-foreground bg-white/[0.03]">
                          {q.topic}
                        </span>
                      )}
                      <span
                        className={`text-xs font-mono capitalize px-2.5 py-0.5 rounded-full border font-semibold ${
                          q.difficulty === 'easy'
                            ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400 shadow-[0_0_8px_rgba(52,199,89,0.2)]'
                            : q.difficulty === 'medium'
                            ? 'border-amber-500/30 bg-amber-500/15 text-amber-400 shadow-[0_0_8px_rgba(255,159,10,0.2)]'
                            : 'border-red-500/30 bg-red-500/15 text-red-400 shadow-[0_0_8px_rgba(255,69,58,0.2)]'
                        }`}
                      >
                        {q.difficulty}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-sm font-mono text-muted-foreground tabular-nums">
                      <span>+{q.marks || 1} mark{q.marks !== 1 ? 's' : ''}</span>
                      <span className="font-bold text-foreground">Q{questionGlobalNum}</span>
                    </div>
                  </div>

                  {/* Question Prompt Snippet */}
                  <div className="text-[15px] leading-relaxed line-clamp-3 selectable-content text-foreground font-normal">
                    <MathRenderer content={q.body} />
                  </div>

                  {/* Tags */}
                  {q.tags && q.tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {q.tags.map((t) => (
                        <span key={t} className="text-xs font-mono text-muted-foreground px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/10">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Card Action Hint */}
                  <div className="flex items-center justify-between border-t border-white/10 pt-2.5 text-sm">
                    <span className="text-muted-foreground/60 text-xs">
                      Click to review question & solution
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setModalIndex(idx);
                      }}
                      className="text-[#007AFF] hover:text-[#3897FF] hover:underline text-sm font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      View Solution
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
