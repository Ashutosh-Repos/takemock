import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertCircle,
  Bookmark,
  CheckCircle2,
  ChevronRight,
  Play,
  Zap,
} from 'lucide-react';
import { MathRenderer } from '@/components/shared/MathRenderer';
import { QuestionDetailModal } from '@/components/shared/QuestionDetailModal';
import { assessmentRepository } from '@/core/storage/repository';
import type { QuestionModel } from '@/types/question';

export function MistakeVault() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<'UNRESOLVED' | 'TIME_SINKS' | 'BOOKMARKED'>('UNRESOLVED');
  const [modalIndex, setModalIndex] = useState<number | null>(null);

  const [data, setData] = useState<{
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

  const loadMistakes = async () => {
    setLoading(true);
    try {
      const res = await assessmentRepository.getMistakeAnalytics();
      setData(res);
    } catch (err) {
      console.error('Failed to load mistakes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMistakes();
  }, []);

  // Launch 1-Click Mistake Drill
  const handleLaunchMistakeDrill = async (maxCount = 10) => {
    try {
      const attempt = await assessmentRepository.generateMistakeDrill(maxCount);
      navigate(`/runner/${attempt.id}`);
    } catch (err: any) {
      alert(err.message || 'No mistakes available to practice.');
    }
  };

  const currentQuestions =
    activeCategory === 'UNRESOLVED'
      ? data.unresolvedQuestions
      : activeCategory === 'TIME_SINKS'
      ? data.timeSinkQuestions
      : data.bookmarkedQuestions;

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 pb-36 md:p-6">
      {/* Header */}
      <div className="border-border flex flex-col justify-between gap-3 border-b pb-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-lg font-bold tracking-tight md:text-xl text-foreground">Mistakes</h1>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {data.unresolvedQuestions.length} question{data.unresolvedQuestions.length !== 1 ? 's' : ''} to review and master.
          </p>
        </div>

        {/* Mistake Drill Launcher */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleLaunchMistakeDrill(10)}
            disabled={data.unresolvedQuestions.length === 0}
            className="btn btn-primary btn-sm font-medium shadow-xs gap-1.5 rounded-md active:scale-95"
          >
            <Play className="size-3.5 fill-current" />
            Practice Drill ({Math.min(10, data.unresolvedQuestions.length)})
          </button>
        </div>
      </div>

      {/* Metric Category Cards */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveCategory('UNRESOLVED')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveCategory('UNRESOLVED');
            }
          }}
          aria-pressed={activeCategory === 'UNRESOLVED'}
          className={`liquid-glass-rose flex cursor-pointer flex-col justify-between rounded-xl p-3.5 shadow-xs transition-all duration-150 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none ${
            activeCategory === 'UNRESOLVED' ? 'ring-2 ring-rose-500 border-rose-500/80 shadow-md' : 'hover:border-rose-400/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">Incorrect</span>
            <AlertCircle className="size-3.5 text-rose-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400 tracking-tight">{data.unresolvedQuestions.length}</span>
            <span className="text-muted-foreground text-[11px]">unresolved</span>
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveCategory('TIME_SINKS')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveCategory('TIME_SINKS');
            }
          }}
          aria-pressed={activeCategory === 'TIME_SINKS'}
          className={`liquid-glass-amber flex cursor-pointer flex-col justify-between rounded-xl p-3.5 shadow-xs transition-all duration-150 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:outline-none ${
            activeCategory === 'TIME_SINKS' ? 'ring-2 ring-amber-500 border-amber-500/80 shadow-md' : 'hover:border-amber-400/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">Time Sinks</span>
            <span className="text-[10px] text-amber-500 font-mono font-semibold">&gt;2.5m</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 tracking-tight">{data.timeSinkQuestions.length}</span>
            <span className="text-muted-foreground text-[11px]">slow responses</span>
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveCategory('BOOKMARKED')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveCategory('BOOKMARKED');
            }
          }}
          aria-pressed={activeCategory === 'BOOKMARKED'}
          className={`liquid-glass-blue flex cursor-pointer flex-col justify-between rounded-xl p-3.5 shadow-xs transition-all duration-150 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none ${
            activeCategory === 'BOOKMARKED' ? 'ring-2 ring-primary border-primary/80 shadow-md' : 'hover:border-blue-400/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">Bookmarked</span>
            <Bookmark className="size-3.5 text-primary" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-primary tracking-tight">{data.bookmarkedQuestions.length}</span>
            <span className="text-muted-foreground text-[11px]">saved questions</span>
          </div>
        </div>
      </div>

      {/* Question Ledger */}
      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <span className="loading loading-spinner text-primary loading-sm" />
        </div>
      ) : currentQuestions.length === 0 ? (
        <div className="liquid-glass-card flex flex-col items-center justify-center rounded-xl p-10 text-center shadow-xs">
          <CheckCircle2 className="text-emerald-500 size-10" />
          <h3 className="mt-3 text-sm font-semibold text-foreground">No Questions in This Category</h3>
          <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-xs">
            {activeCategory === 'UNRESOLVED'
              ? 'Great job! You have resolved all recorded mistakes.'
              : activeCategory === 'TIME_SINKS'
              ? 'No questions exceeded your 2.5-minute time threshold with incorrect answers.'
              : 'You have no questions bookmarked for review.'}
          </p>
          <button onClick={() => navigate('/')} className="btn btn-primary btn-sm mt-4 gap-1.5 shadow-xs rounded-lg active:scale-95">
            <Play className="size-3" />
            Explore Papers
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Showing {currentQuestions.length} question(s)</span>
            <button
              onClick={() => handleLaunchMistakeDrill(currentQuestions.length)}
              className="liquid-glass-pill btn btn-sm h-7 text-xs gap-1 rounded-lg hover:border-primary/40"
            >
              <Zap className="size-3" />
              Practice All {currentQuestions.length}
            </button>
          </div>

          <div className="space-y-2.5">
            {currentQuestions.map((q, idx) => (
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
                aria-label={`Error #${idx + 1} in ${q.subject}. Click to view problem and solution.`}
                className="liquid-glass-rose hover:scale-[1.008] cursor-pointer rounded-xl p-4 shadow-xs transition-all duration-150 active:scale-[0.99] space-y-2.5 group focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-border/60 pb-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="badge badge-error badge-xs font-semibold">
                      Error #{idx + 1}
                    </span>
                    <span className="badge badge-neutral text-[11px] font-semibold">{q.subject}</span>
                    {q.topic && <span className="badge badge-outline text-[11px]">{q.topic}</span>}
                    <span className="badge badge-ghost text-[10px] font-mono uppercase text-muted-foreground">
                      {q.type.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
                    <span>+{q.marks || 1} mark{q.marks !== 1 ? 's' : ''}</span>
                  </div>
                </div>

                {/* Question Prompt Snippet */}
                <div className="text-xs leading-relaxed line-clamp-2 md:line-clamp-3 selectable-content text-foreground/90">
                  <MathRenderer content={q.body} />
                </div>

                {/* Card Action Hint */}
                <div className="flex items-center justify-between border-t border-border/50 pt-2 text-xs">
                  <span className="text-muted-foreground text-[11px] group-hover:text-foreground transition-colors">
                    Click to review problem & solution
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setModalIndex(idx);
                    }}
                    className="btn btn-ghost btn-xs text-primary gap-1 font-medium group-hover:bg-primary/10 active:scale-95"
                  >
                    View Answer & Explanation
                    <ChevronRight className="size-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interactive Question Detail Modal with Keyboard Arrow Navigation */}
      <QuestionDetailModal
        isOpen={modalIndex !== null}
        onClose={() => setModalIndex(null)}
        questions={currentQuestions}
        currentIndex={modalIndex ?? 0}
        onNavigateIndex={(newIdx) => setModalIndex(newIdx)}
        titlePrefix="Error #"
      />
    </div>
  );
}
