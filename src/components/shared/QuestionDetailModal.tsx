import { useEffect, useCallback, useRef } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  X,
  Award,
  Clock,
  XCircle,
} from 'lucide-react';
import { MathRenderer } from '@/components/shared/MathRenderer';
import type { QuestionModel } from '@/types/question';
import type { QuestionScore } from '@/types/scoring';

export interface QuestionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: QuestionModel[];
  currentIndex: number;
  onNavigateIndex: (newIndex: number) => void;
  titlePrefix?: string; // e.g. "Error #" or "Question #" or "Q"
  scores?: Record<string, QuestionScore>;
  candidateResponse?: any;
  score?: QuestionScore;
}

export function QuestionDetailModal({
  isOpen,
  onClose,
  questions,
  currentIndex,
  onNavigateIndex,
  titlePrefix = 'Question',
  scores,
  candidateResponse,
  score,
}: QuestionDetailModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const currentQuestion: QuestionModel | undefined = questions[currentIndex];

  // Resolve current question's score if available
  const currentScore: QuestionScore | undefined =
    score ?? (currentQuestion && scores ? scores[currentQuestion.id] : undefined);

  const activeResponse = currentScore?.candidateResponse ?? candidateResponse;

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      onNavigateIndex(currentIndex - 1);
    }
  }, [currentIndex, onNavigateIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      onNavigateIndex(currentIndex + 1);
    }
  }, [currentIndex, questions.length, onNavigateIndex]);

  // Scroll to top whenever currentIndex changes
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [currentIndex]);

  // Keyboard navigation: ArrowLeft, ArrowRight, Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input or textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handlePrev, handleNext, onClose]);

  if (!isOpen || !currentQuestion) return null;

  const total = questions.length;
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === total - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="question-modal-title"
      aria-describedby="question-modal-statement"
      className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm transition-opacity duration-150 sm:p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-card/95 text-card-foreground border-border/80 animate-in zoom-in-95 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl duration-150">
        {/* Top Header */}
        <div className="border-border/40 bg-muted/20 flex items-center justify-between border-b px-4 py-2.5 backdrop-blur-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              id="question-modal-title"
              className="border-primary/30 bg-primary/10 text-primary rounded border px-2 py-0.5 font-mono text-[10px] font-semibold tabular-nums"
            >
              {titlePrefix} {currentIndex + 1} of {total}
            </span>
            <span className="border-border/60 bg-muted/40 text-foreground rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium">
              {currentQuestion.subject}
            </span>
            {currentQuestion.topic && (
              <span className="border-border/50 text-muted-foreground rounded border px-1.5 py-0.5 font-mono text-[10px]">
                {currentQuestion.topic}
              </span>
            )}
            <span className="text-muted-foreground font-mono text-[10px] uppercase">
              {currentQuestion.type.replace('_', ' ')}
            </span>
            {currentScore?.status && (
              <span
                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums ${
                  currentScore.status === 'CORRECT'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : currentScore.status === 'INCORRECT'
                      ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
                      : currentScore.status === 'PARTIAL'
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        : 'border-border/60 bg-muted/40 text-muted-foreground'
                }`}
              >
                {currentScore.status}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Nav Arrows */}
            <div className="border-border/60 bg-card inline-flex items-center rounded-md border p-0.5">
              <button
                onClick={handlePrev}
                disabled={isFirst}
                className="btn btn-ghost btn-xs text-muted-foreground hover:text-foreground h-6 gap-0.5 px-1.5 text-xs font-medium active:scale-95 disabled:opacity-30"
                title="Previous Question (←)"
                aria-label="Previous question"
              >
                <ChevronLeft className="size-3" />
                <span className="hidden sm:inline">Prev</span>
              </button>
              <span className="text-border/60 text-[10px]">|</span>
              <button
                onClick={handleNext}
                disabled={isLast}
                className="btn btn-ghost btn-xs text-muted-foreground hover:text-foreground h-6 gap-0.5 px-1.5 text-xs font-medium active:scale-95 disabled:opacity-30"
                title="Next Question (→)"
                aria-label="Next question"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="size-3" />
              </button>
            </div>

            <button
              onClick={onClose}
              className="btn btn-ghost btn-xs text-muted-foreground hover:text-foreground h-6 w-6 p-0 active:scale-95"
              title="Close (Esc)"
              aria-label="Close dialog"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div ref={contentRef} className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          {/* Question Prompt */}
          <div className="space-y-1.5">
            <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground font-mono text-[10px] tracking-wider uppercase">
                Question Statement
              </span>
              <div className="flex items-center gap-2.5 font-mono text-[11px] tabular-nums">
                {currentScore && (
                  <span
                    className={`font-semibold ${
                      currentScore.marksAwarded > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : currentScore.marksAwarded < 0
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-muted-foreground'
                    }`}
                  >
                    Score:{' '}
                    {currentScore.marksAwarded > 0
                      ? `+${currentScore.marksAwarded}`
                      : currentScore.marksAwarded}
                  </span>
                )}
                {currentScore?.timeSpentSeconds ? (
                  <span className="text-muted-foreground/80 flex items-center gap-1">
                    <Clock className="size-3" />
                    {Math.floor(currentScore.timeSpentSeconds / 60)}m{' '}
                    {currentScore.timeSpentSeconds % 60}s
                  </span>
                ) : null}
                <span className="text-muted-foreground flex items-center gap-1">
                  <Award className="size-3" />+{currentQuestion.marks || 1} mark
                  {currentQuestion.marks !== 1 ? 's' : ''}
                  {currentQuestion.negativeMarks ? ` / -${currentQuestion.negativeMarks}` : ''}
                </span>
              </div>
            </div>

            <div
              id="question-modal-statement"
              className="bg-muted/20 border-border/60 selectable-content text-foreground/90 rounded-lg border p-3.5 text-sm leading-relaxed"
            >
              <MathRenderer content={currentQuestion.body} />
            </div>

            {/* Optional Image */}
            {currentQuestion.imageUrl && (
              <div className="border-border/60 bg-base-200/20 mx-auto mt-3 max-w-lg overflow-hidden rounded-xl border p-2">
                <img
                  src={currentQuestion.imageUrl}
                  alt={currentQuestion.imageAlt || 'Question visual reference'}
                  className="max-h-72 w-full rounded-lg object-contain"
                />
              </div>
            )}

            {/* Assertion & Reason */}
            {currentQuestion.type === 'assertion_reason' &&
              (currentQuestion.assertion || currentQuestion.reason) && (
                <div className="grid grid-cols-1 gap-2 pt-2">
                  {currentQuestion.assertion && (
                    <div className="border-border/70 bg-base-200/40 rounded-xl border p-3.5 text-sm">
                      <span className="text-primary mb-1 block text-xs font-bold uppercase">
                        Assertion (A):
                      </span>
                      <MathRenderer content={currentQuestion.assertion} />
                    </div>
                  )}
                  {currentQuestion.reason && (
                    <div className="border-border/70 bg-base-200/40 rounded-xl border p-3.5 text-sm">
                      <span className="text-primary mb-1 block text-xs font-bold uppercase">
                        Reason (R):
                      </span>
                      <MathRenderer content={currentQuestion.reason} />
                    </div>
                  )}
                </div>
              )}

            {/* Match Pairs */}
            {currentQuestion.type === 'match' &&
              currentQuestion.matches &&
              currentQuestion.matches.length > 0 && (
                <div className="border-border/70 mt-2 overflow-hidden rounded-xl border text-xs">
                  <div className="bg-base-200 border-border/70 grid grid-cols-2 border-b p-2.5 font-bold">
                    <span>Column I</span>
                    <span>Column II</span>
                  </div>
                  {currentQuestion.matches.map((m, mIdx) => (
                    <div
                      key={mIdx}
                      className="border-border/40 grid grid-cols-2 items-center gap-2 border-b p-2.5 last:border-b-0"
                    >
                      <div>
                        <MathRenderer content={m.left} />
                      </div>
                      <div>
                        <MathRenderer content={m.right} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>

          {/* Options / Answer Keys */}
          <div className="space-y-3">
            <span className="text-muted-foreground block text-[10px] font-semibold tracking-wider uppercase">
              Options & Answer Key
            </span>

            {/* Choice Questions */}
            {currentQuestion.options && currentQuestion.options.length > 0 ? (
              <div className="space-y-2">
                {currentQuestion.options.map((opt, i) => {
                  const letter = String.fromCharCode(65 + i);

                  // Check if candidate selected this option
                  const isSelected = (() => {
                    if (activeResponse === undefined || activeResponse === null) return false;
                    if (Array.isArray(activeResponse)) {
                      return activeResponse.some(
                        (item) =>
                          item === opt.id ||
                          String(item).toUpperCase() === letter.toUpperCase() ||
                          String(item).toUpperCase() === opt.text.trim().toUpperCase(),
                      );
                    }
                    return (
                      activeResponse === opt.id ||
                      String(activeResponse).toUpperCase() === letter.toUpperCase() ||
                      String(activeResponse).toUpperCase() === opt.text.trim().toUpperCase()
                    );
                  })();

                  return (
                    <div
                      key={opt.id || i}
                      className={`flex items-start gap-2.5 rounded-md border p-2.5 text-xs transition-colors sm:text-sm ${
                        opt.isCorrect
                          ? 'border-emerald-500/40 bg-emerald-500/5'
                          : isSelected
                            ? 'border-red-500/40 bg-red-500/5'
                            : 'border-border/60 bg-card'
                      }`}
                    >
                      <span
                        className={`flex size-5 shrink-0 items-center justify-center rounded font-mono text-xs font-medium ${
                          opt.isCorrect
                            ? 'bg-emerald-500 text-white'
                            : isSelected
                              ? 'bg-red-500 text-white'
                              : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {letter}
                      </span>

                      <div className="text-foreground flex-1 pt-0.5 leading-relaxed">
                        <MathRenderer content={opt.text} />
                        {opt.explanation && (
                          <p className="text-muted-foreground mt-1 text-xs italic">
                            {opt.explanation}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center">
                        {isSelected && !opt.isCorrect && (
                          <span className="flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-red-600 dark:text-red-400">
                            <XCircle className="size-2.5" />
                            Your Pick
                          </span>
                        )}
                        {isSelected && opt.isCorrect && (
                          <span className="flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="size-2.5" />
                            Your Pick (Correct)
                          </span>
                        )}
                        {!isSelected && opt.isCorrect && (
                          <span className="flex items-center gap-1 rounded border border-emerald-500/30 px-1.5 py-0.5 font-mono text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="size-2.5" />
                            Correct
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {/* Numerical / Integer Answer */}
            {(currentQuestion.type === 'numerical' || currentQuestion.type === 'integer') && (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div className="flex flex-col justify-between rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
                  <span className="block font-mono text-[10px] text-emerald-600 uppercase dark:text-emerald-400">
                    Correct Value
                  </span>
                  <div className="mt-0.5 font-mono text-base font-semibold text-emerald-600 dark:text-emerald-400">
                    {currentQuestion.correctValue ?? 'N/A'} {currentQuestion.unit || ''}
                  </div>
                  {currentQuestion.toleranceAbsolute !== undefined &&
                    currentQuestion.toleranceAbsolute > 0 && (
                      <div className="text-muted-foreground mt-0.5 font-mono text-[11px]">
                        Tolerance: ±{currentQuestion.toleranceAbsolute} {currentQuestion.unit || ''}
                      </div>
                    )}
                </div>

                {activeResponse !== undefined && activeResponse !== null && (
                  <div className="bg-muted/30 border-border/60 flex flex-col justify-between rounded-md border p-3 text-xs">
                    <span className="text-muted-foreground block font-mono text-[10px] uppercase">
                      Your Response
                    </span>
                    <div className="text-foreground mt-0.5 font-mono text-base font-semibold">
                      {String(activeResponse)} {currentQuestion.unit || ''}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Fill in the Blank Answer */}
            {currentQuestion.type === 'fill_blank' && (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div className="space-y-1 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
                  <span className="block font-mono text-[10px] text-emerald-600 uppercase dark:text-emerald-400">
                    Accepted Answer
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {currentQuestion.acceptedAnswers &&
                    currentQuestion.acceptedAnswers.length > 0 ? (
                      currentQuestion.acceptedAnswers.map((ans, aIdx) => (
                        <span
                          key={aIdx}
                          className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
                        >
                          {ans}
                        </span>
                      ))
                    ) : (
                      <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        {currentQuestion.correctValue ?? 'N/A'}
                      </span>
                    )}
                  </div>
                </div>

                {activeResponse !== undefined && activeResponse !== null && (
                  <div className="bg-muted/30 border-border/60 space-y-1 rounded-md border p-3 text-xs">
                    <span className="text-muted-foreground block font-mono text-[10px] uppercase">
                      Your Response
                    </span>
                    <div className="text-foreground font-mono font-semibold">
                      {String(activeResponse)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Assertion-Reason Code */}
            {currentQuestion.type === 'assertion_reason' && currentQuestion.correctCode && (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs">
                  <div>
                    <span className="block font-mono text-[10px] text-emerald-600 uppercase dark:text-emerald-400">
                      Correct Option
                    </span>
                    <span className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      Option ({currentQuestion.correctCode})
                    </span>
                  </div>
                </div>

                {activeResponse !== undefined && activeResponse !== null && (
                  <div className="bg-muted/30 border-border/60 flex items-center justify-between rounded-md border p-3 text-xs">
                    <div>
                      <span className="text-muted-foreground block font-mono text-[10px] uppercase">
                        Your Response
                      </span>
                      <span className="text-foreground font-mono text-sm font-semibold">
                        Option ({String(activeResponse)})
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Verified Derivation & Explanation */}
          <div className="bg-muted/30 border-border/60 space-y-2 rounded-md border p-3.5 text-xs sm:text-sm">
            <div className="text-primary flex items-center gap-1.5 text-xs font-medium">
              <Sparkles className="size-3.5" />
              <span>Explanation & Derivation</span>
            </div>

            {currentQuestion.solution && currentQuestion.solution.trim() ? (
              <div className="text-foreground/90 selectable-content text-xs leading-relaxed sm:text-sm">
                <MathRenderer content={currentQuestion.solution} />
              </div>
            ) : (
              <p className="text-muted-foreground text-xs leading-relaxed italic">
                No step-by-step derivation was provided with this question. The verified answer key
                is confirmed above.
              </p>
            )}
          </div>
        </div>

        {/* Modal Footer with Keyboard Nav Guidance */}
        <div className="border-border/60 bg-muted/20 flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs">
          <div className="text-muted-foreground flex items-center gap-1.5 font-mono text-[11px]">
            <kbd className="border-border/60 bg-card rounded border px-1 py-0.5 text-[10px]">←</kbd>
            <kbd className="border-border/60 bg-card rounded border px-1 py-0.5 text-[10px]">→</kbd>
            <span>Navigate</span>
            <span className="text-border/80">|</span>
            <kbd className="border-border/60 bg-card rounded border px-1 py-0.5 text-[10px]">
              Esc
            </kbd>
            <span>Close</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrev}
              disabled={isFirst}
              className="btn btn-outline border-border/70 hover:bg-muted text-foreground btn-xs h-6 px-2 text-xs font-medium active:scale-95 disabled:opacity-30"
            >
              <ChevronLeft className="size-3" />
              Prev
            </button>
            <button
              onClick={handleNext}
              disabled={isLast}
              className="btn btn-primary btn-xs h-6 px-2 text-xs font-medium active:scale-95 disabled:opacity-30"
            >
              Next
              <ChevronRight className="size-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
