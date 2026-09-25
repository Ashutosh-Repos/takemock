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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-card text-card-foreground border-border/70 flex flex-col w-full max-w-2xl max-h-[88vh] rounded-lg border shadow-xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Top Header */}
        <div className="border-border/60 bg-muted/30 flex items-center justify-between px-4 py-2.5 border-b">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              id="question-modal-title"
              className="text-[10px] font-mono tabular-nums px-2 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary font-semibold"
            >
              {titlePrefix} {currentIndex + 1} of {total}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 text-foreground font-medium">
              {currentQuestion.subject}
            </span>
            {currentQuestion.topic && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/50 text-muted-foreground">
                {currentQuestion.topic}
              </span>
            )}
            <span className="text-[10px] font-mono uppercase text-muted-foreground">
              {currentQuestion.type.replace('_', ' ')}
            </span>
            {currentScore?.status && (
              <span
                className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded border font-semibold ${
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
            <div className="inline-flex items-center rounded-md border border-border/60 bg-card p-0.5">
              <button
                onClick={handlePrev}
                disabled={isFirst}
                className="btn btn-ghost btn-xs h-6 px-1.5 gap-0.5 font-medium disabled:opacity-30 active:scale-95 text-xs text-muted-foreground hover:text-foreground"
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
                className="btn btn-ghost btn-xs h-6 px-1.5 gap-0.5 font-medium disabled:opacity-30 active:scale-95 text-xs text-muted-foreground hover:text-foreground"
                title="Next Question (→)"
                aria-label="Next question"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="size-3" />
              </button>
            </div>

            <button
              onClick={onClose}
              className="btn btn-ghost btn-xs h-6 w-6 p-0 text-muted-foreground hover:text-foreground active:scale-95"
              title="Close (Esc)"
              aria-label="Close dialog"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div ref={contentRef} className="overflow-y-auto p-4 sm:p-5 space-y-4 flex-1">
          {/* Question Prompt */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
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
                    Score: {currentScore.marksAwarded > 0 ? `+${currentScore.marksAwarded}` : currentScore.marksAwarded}
                  </span>
                )}
                {currentScore?.timeSpentSeconds ? (
                  <span className="flex items-center gap-1 text-muted-foreground/80">
                    <Clock className="size-3" />
                    {Math.floor(currentScore.timeSpentSeconds / 60)}m {currentScore.timeSpentSeconds % 60}s
                  </span>
                ) : null}
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Award className="size-3" />
                  +{currentQuestion.marks || 1} mark{currentQuestion.marks !== 1 ? 's' : ''}
                  {currentQuestion.negativeMarks ? ` / -${currentQuestion.negativeMarks}` : ''}
                </span>
              </div>
            </div>

            <div
              id="question-modal-statement"
              className="bg-muted/20 border-border/60 rounded-lg border p-3.5 text-sm leading-relaxed selectable-content text-foreground/90"
            >
              <MathRenderer content={currentQuestion.body} />
            </div>

            {/* Optional Image */}
            {currentQuestion.imageUrl && (
              <div className="mt-3 rounded-xl overflow-hidden border border-border/60 bg-base-200/20 p-2 max-w-lg mx-auto">
                <img
                  src={currentQuestion.imageUrl}
                  alt={currentQuestion.imageAlt || 'Question visual reference'}
                  className="rounded-lg object-contain max-h-72 w-full"
                />
              </div>
            )}

            {/* Assertion & Reason */}
            {currentQuestion.type === 'assertion_reason' && (currentQuestion.assertion || currentQuestion.reason) && (
              <div className="grid grid-cols-1 gap-2 pt-2">
                {currentQuestion.assertion && (
                  <div className="p-3.5 rounded-xl border border-border/70 bg-base-200/40 text-sm">
                    <span className="font-bold text-xs uppercase text-primary block mb-1">
                      Assertion (A):
                    </span>
                    <MathRenderer content={currentQuestion.assertion} />
                  </div>
                )}
                {currentQuestion.reason && (
                  <div className="p-3.5 rounded-xl border border-border/70 bg-base-200/40 text-sm">
                    <span className="font-bold text-xs uppercase text-primary block mb-1">
                      Reason (R):
                    </span>
                    <MathRenderer content={currentQuestion.reason} />
                  </div>
                )}
              </div>
            )}

            {/* Match Pairs */}
            {currentQuestion.type === 'match' && currentQuestion.matches && currentQuestion.matches.length > 0 && (
              <div className="border border-border/70 rounded-xl overflow-hidden text-xs mt-2">
                <div className="grid grid-cols-2 bg-base-200 font-bold p-2.5 border-b border-border/70">
                  <span>Column I</span>
                  <span>Column II</span>
                </div>
                {currentQuestion.matches.map((m, mIdx) => (
                  <div
                    key={mIdx}
                    className="grid grid-cols-2 p-2.5 border-b border-border/40 last:border-b-0 items-center gap-2"
                  >
                    <div><MathRenderer content={m.left} /></div>
                    <div><MathRenderer content={m.right} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Options / Answer Keys */}
          <div className="space-y-3">
            <span className="font-semibold uppercase tracking-wider text-[10px] text-base-content/60 block">
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
                          String(item).toUpperCase() === opt.text.trim().toUpperCase()
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
                      className={`flex items-start gap-2.5 rounded-md border p-2.5 text-xs sm:text-sm transition-colors ${
                        opt.isCorrect
                          ? 'border-emerald-500/40 bg-emerald-500/5'
                          : isSelected
                          ? 'border-red-500/40 bg-red-500/5'
                          : 'border-border/60 bg-card'
                      }`}
                    >
                      <span
                        className={`font-mono text-xs size-5 flex items-center justify-center rounded shrink-0 font-medium ${
                          opt.isCorrect
                            ? 'bg-emerald-500 text-white'
                            : isSelected
                            ? 'bg-red-500 text-white'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {letter}
                      </span>

                      <div className="flex-1 pt-0.5 leading-relaxed text-foreground">
                        <MathRenderer content={opt.text} />
                        {opt.explanation && (
                          <p className="mt-1 text-xs text-muted-foreground italic">
                            {opt.explanation}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 shrink-0">
                        {isSelected && !opt.isCorrect && (
                          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 flex items-center gap-1">
                            <XCircle className="size-2.5" />
                            Your Pick
                          </span>
                        )}
                        {isSelected && opt.isCorrect && (
                          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="size-2.5" />
                            Your Pick (Correct)
                          </span>
                        )}
                        {!isSelected && opt.isCorrect && (
                          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-md p-3 text-xs flex flex-col justify-between">
                  <span className="text-[10px] uppercase font-mono text-emerald-600 dark:text-emerald-400 block">
                    Correct Value
                  </span>
                  <div className="font-mono text-base font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {currentQuestion.correctValue ?? 'N/A'} {currentQuestion.unit || ''}
                  </div>
                  {currentQuestion.toleranceAbsolute !== undefined && currentQuestion.toleranceAbsolute > 0 && (
                    <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                      Tolerance: ±{currentQuestion.toleranceAbsolute} {currentQuestion.unit || ''}
                    </div>
                  )}
                </div>

                {activeResponse !== undefined && activeResponse !== null && (
                  <div className="bg-muted/30 border border-border/60 rounded-md p-3 text-xs flex flex-col justify-between">
                    <span className="text-[10px] uppercase font-mono text-muted-foreground block">
                      Your Response
                    </span>
                    <div className="font-mono text-base font-semibold text-foreground mt-0.5">
                      {String(activeResponse)} {currentQuestion.unit || ''}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Fill in the Blank Answer */}
            {currentQuestion.type === 'fill_blank' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-md p-3 text-xs space-y-1">
                  <span className="text-[10px] uppercase font-mono text-emerald-600 dark:text-emerald-400 block">
                    Accepted Answer
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {currentQuestion.acceptedAnswers && currentQuestion.acceptedAnswers.length > 0 ? (
                      currentQuestion.acceptedAnswers.map((ans, aIdx) => (
                        <span key={aIdx} className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
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
                  <div className="bg-muted/30 border border-border/60 rounded-md p-3 text-xs space-y-1">
                    <span className="text-[10px] uppercase font-mono text-muted-foreground block">
                      Your Response
                    </span>
                    <div className="font-mono font-semibold text-foreground">
                      {String(activeResponse)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Assertion-Reason Code */}
            {currentQuestion.type === 'assertion_reason' && currentQuestion.correctCode && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-md p-3 text-xs flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-mono text-emerald-600 dark:text-emerald-400 block">
                      Correct Option
                    </span>
                    <span className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      Option ({currentQuestion.correctCode})
                    </span>
                  </div>
                </div>

                {activeResponse !== undefined && activeResponse !== null && (
                  <div className="bg-muted/30 border border-border/60 rounded-md p-3 text-xs flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-mono text-muted-foreground block">
                        Your Response
                      </span>
                      <span className="font-mono text-sm font-semibold text-foreground">
                        Option ({String(activeResponse)})
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Verified Derivation & Explanation */}
          <div className="bg-muted/30 border border-border/60 rounded-md p-3.5 text-xs sm:text-sm space-y-2">
            <div className="flex items-center gap-1.5 text-primary font-medium text-xs">
              <Sparkles className="size-3.5" />
              <span>Explanation & Derivation</span>
            </div>

            {currentQuestion.solution && currentQuestion.solution.trim() ? (
              <div className="leading-relaxed text-foreground/90 selectable-content text-xs sm:text-sm">
                <MathRenderer content={currentQuestion.solution} />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic leading-relaxed">
                No step-by-step derivation was provided with this question. The verified answer key is confirmed above.
              </p>
            )}
          </div>
        </div>

        {/* Modal Footer with Keyboard Nav Guidance */}
        <div className="border-border/60 bg-muted/20 flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-t text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] font-mono">
            <kbd className="px-1 py-0.5 rounded border border-border/60 bg-card text-[10px]">←</kbd>
            <kbd className="px-1 py-0.5 rounded border border-border/60 bg-card text-[10px]">→</kbd>
            <span>Navigate</span>
            <span className="text-border/80">|</span>
            <kbd className="px-1 py-0.5 rounded border border-border/60 bg-card text-[10px]">Esc</kbd>
            <span>Close</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrev}
              disabled={isFirst}
              className="btn btn-outline border-border/70 hover:bg-muted text-foreground btn-xs h-6 px-2 text-xs font-medium disabled:opacity-30 active:scale-95"
            >
              <ChevronLeft className="size-3" />
              Prev
            </button>
            <button
              onClick={handleNext}
              disabled={isLast}
              className="btn btn-primary btn-xs h-6 px-2 text-xs font-medium disabled:opacity-30 active:scale-95"
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
