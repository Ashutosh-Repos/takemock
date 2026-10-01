import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertCircle,
  Bookmark,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Copy,
  Play,
  Zap,
} from 'lucide-react';
import { MathRenderer } from '@/components/shared/MathRenderer';
import { QuestionDetailModal } from '@/components/shared/QuestionDetailModal';
import { assessmentRepository } from '@/core/storage/repository';
import { showNativeAlert, writeToClipboard } from '@/core/native/tauriBridge';
import { MacContextMenuPortal } from '@/components/ui/context-menu';
import { useMacContextMenu } from '@/hooks/useMacContextMenu';
import {
  cleanQuestionBody,
  formatQuestionType,
} from '@/core/engine/questionPresentation';
import type { QuestionModel } from '@/types/question';

export function MistakeVault() {
  const navigate = useNavigate();
  const { contextMenuState, openContextMenu, closeContextMenu } = useMacContextMenu();
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<'UNRESOLVED' | 'TIME_SINKS' | 'BOOKMARKED'>(
    'UNRESOLVED',
  );
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
      await showNativeAlert(err.message || 'No mistakes available to practice.', {
        title: 'Mistake Drill',
        kind: 'info',
      });
    }
  };

  const currentQuestions =
    activeCategory === 'UNRESOLVED'
      ? data.unresolvedQuestions
      : activeCategory === 'TIME_SINKS'
        ? data.timeSinkQuestions
        : data.bookmarkedQuestions;

  const handleQuestionContextMenu = (e: React.MouseEvent, q: QuestionModel, idx: number) => {
    openContextMenu(e, [
      {
        id: 'view-solution',
        label: 'View Problem & Explanation',
        icon: BookOpen,
        shortcut: '↵',
        onClick: () => setModalIndex(idx),
      },
      {
        id: 'practice-category',
        label: 'Launch Drill for Errors',
        icon: Play,
        onClick: () => handleLaunchMistakeDrill(10),
      },
      { type: 'divider' },
      {
        id: 'copy-text',
        label: 'Copy Question Text',
        icon: Copy,
        shortcut: '⌘C',
        onClick: () => {
          writeToClipboard(q.body);
        },
      },
    ]);
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-6 py-5 pb-20 lg:px-8">
      {/* Standard Header */}
      <div className="border-border/60 flex flex-col justify-between gap-3 border-b pb-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-foreground text-xl font-bold tracking-tight">Mistakes</h1>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {data.unresolvedQuestions.length} question
            {data.unresolvedQuestions.length !== 1 ? 's' : ''} to review and master.
          </p>
        </div>

        {/* Mistake Drill Launcher */}
        <div className="flex items-center gap-2">
          <button
            id="mistake-launch-drill-btn"
            onClick={() => handleLaunchMistakeDrill(10)}
            disabled={data.unresolvedQuestions.length === 0}
            className="btn btn-primary btn-sm h-7 gap-1.5 rounded-md px-3 text-xs font-medium shadow-xs active:scale-95"
          >
            <Play className="size-3.5 fill-current" />
            Practice Drill ({Math.min(10, data.unresolvedQuestions.length)})
          </button>
        </div>
      </div>

      {/* Metric Category Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
          className={`card flex cursor-pointer flex-col justify-between p-4 transition-all ${
            activeCategory === 'UNRESOLVED'
              ? 'border-primary ring-primary bg-primary/3 shadow-xs ring-1'
              : 'hover:border-border/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
              Incorrect
            </span>
            <div className="rounded-md bg-rose-500/10 p-1.5 text-rose-600 dark:text-rose-400">
              <AlertCircle className="size-3.5" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tracking-tight text-rose-600 tabular-nums dark:text-rose-400">
              {data.unresolvedQuestions.length}
            </span>
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
          className={`card flex cursor-pointer flex-col justify-between p-4 transition-all ${
            activeCategory === 'TIME_SINKS'
              ? 'border-primary ring-primary bg-primary/3 shadow-xs ring-1'
              : 'hover:border-border/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
              Time Sinks
            </span>
            <div className="rounded-md bg-amber-500/10 p-1.5 text-amber-600 dark:text-amber-400">
              <span className="font-mono text-[10px] font-bold">&gt;2.5m</span>
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tracking-tight text-amber-600 tabular-nums dark:text-amber-400">
              {data.timeSinkQuestions.length}
            </span>
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
          className={`card flex cursor-pointer flex-col justify-between p-4 transition-all ${
            activeCategory === 'BOOKMARKED'
              ? 'border-primary ring-primary bg-primary/3 shadow-xs ring-1'
              : 'hover:border-border/80'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
              Bookmarked
            </span>
            <div className="rounded-md bg-blue-500/10 p-1.5 text-blue-600 dark:text-blue-400">
              <Bookmark className="size-3.5" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-primary font-mono text-2xl font-bold tracking-tight tabular-nums">
              {data.bookmarkedQuestions.length}
            </span>
            <span className="text-muted-foreground text-[11px]">saved questions</span>
          </div>
        </div>
      </div>

      {/* Question Ledger */}
      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <span className="loading-spinner" />
        </div>
      ) : currentQuestions.length === 0 ? (
        <div className="card flex flex-col items-center justify-center p-12 text-center">
          <CheckCircle2 className="mb-2 size-10 text-emerald-500" />
          <h3 className="text-foreground text-sm font-semibold">No Questions in This Category</h3>
          <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-xs">
            {activeCategory === 'UNRESOLVED'
              ? 'Great job! You have resolved all recorded mistakes.'
              : activeCategory === 'TIME_SINKS'
                ? 'No questions exceeded your 2.5-minute time threshold with incorrect answers.'
                : 'You have no questions bookmarked for review.'}
          </p>
          <button
            onClick={() => navigate('/')}
            className="btn btn-primary btn-sm mt-4 gap-1.5 rounded-md"
          >
            <Play className="size-3" />
            <span>Explore Papers</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-muted-foreground flex items-center justify-between font-mono text-xs">
            <span>Showing {currentQuestions.length} question(s)</span>
            <button
              onClick={() => handleLaunchMistakeDrill(currentQuestions.length)}
              className="btn btn-outline btn-xs h-6 gap-1 rounded-full px-2.5 text-[11px] font-medium"
            >
              <Zap className="size-2.5" />
              <span>Practice All ({currentQuestions.length})</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {currentQuestions.map((q, idx) => (
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
                aria-label={`Error #${idx + 1} in ${q.subject}. Click to view problem and solution.`}
                className="card hover:border-border/80 focus-visible:outline-primary cursor-pointer space-y-2.5 p-4 transition-colors focus-visible:outline-2"
              >
                <div className="border-border/40 flex flex-wrap items-center justify-between gap-1.5 border-b pb-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-rose-600 dark:text-rose-400">
                      Error #{idx + 1}
                    </span>
                    <span className="text-foreground/85 border-border/50 inline-flex items-center rounded-full border bg-black/4 px-2 py-0.5 font-mono text-[11px] font-medium dark:bg-white/6">
                      {q.subject}
                    </span>
                    {q.topic && (
                      <span className="text-muted-foreground border-border/30 inline-flex items-center rounded-full border bg-black/2 px-2 py-0.5 font-mono text-[11px] dark:bg-white/3">
                        {q.topic}
                      </span>
                    )}
                    <span className="text-muted-foreground inline-flex items-center px-2 py-0.5 font-mono text-[10px]">
                      {formatQuestionType(q.type)}
                    </span>
                  </div>

                  <div className="text-muted-foreground flex items-center gap-2 font-mono text-[11px]">
                    <span>
                      +{q.marks || 1} mark{q.marks !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Question Prompt Snippet - Fully responsive with zero text clipping */}
                <div className="selectable-content text-foreground overflow-visible text-[13px] leading-relaxed font-normal wrap-break-word">
                  <MathRenderer content={cleanQuestionBody(q.body)} />
                </div>

                {/* Card Action Hint */}
                <div className="border-border/40 flex items-center justify-between border-t pt-2.5 text-xs">
                  <span className="text-muted-foreground text-[11px]">
                    Click to review problem & solution
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setModalIndex(idx);
                    }}
                    className="text-primary flex cursor-pointer items-center gap-1 text-xs font-semibold transition-colors hover:underline"
                  >
                    <span>View Answer & Explanation</span>
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
      {/* Native macOS Contextual Menu Portal */}
      <MacContextMenuPortal state={contextMenuState} onClose={closeContextMenu} />
    </div>
  );
}
