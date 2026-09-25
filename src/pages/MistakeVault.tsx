import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Bookmark,
  CheckCircle2,
  ChevronRight,
  Play,
  Target,
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
    <div className="mx-auto max-w-7xl space-y-6 p-4 pb-36 md:p-8">
      {/* Header */}
      <div className="border-base-300 flex flex-col justify-between gap-4 border-b pb-5 md:flex-row md:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">Mistakes</h1>
          <p className="text-base-content/50 mt-0.5 text-xs">
            {data.unresolvedQuestions.length} question{data.unresolvedQuestions.length !== 1 ? 's' : ''} to review and master.
          </p>
        </div>

        {/* Mistake Drill Launcher */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleLaunchMistakeDrill(10)}
            disabled={data.unresolvedQuestions.length === 0}
            className="btn btn-error btn-sm font-bold text-error-content shadow-sm gap-1.5"
          >
            <Play className="size-3.5 fill-current" />
            Practise ({Math.min(10, data.unresolvedQuestions.length)})
          </button>
        </div>
      </div>

      {/* Metric Category Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div
          onClick={() => setActiveCategory('UNRESOLVED')}
          className={`bg-card border-border/80 flex cursor-pointer flex-col justify-between rounded-xl border p-4 shadow-2xs transition-all ${
            activeCategory === 'UNRESOLVED' ? 'ring-2 ring-error/70 border-error/50 bg-error/5' : 'hover:bg-base-200/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-base-content/60 text-xs font-semibold">Incorrect</span>
            <Target className="size-3.5 text-error" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-error">{data.unresolvedQuestions.length}</span>
            <span className="text-base-content/50 text-[11px]">unresolved</span>
          </div>
        </div>

        <div
          onClick={() => setActiveCategory('TIME_SINKS')}
          className={`bg-card border-border/80 flex cursor-pointer flex-col justify-between rounded-xl border p-4 shadow-2xs transition-all ${
            activeCategory === 'TIME_SINKS' ? 'ring-2 ring-warning/70 border-warning/50 bg-warning/5' : 'hover:bg-base-200/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-base-content/60 text-xs font-semibold">Time Sinks</span>
            <span className="text-[10px] text-warning font-mono">&gt;2.5m</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-warning">{data.timeSinkQuestions.length}</span>
            <span className="text-base-content/50 text-[11px]">slow responses</span>
          </div>
        </div>

        <div
          onClick={() => setActiveCategory('BOOKMARKED')}
          className={`bg-card border-border/80 flex cursor-pointer flex-col justify-between rounded-xl border p-4 shadow-2xs transition-all ${
            activeCategory === 'BOOKMARKED' ? 'ring-2 ring-primary/70 border-primary/50 bg-primary/5' : 'hover:bg-base-200/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-base-content/60 text-xs font-semibold">Bookmarked</span>
            <Bookmark className="size-3.5 text-primary" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-primary">{data.bookmarkedQuestions.length}</span>
            <span className="text-base-content/50 text-[11px]">saved questions</span>
          </div>
        </div>
      </div>

      {/* Question Ledger */}
      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <span className="loading loading-spinner text-primary loading-md" />
        </div>
      ) : currentQuestions.length === 0 ? (
        <div className="border-border/60 bg-card flex flex-col items-center justify-center rounded-2xl border p-12 text-center shadow-xs">
          <CheckCircle2 className="text-success size-12" />
          <h3 className="mt-3 text-base font-bold">No Questions in This Category</h3>
          <p className="text-base-content/60 mx-auto mt-1 max-w-sm text-xs">
            {activeCategory === 'UNRESOLVED'
              ? 'Outstanding work! You have resolved all recorded mistakes.'
              : activeCategory === 'TIME_SINKS'
              ? 'No questions exceeded your 2.5-minute time threshold with incorrect answers.'
              : 'You have no questions bookmarked for review.'}
          </p>
          <button onClick={() => navigate('/')} className="btn btn-primary btn-sm mt-4 gap-1.5 shadow-sm">
            <Play className="size-3.5" />
            Explore Papers
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-base-content/60">
            <span>Showing {currentQuestions.length} question(s)</span>
            <button
              onClick={() => handleLaunchMistakeDrill(currentQuestions.length)}
              className="btn btn-outline btn-xs gap-1"
            >
              <Zap className="size-3" />
              Practice All {currentQuestions.length}
            </button>
          </div>

          <div className="space-y-3">
            {currentQuestions.map((q, idx) => (
              <div
                key={q.id}
                onClick={() => setModalIndex(idx)}
                className="bg-card border-border/80 hover:border-primary/50 cursor-pointer rounded-2xl border p-5 shadow-xs transition-all space-y-3 group"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="badge badge-error badge-sm font-bold text-error-content">
                      Error #{idx + 1}
                    </span>
                    <span className="badge badge-neutral text-xs font-bold">{q.subject}</span>
                    {q.topic && <span className="badge badge-outline text-xs">{q.topic}</span>}
                    <span className="badge badge-ghost text-[10px] font-mono uppercase text-base-content/60">
                      {q.type.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-mono text-base-content/60">
                    <span>+{q.marks || 1} mark{q.marks !== 1 ? 's' : ''}</span>
                  </div>
                </div>

                {/* Question Prompt Snippet */}
                <div className="text-sm leading-relaxed line-clamp-3">
                  <MathRenderer content={q.body} />
                </div>

                {/* Card Action Hint */}
                <div className="flex items-center justify-between border-t border-border/40 pt-3 text-xs">
                  <span className="text-base-content/40 text-[11px] group-hover:text-base-content/70 transition-colors">
                    Click to review problem & solution
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
