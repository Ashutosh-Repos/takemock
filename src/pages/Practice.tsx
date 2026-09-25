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
        title: `Practice: ${selectedSubject !== 'ALL' ? selectedSubject : 'Mixed'} (${selectedSubset.length} Qs)`,
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
    <div className="mx-auto max-w-7xl space-y-6 p-4 pb-36 md:p-8">
      {/* Header */}
      <div className="border-base-300 flex flex-col justify-between gap-4 border-b pb-5 md:flex-row md:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">Practice</h1>
          <p className="text-base-content/50 mt-0.5 text-xs">
            {totalCount} question{totalCount !== 1 ? 's' : ''} in your bank — filter and start a drill.
          </p>
        </div>

        {/* 1-Click Instant Drill Launch Card */}
        <div className="bg-card border-border/80 flex flex-wrap items-center gap-3 rounded-2xl border p-2.5 shadow-xs">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <span className="text-base-content/60">Count:</span>
            <select
              value={drillCount}
              onChange={(e) => setDrillCount(Number(e.target.value))}
              className="select select-bordered select-xs"
            >
              <option value={5}>5 Qs</option>
              <option value={10}>10 Qs</option>
              <option value={20}>20 Qs</option>
              <option value={30}>30 Qs</option>
            </select>
          </div>

          <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
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
            className="btn btn-primary btn-sm font-bold shadow-md gap-1.5"
          >
            {launchingDrill ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <Zap className="size-3.5 fill-current" />
            )}
            Launch Drill ({Math.min(drillCount, totalCount)})
          </button>
        </div>
      </div>

      {/* Adaptive Facets Filtering Bar */}
      <div className="bg-card border-border/80 space-y-4 rounded-2xl border p-4 shadow-xs">
        {/* Row 1: Search & Dropdowns */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="text-base-content/40 absolute top-2.5 left-3 size-4" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search question text or tags..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input input-bordered input-sm pl-9 w-full text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Difficulty */}
            <div className="join">
              {(['ALL', 'easy', 'medium', 'hard'] as const).map((diff) => (
                <button
                  key={diff}
                  onClick={() => setSelectedDifficulty(diff)}
                  className={`btn btn-xs join-item capitalize ${
                    selectedDifficulty === diff ? 'btn-primary' : 'btn-ghost border-border/60'
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
              className="select select-bordered select-xs"
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
                className="btn btn-ghost btn-xs text-base-content/60 hover:text-error gap-1"
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
            <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/50 mr-1">
              Subjects:
            </span>
            <button
              onClick={() => {
                setSelectedSubject('ALL');
                setSelectedTopic('ALL');
              }}
              className={`badge badge-sm cursor-pointer transition-all ${
                selectedSubject === 'ALL'
                  ? 'badge-primary text-primary-content font-bold'
                  : 'badge-outline hover:bg-base-200'
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
                className={`badge badge-sm cursor-pointer transition-all ${
                  selectedSubject === s
                    ? 'badge-primary text-primary-content font-bold'
                    : 'badge-outline hover:bg-base-200'
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
            <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/50 mr-1">
              Topics ({selectedSubject}):
            </span>
            <button
              onClick={() => setSelectedTopic('ALL')}
              className={`badge badge-sm cursor-pointer transition-all ${
                selectedTopic === 'ALL'
                  ? 'badge-secondary text-secondary-content font-bold'
                  : 'badge-outline hover:bg-base-200'
              }`}
            >
              All Topics
            </button>
            {topics.map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTopic(t)}
                className={`badge badge-sm cursor-pointer transition-all ${
                  selectedTopic === t
                    ? 'badge-secondary text-secondary-content font-bold'
                    : 'badge-outline hover:bg-base-200'
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
            <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/50 mr-1">
              Tags:
            </span>
            {(showAllTags ? tags : tags.slice(0, 10)).map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTag(selectedTag === t ? 'ALL' : t)}
                className={`badge badge-xs cursor-pointer transition-all ${
                  selectedTag === t ? 'badge-accent font-bold' : 'badge-ghost hover:bg-base-200'
                }`}
              >
                #{t}
              </button>
            ))}
            {tags.length > 10 && (
              <button
                onClick={() => setShowAllTags(!showAllTags)}
                className="text-[11px] text-primary hover:underline ml-1"
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
        <div className="border-border/60 bg-card flex flex-col items-center justify-center rounded-2xl border p-12 text-center shadow-xs">
          <Compass className="text-base-content/30 size-12" />
          <h3 className="mt-3 text-base font-bold">No Questions Match Filters</h3>
          <p className="text-base-content/60 mx-auto mt-1 max-w-sm text-xs">
            Try resetting your subject, topic, or search filters, or ingest new questions in the Builder.
          </p>
          <button
            onClick={() => navigate('/builder')}
            className="btn btn-primary btn-sm mt-4 gap-1.5 shadow-sm"
          >
            <Zap className="size-3.5" />
            Ingest Questions
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-base-content/60">
            <span>
              Showing {(page - 1) * pageSize + 1} - {Math.min(page * pageSize, totalCount)} of {totalCount} questions
            </span>
            <span className="font-mono">Page {page} of {totalPages}</span>
          </div>

          <div className="space-y-3">
            {questions.map((q, idx) => {
              const questionGlobalNum = (page - 1) * pageSize + idx + 1;
              return (
                <div
                  key={q.id}
                  onClick={() => setModalIndex(idx)}
                  className="bg-card border-border/80 hover:border-primary/50 cursor-pointer rounded-2xl border p-5 shadow-xs transition-all space-y-3 group"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="badge badge-neutral text-xs font-bold">{q.subject}</span>
                      {q.topic && <span className="badge badge-outline text-xs">{q.topic}</span>}
                      <span
                        className={`badge badge-xs capitalize font-semibold ${
                          q.difficulty === 'easy'
                            ? 'badge-success text-success-content'
                            : q.difficulty === 'medium'
                            ? 'badge-warning text-warning-content'
                            : 'badge-error text-error-content'
                        }`}
                      >
                        {q.difficulty}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono text-base-content/60">
                      <span>+{q.marks || 1} mark{q.marks !== 1 ? 's' : ''}</span>
                      <span className="font-bold">Q{questionGlobalNum}</span>
                    </div>
                  </div>

                  {/* Question Prompt Snippet */}
                  <div className="text-sm leading-relaxed line-clamp-3">
                    <MathRenderer content={q.body} />
                  </div>

                  {/* Tags */}
                  {q.tags && q.tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 pt-1">
                      {q.tags.map((t) => (
                        <span key={t} className="badge badge-ghost badge-xs text-base-content/60">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Card Action Hint */}
                  <div className="flex items-center justify-between border-t border-border/40 pt-3 text-xs">
                    <span className="text-base-content/40 text-[11px] group-hover:text-base-content/70 transition-colors">
                      Click to review question & solution
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setModalIndex(idx);
                      }}
                      className="btn btn-ghost btn-xs text-primary gap-1 font-semibold group-hover:bg-primary/10"
                    >
                      View Answer & Explanation
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
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn btn-outline btn-sm"
              >
                <ChevronLeft className="size-4" />
                Previous
              </button>
              <span className="text-xs font-semibold px-3">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn btn-outline btn-sm"
              >
                Next
                <ChevronRight className="size-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
