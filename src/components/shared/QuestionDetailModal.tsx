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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-card text-card-foreground border-border/80 flex flex-col w-full max-w-3xl max-h-[90vh] rounded-2xl border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Top Header */}
        <div className="border-border/60 bg-base-200/50 flex items-center justify-between px-5 py-3.5 border-b">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge badge-primary font-bold font-mono text-xs">
              {titlePrefix} {currentIndex + 1} of {total}
            </span>
            <span className="badge badge-neutral text-xs font-semibold">
              {currentQuestion.subject}
            </span>
            {currentQuestion.topic && (
              <span className="badge badge-outline text-xs">
                {currentQuestion.topic}
              </span>
            )}
            <span className="badge badge-ghost badge-xs font-mono uppercase text-base-content/60">
              {currentQuestion.type.replace('_', ' ')}
            </span>
            {currentScore?.status && (
              <span
                className={`badge badge-sm font-semibold text-xs ${
                  currentScore.status === 'CORRECT'
                    ? 'badge-success text-success-content'
                    : currentScore.status === 'INCORRECT'
                    ? 'badge-error text-error-content'
                    : currentScore.status === 'PARTIAL'
                    ? 'badge-warning text-warning-content'
                    : 'badge-ghost text-base-content/60'
                }`}
              >
                {currentScore.status}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Nav Arrows */}
            <div className="join border-border/60 bg-base-100 rounded-lg border">
              <button
                onClick={handlePrev}
                disabled={isFirst}
                className="btn btn-ghost btn-xs join-item gap-0.5 px-2 font-medium disabled:opacity-30"
                title="Previous Question (←)"
              >
                <ChevronLeft className="size-3.5" />
                <span className="hidden sm:inline">Prev</span>
              </button>
              <button
                onClick={handleNext}
                disabled={isLast}
                className="btn btn-ghost btn-xs join-item gap-0.5 px-2 font-medium disabled:opacity-30"
                title="Next Question (→)"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="size-3.5" />
              </button>
            </div>

            <button
              onClick={onClose}
              className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-base-content"
              title="Close (Esc)"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div ref={contentRef} className="overflow-y-auto p-5 sm:p-7 space-y-6 flex-1">
          {/* Question Prompt */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-base-content/60">
              <span className="font-semibold uppercase tracking-wider text-[10px]">
                Question Statement
              </span>
              <div className="flex items-center gap-3 font-mono text-xs">
                {currentScore && (
                  <span
                    className={`font-bold ${
                      currentScore.marksAwarded > 0
                        ? 'text-success'
                        : currentScore.marksAwarded < 0
                        ? 'text-error'
                        : 'text-base-content/70'
                    }`}
                  >
                    Score: {currentScore.marksAwarded > 0 ? `+${currentScore.marksAwarded}` : currentScore.marksAwarded}
                  </span>
                )}
                {currentScore?.timeSpentSeconds ? (
                  <span className="flex items-center gap-1 text-base-content/60">
                    <Clock className="size-3" />
                    {Math.floor(currentScore.timeSpentSeconds / 60)}m {currentScore.timeSpentSeconds % 60}s
                  </span>
                ) : null}
                <span className="flex items-center gap-1 text-base-content/70">
                  <Award className="size-3 text-warning" />
                  +{currentQuestion.marks || 1} mark{currentQuestion.marks !== 1 ? 's' : ''}
                  {currentQuestion.negativeMarks ? ` / -${currentQuestion.negativeMarks}` : ''}
                </span>
              </div>
            </div>

            <div className="bg-base-200/30 border-border/60 rounded-xl border p-4 text-base leading-relaxed">
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
                      className={`flex items-start gap-3 rounded-xl border p-3.5 text-sm transition-all ${
                        opt.isCorrect
                          ? 'border-success/60 bg-success/10 shadow-xs'
                          : isSelected
                          ? 'border-error/60 bg-error/10 shadow-xs'
                          : 'border-border/60 bg-base-100/50'
                      }`}
                    >
                      <span
                        className={`font-mono font-bold text-xs size-6 flex items-center justify-center rounded-md shrink-0 ${
                          opt.isCorrect
                            ? 'bg-success text-success-content'
                            : isSelected
                            ? 'bg-error text-error-content'
                            : 'bg-base-200 text-base-content/70'
                        }`}
                      >
                        {letter}
                      </span>

                      <div className="flex-1 pt-0.5 leading-relaxed">
                        <MathRenderer content={opt.text} />
                        {opt.explanation && (
                          <p className="mt-1 text-xs text-base-content/60 italic">
                            {opt.explanation}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 shrink-0">
                        {isSelected && !opt.isCorrect && (
                          <span className="badge badge-error text-error-content gap-1 text-[11px] font-bold">
                            <XCircle className="size-3" />
                            Your Pick
                          </span>
                        )}
                        {isSelected && opt.isCorrect && (
                          <span className="badge badge-success text-success-content gap-1 text-[11px] font-bold">
                            <CheckCircle2 className="size-3" />
                            Your Pick (Correct)
                          </span>
                        )}
                        {!isSelected && opt.isCorrect && (
                          <span className="badge badge-success badge-outline gap-1 text-[11px] font-bold">
                            <CheckCircle2 className="size-3" />
                            Correct Answer
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-success/10 border-success/30 rounded-xl border p-4 text-sm flex flex-col justify-between">
                  <span className="text-xs uppercase font-bold text-success block tracking-wider">
                    Correct Value
                  </span>
                  <div className="font-mono text-lg font-bold text-success mt-1">
                    {currentQuestion.correctValue ?? 'N/A'} {currentQuestion.unit || ''}
                  </div>
                  {currentQuestion.toleranceAbsolute !== undefined && currentQuestion.toleranceAbsolute > 0 && (
                    <div className="text-xs text-base-content/70 font-mono mt-1">
                      Tolerance: ±{currentQuestion.toleranceAbsolute} {currentQuestion.unit || ''}
                    </div>
                  )}
                </div>

                {activeResponse !== undefined && activeResponse !== null && (
                  <div className="bg-base-200/50 border-border/70 rounded-xl border p-4 text-sm flex flex-col justify-between">
                    <span className="text-xs uppercase font-bold text-base-content/60 block tracking-wider">
                      Your Response
                    </span>
                    <div className="font-mono text-lg font-bold mt-1">
                      {String(activeResponse)} {currentQuestion.unit || ''}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Fill in the Blank Answer */}
            {currentQuestion.type === 'fill_blank' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-success/10 border-success/30 rounded-xl border p-4 text-sm space-y-1.5">
                  <span className="text-xs uppercase font-bold text-success block tracking-wider">
                    Accepted Answer(s)
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {currentQuestion.acceptedAnswers && currentQuestion.acceptedAnswers.length > 0 ? (
                      currentQuestion.acceptedAnswers.map((ans, aIdx) => (
                        <span key={aIdx} className="badge badge-success text-success-content font-mono font-bold">
                          {ans}
                        </span>
                      ))
                    ) : (
                      <span className="font-mono font-bold text-success">
                        {currentQuestion.correctValue ?? 'N/A'}
                      </span>
                    )}
                  </div>
                </div>

                {activeResponse !== undefined && activeResponse !== null && (
                  <div className="bg-base-200/50 border-border/70 rounded-xl border p-4 text-sm space-y-1.5">
                    <span className="text-xs uppercase font-bold text-base-content/60 block tracking-wider">
                      Your Response
                    </span>
                    <div className="font-mono font-bold text-base">
                      {String(activeResponse)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Assertion-Reason Code */}
            {currentQuestion.type === 'assertion_reason' && currentQuestion.correctCode && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-success/10 border-success/30 rounded-xl border p-4 text-sm flex items-center justify-between">
                  <div>
                    <span className="text-xs uppercase font-bold text-success block tracking-wider">
                      Correct Code
                    </span>
                    <span className="font-mono text-base font-bold text-success">
                      Option ({currentQuestion.correctCode})
                    </span>
                  </div>
                </div>

                {activeResponse !== undefined && activeResponse !== null && (
                  <div className="bg-base-200/50 border-border/70 rounded-xl border p-4 text-sm flex items-center justify-between">
                    <div>
                      <span className="text-xs uppercase font-bold text-base-content/60 block tracking-wider">
                        Your Response
                      </span>
                      <span className="font-mono text-base font-bold">
                        Option ({String(activeResponse)})
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Verified Derivation & Explanation */}
          <div className="bg-primary/5 border-primary/25 rounded-xl border p-5 text-sm space-y-2.5">
            <div className="flex items-center gap-1.5 text-primary font-bold text-xs uppercase tracking-wider">
              <Sparkles className="size-4" />
              Verified Derivation & Explanation
            </div>

            {currentQuestion.solution && currentQuestion.solution.trim() ? (
              <div className="leading-relaxed text-base-content/90">
                <MathRenderer content={currentQuestion.solution} />
              </div>
            ) : (
              <p className="text-xs text-base-content/60 italic leading-relaxed">
                No formal step-by-step derivation was attached to this question in the source paper. The verified answer key is confirmed above.
              </p>
            )}
          </div>
        </div>

        {/* Modal Footer with Keyboard Nav Guidance */}
        <div className="border-border/60 bg-base-200/40 flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t text-xs">
          <div className="flex items-center gap-2 text-base-content/50">
            <kbd className="kbd kbd-xs font-mono">←</kbd>
            <kbd className="kbd kbd-xs font-mono">→</kbd>
            <span>Flip question</span>
            <span className="mx-1">•</span>
            <kbd className="kbd kbd-xs font-mono">Esc</kbd>
            <span>Close</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrev}
              disabled={isFirst}
              className="btn btn-outline btn-xs gap-1 disabled:opacity-30"
            >
              <ChevronLeft className="size-3.5" />
              Previous
            </button>
            <button
              onClick={handleNext}
              disabled={isLast}
              className="btn btn-primary btn-xs gap-1 disabled:opacity-30"
            >
              Next
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
