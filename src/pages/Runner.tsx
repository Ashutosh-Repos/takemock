/**
 * CBT Test Runner Page.
 * High-performance, distraction-free Computer-Based Test (CBT) examination simulator.
 * Supports split-view on desktop, mobile slide-up drawer, keyboard shortcuts, and domain event auditing.
 * Adheres strictly to docs/master_architecture_prompt_v2.md Sections 14-22.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Grid,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { MathRenderer } from '@/components/shared/MathRenderer';
import { QuestionInput } from '@/components/shared/QuestionInput';
import {
  getNextQuestion,
  getPreviousQuestion,
  resolveQuestionVisitStatus,
} from '@/core/engine/navigationEngine';
import { formatTimeSeconds, TimingEngine } from '@/core/engine/timingEngine';
import { sendNativeNotification, setWindowFullscreen } from '@/core/native/tauriBridge';
import { assessmentRepository } from '@/core/storage/repository';
import type { AnswerHistoryEntry, AttemptState, QuestionVisitStatus } from '@/types/attempt';
import type { QuestionModel } from '@/types/question';

export function Runner() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();

  const [attempt, setAttempt] = useState<AttemptState | null>(null);
  const [loading, setLoading] = useState(true);

  // Active question and section
  const [currentSectionId, setCurrentSectionId] = useState('');
  const [currentQuestionId, setCurrentQuestionId] = useState('');

  // Responses & visit statuses in local memory (synced to IndexedDB)
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [visitStatuses, setVisitStatuses] = useState<Record<string, QuestionVisitStatus>>({});
  const [timings, setTimings] = useState<Record<string, { timeSpentSeconds: number; visitCount: number }>>({});
  const [answerHistory, setAnswerHistory] = useState<Record<string, AnswerHistoryEntry[]>>({});

  // Practice mode instant checks
  const [showSolutionInstant, setShowSolutionInstant] = useState<Record<string, boolean>>({});

  // Fullscreen toggle state
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Mobile question palette drawer
  const [showMobilePalette, setShowMobilePalette] = useState(false);

  // Timing state
  const timerEngineRef = useRef<TimingEngine | null>(null);
  const [timerSnapshot, setTimerSnapshot] = useState({
    remainingSeconds: 0,
    elapsedSeconds: 0,
    isWarning: false,
    state: 'RUNNING',
  });

  // Submit Modal
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Time tracking per question
  const questionEnteredTimeRef = useRef<number>(0);

  // Toggle fullscreen mode (Native Tauri Window or Web Fullscreen)
  const toggleFullscreen = async () => {
    const next = !isFullscreen;
    await setWindowFullscreen(next);
    setIsFullscreen(next);
  };

  // Mutable state ref ensuring stable closures without re-triggering effects
  const stateRef = useRef({
    currentQuestionId,
    currentSectionId,
    timings,
    attempt,
    responses,
    answerHistory,
    visitStatuses,
    timerSnapshot,
    isSubmitting,
  });

  useEffect(() => {
    stateRef.current = {
      currentQuestionId,
      currentSectionId,
      timings,
      attempt,
      responses,
      answerHistory,
      visitStatuses,
      timerSnapshot,
      isSubmitting,
    };
  });

  // Submit test handler (stable callback that reads latest state from stateRef)
  const handleFinalSubmit = useCallback(
    async (isAutoSubmit: boolean = false) => {
      const {
        currentQuestionId: curQId,
        timings: curTimings,
        attempt: curAttempt,
        responses: curResponses,
        answerHistory: curHistory,
        visitStatuses: curVisits,
        timerSnapshot: curTimer,
        isSubmitting: currentlySubmitting,
      } = stateRef.current;

      if (!attemptId || currentlySubmitting) return;
      setIsSubmitting(true);
      try {
        // Record time for current question
        const now = Date.now();
        const deltaSec = Math.max(0, Math.floor((now - questionEnteredTimeRef.current) / 1000));
        const curTiming = curTimings[curQId] || { timeSpentSeconds: 0, visitCount: 1 };
        const updatedTimings = {
          ...curTimings,
          [curQId]: {
            ...curTiming,
            timeSpentSeconds: curTiming.timeSpentSeconds + deltaSec,
          },
        };

        // Save latest state
        if (curAttempt) {
          await assessmentRepository.updateAttempt({
            ...curAttempt,
            responses: curResponses,
            answerHistory: curHistory,
            visitStatuses: curVisits,
            timings: updatedTimings,
            totalElapsedSeconds: curTimer.elapsedSeconds,
          });
        }

        // Authoritative evaluation
        const scored = await assessmentRepository.submitAttempt(attemptId, isAutoSubmit);
        await sendNativeNotification(
          'Exam Completed',
          `Your attempt for "${curAttempt?.snapshot.testTitle || 'Test'}" has been successfully submitted and scored.`
        );
        navigate(`/result/${scored.id}`);
      } catch (err: any) {
        alert(`Submission failed: ${err.message || 'Unknown error'}`);
        setIsSubmitting(false);
      }
    },
    [attemptId, navigate]
  );

  const handleFinalSubmitRef = useRef(handleFinalSubmit);
  useEffect(() => {
    handleFinalSubmitRef.current = handleFinalSubmit;
  }, [handleFinalSubmit]);

  // Load Attempt from Repository (Runs once per attemptId, NEVER on timer/navigation changes)
  useEffect(() => {
    let mounted = true;
    const fetchAttempt = async () => {
      if (!attemptId) return;
      try {
        const att = await assessmentRepository.getAttemptById(attemptId);
        if (!att) {
          alert('Attempt not found!');
          navigate('/');
          return;
        }

        if (att.status === 'SCORED' || att.status === 'SUBMITTED' || att.status === 'AUTO_SUBMITTED') {
          navigate(`/result/${att.id}`);
          return;
        }

        if (!mounted) return;

        setAttempt(att);
        setResponses(att.responses || {});
        setVisitStatuses(att.visitStatuses || {});
        setTimings(att.timings || {});
        setAnswerHistory(att.answerHistory || {});

        const initialSec = att.currentSectionId || att.snapshot.sections[0]?.id || '';
        const initialQ =
          att.currentQuestionId || att.snapshot.sections.find((s) => s.id === initialSec)?.questions[0]?.id || '';
        setCurrentSectionId(initialSec);
        setCurrentQuestionId(initialQ);

        // Initialize Timing Engine with stable ref callback
        const engine = new TimingEngine(att.snapshot.timing, att.totalElapsedSeconds || 0, () => {
          handleFinalSubmitRef.current(true);
        });
        engine.start();
        timerEngineRef.current = engine;
        setTimerSnapshot(engine.getSnapshot());

        questionEnteredTimeRef.current = Date.now();
      } catch (err) {
        console.error('Failed to load attempt:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchAttempt();

    return () => {
      mounted = false;
    };
  }, [attemptId, navigate]);

  // Timer interval tick (every 1 second)
  useEffect(() => {
    const interval = setInterval(() => {
      if (timerEngineRef.current) {
        const snap = timerEngineRef.current.sync();
        setTimerSnapshot(snap);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Sync to database periodically or on action with exact target coordinates
  const syncToDb = async (
    newResponses = responses,
    newVisits = visitStatuses,
    newTimings = timings,
    newHistory = answerHistory,
    targetSectionId = currentSectionId,
    targetQuestionId = currentQuestionId
  ) => {
    if (!attempt) return;
    try {
      await assessmentRepository.updateAttempt({
        ...attempt,
        currentSectionId: targetSectionId,
        currentQuestionId: targetQuestionId,
        responses: newResponses,
        answerHistory: newHistory,
        visitStatuses: newVisits,
        timings: newTimings,
        totalElapsedSeconds: timerSnapshot.elapsedSeconds,
        remainingSeconds: timerSnapshot.remainingSeconds,
      });
    } catch (err) {
      console.error('Failed to sync attempt state:', err);
    }
  };

  // Switch current question safely and synchronously update DB coordinates
  const navigateToQuestion = (
    secId: string,
    qId: string,
    overrideVisits?: Record<string, QuestionVisitStatus>
  ) => {
    if (secId === currentSectionId && qId === currentQuestionId) return;

    // Record time spent on leaving question
    const now = Date.now();
    const deltaSec = Math.max(0, Math.floor((now - questionEnteredTimeRef.current) / 1000));
    const curTiming = timings[currentQuestionId] || { timeSpentSeconds: 0, visitCount: 0 };
    const updatedTimings = {
      ...timings,
      [currentQuestionId]: {
        timeSpentSeconds: curTiming.timeSpentSeconds + deltaSec,
        visitCount: curTiming.visitCount + 1,
      },
    };
    setTimings(updatedTimings);

    // If destination question was NOT_VISITED, mark it as SKIPPED (visited)
    const updatedVisits = { ...(overrideVisits || visitStatuses) };
    if (!updatedVisits[qId] || updatedVisits[qId] === 'NOT_VISITED') {
      updatedVisits[qId] = 'SKIPPED';
    }
    setVisitStatuses(updatedVisits);

    setCurrentSectionId(secId);
    setCurrentQuestionId(qId);
    questionEnteredTimeRef.current = Date.now();
    setShowMobilePalette(false);

    // Audit event
    if (attemptId) {
      assessmentRepository.recordEvent(attemptId, {
        type: 'QUESTION_VIEWED',
        sectionId: secId,
        questionId: qId,
      });
    }

    syncToDb(responses, updatedVisits, updatedTimings, answerHistory, secId, qId);
  };

  // Handle Response Change
  const handleResponseChange = (value: any) => {
    const updatedResponses = { ...responses, [currentQuestionId]: value };
    setResponses(updatedResponses);

    // Record answer change history
    const now = Date.now();
    const deltaSec = Math.max(0, Math.floor((now - questionEnteredTimeRef.current) / 1000));
    const currentQHistory = answerHistory[currentQuestionId] || [];
    const updatedHistory = {
      ...answerHistory,
      [currentQuestionId]: [
        ...currentQHistory,
        { timestamp: new Date().toISOString(), response: value, timeSpentSeconds: deltaSec },
      ],
    };
    setAnswerHistory(updatedHistory);

    // Update visit status
    const currentVisit = visitStatuses[currentQuestionId];
    const isMarked = currentVisit === 'MARKED_FOR_REVIEW' || currentVisit === 'ANSWERED_AND_MARKED';
    const newStatus = resolveQuestionVisitStatus(value !== undefined && value !== '', isMarked);

    const updatedVisits = { ...visitStatuses, [currentQuestionId]: newStatus };
    setVisitStatuses(updatedVisits);

    if (attemptId) {
      assessmentRepository.recordEvent(attemptId, {
        type: 'QUESTION_ANSWERED',
        sectionId: currentSectionId,
        questionId: currentQuestionId,
        payload: { value },
      });
    }

    syncToDb(updatedResponses, updatedVisits, timings, updatedHistory, currentSectionId, currentQuestionId);
  };

  // Action: Save & Next
  const handleSaveAndNext = () => {
    if (!attempt) return;
    const hasResp = responses[currentQuestionId] !== undefined && responses[currentQuestionId] !== '';
    const newStatus = resolveQuestionVisitStatus(hasResp, false);
    const updatedVisits = { ...visitStatuses, [currentQuestionId]: newStatus };
    setVisitStatuses(updatedVisits);

    const next = getNextQuestion(attempt.snapshot, currentSectionId, currentQuestionId);
    if (next) {
      navigateToQuestion(next.sectionId, next.questionId, updatedVisits);
    } else {
      syncToDb(responses, updatedVisits, timings, answerHistory, currentSectionId, currentQuestionId);
    }
  };

  // Action: Mark for Review & Next
  const handleMarkForReviewAndNext = () => {
    if (!attempt) return;
    const hasResp = responses[currentQuestionId] !== undefined && responses[currentQuestionId] !== '';
    const newStatus = resolveQuestionVisitStatus(hasResp, true);
    const updatedVisits = { ...visitStatuses, [currentQuestionId]: newStatus };
    setVisitStatuses(updatedVisits);

    if (attemptId) {
      assessmentRepository.recordEvent(attemptId, {
        type: 'QUESTION_MARKED',
        sectionId: currentSectionId,
        questionId: currentQuestionId,
      });
    }

    const next = getNextQuestion(attempt.snapshot, currentSectionId, currentQuestionId);
    if (next) {
      navigateToQuestion(next.sectionId, next.questionId, updatedVisits);
    } else {
      syncToDb(responses, updatedVisits, timings, answerHistory, currentSectionId, currentQuestionId);
    }
  };

  // Action: Clear Response
  const handleClearResponse = () => {
    const updatedResponses = { ...responses };
    delete updatedResponses[currentQuestionId];
    setResponses(updatedResponses);

    const updatedVisits: Record<string, QuestionVisitStatus> = { ...visitStatuses, [currentQuestionId]: 'SKIPPED' };
    setVisitStatuses(updatedVisits);

    if (attemptId) {
      assessmentRepository.recordEvent(attemptId, {
        type: 'ANSWER_CLEARED',
        sectionId: currentSectionId,
        questionId: currentQuestionId,
      });
    }

    syncToDb(updatedResponses, updatedVisits, timings, answerHistory, currentSectionId, currentQuestionId);
  };

  // Action: Previous Question
  const handlePrevious = () => {
    if (!attempt) return;
    const prev = getPreviousQuestion(attempt.snapshot, currentSectionId, currentQuestionId);
    if (prev) {
      navigateToQuestion(prev.sectionId, prev.questionId);
    }
  };

  // Practice Mode: Check Answer
  const handleCheckAnswer = () => {
    setShowSolutionInstant((prev) => ({ ...prev, [currentQuestionId]: true }));
  };

  // Stable actions ref for keyboard shortcuts and proctoring
  const actionsRef = useRef({
    handleSaveAndNext,
    handlePrevious,
    handleMarkForReviewAndNext,
    handleClearResponse,
    setShowSubmitModal,
    toggleFullscreen,
    isExam: attempt?.snapshot?.mode === 'EXAM',
    isInProgress: attempt?.status === 'IN_PROGRESS',
  });

  useEffect(() => {
    actionsRef.current = {
      handleSaveAndNext,
      handlePrevious,
      handleMarkForReviewAndNext,
      handleClearResponse,
      setShowSubmitModal,
      toggleFullscreen,
      isExam: attempt?.snapshot?.mode === 'EXAM',
      isInProgress: attempt?.status === 'IN_PROGRESS',
    };
  }, [
    handleSaveAndNext,
    handlePrevious,
    handleMarkForReviewAndNext,
    handleClearResponse,
    setShowSubmitModal,
    toggleFullscreen,
    attempt?.snapshot?.mode,
    attempt?.status,
  ]);

  // Keyboard shortcut & native proctoring listeners (bound once)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when candidate is typing inside text inputs
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        actionsRef.current.handleSaveAndNext();
      } else if (e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        actionsRef.current.handlePrevious();
      } else if (e.altKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        actionsRef.current.handleMarkForReviewAndNext();
      } else if (e.altKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        actionsRef.current.handleClearResponse();
      } else if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        actionsRef.current.setShowSubmitModal(true);
      } else if (e.key === 'F11') {
        e.preventDefault();
        actionsRef.current.toggleFullscreen();
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      // In CBT Exam mode, suppress web context menu to maintain exam integrity
      if (actionsRef.current.isExam) {
        e.preventDefault();
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (actionsRef.current.isInProgress) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  if (loading || !attempt) {
    return (
      <div className="flex min-h-screen items-center justify-center p-12">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  // Robust section and question lookup across all sections
  let currentSection = attempt.snapshot.sections.find((s) => s.id === currentSectionId);
  let currentQuestion: QuestionModel | undefined =
    currentSection?.questions.find((q) => q.id === currentQuestionId);

  // If question was not in currentSection, search across all sections to auto-correct section
  if (!currentQuestion) {
    for (const sec of attempt.snapshot.sections) {
      const found = sec.questions.find((q) => q.id === currentQuestionId);
      if (found) {
        currentSection = sec;
        currentQuestion = found;
        break;
      }
    }
  }

  // Fallback to first available question if still not found
  if (!currentSection) currentSection = attempt.snapshot.sections[0];
  if (!currentQuestion && currentSection) currentQuestion = currentSection.questions[0];

  const isPractice = attempt.snapshot.mode === 'PRACTICE';
  const hasTimer = attempt.snapshot.timing.mode !== 'NONE' && attempt.snapshot.timing.totalDurationSeconds > 0;

  // Counts for palette
  let answeredCount = 0;
  let skippedCount = 0;
  let markedCount = 0;
  let answeredMarkedCount = 0;
  let notVisitedCount = 0;

  attempt.snapshot.sections.forEach((sec) => {
    sec.questions.forEach((q) => {
      const st = visitStatuses[q.id] || 'NOT_VISITED';
      if (st === 'ANSWERED') answeredCount++;
      else if (st === 'SKIPPED') skippedCount++;
      else if (st === 'MARKED_FOR_REVIEW') markedCount++;
      else if (st === 'ANSWERED_AND_MARKED') answeredMarkedCount++;
      else notVisitedCount++;
    });
  });

  return (
    <div className="bg-base-200/30 flex min-h-screen flex-col font-sans select-none">
      {/* ======================================================================
          CBT Header Bar
         ====================================================================== */}
      <header className="bg-base-100 border-base-300 sticky top-0 z-40 flex items-center justify-between border-b px-4 py-2.5 shadow-xs md:px-8">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 text-primary rounded-lg p-2 font-bold hidden sm:block">CBT</div>
          <div>
            <h1 className="text-base font-bold md:text-lg line-clamp-1">{attempt.snapshot.testTitle}</h1>
            <div className="text-xs text-base-content/60 flex items-center gap-2">
              <span className="badge badge-xs badge-neutral uppercase font-mono">{attempt.snapshot.mode}</span>
              <span className="hidden sm:inline">Attempt #{attempt.id.slice(-6)}</span>
            </div>
          </div>
        </div>

        {/* Center/Right: Timer & Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {hasTimer ? (
            <div
              className={`flex items-center gap-1.5 sm:gap-2 rounded-xl border px-3 sm:px-4 py-1.5 font-mono text-sm sm:text-base font-bold shadow-xs transition-colors ${
                timerSnapshot.isWarning
                  ? 'border-error/60 bg-error/15 text-error animate-pulse'
                  : 'border-base-300 bg-base-200/80 text-base-content'
              }`}
            >
              <Clock className="size-3.5 sm:size-4 shrink-0" />
              <span>{formatTimeSeconds(timerSnapshot.remainingSeconds)}</span>
              {isPractice && (
                <button
                  type="button"
                  onClick={() => {
                    if (timerSnapshot.state === 'RUNNING') timerEngineRef.current?.pause();
                    else timerEngineRef.current?.resume();
                    setTimerSnapshot(timerEngineRef.current!.getSnapshot());
                  }}
                  className="btn btn-ghost btn-xs btn-circle ml-1"
                >
                  {timerSnapshot.state === 'RUNNING' ? <Pause className="size-3" /> : <Play className="size-3" />}
                </button>
              )}
            </div>
          ) : (
            <div className="badge badge-outline border-base-300 gap-1.5 py-3 font-mono text-xs">
              <Clock className="size-3" />
              Elapsed: {formatTimeSeconds(timerSnapshot.elapsedSeconds)}
            </div>
          )}

          {/* Fullscreen Proctoring Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            className="btn btn-ghost btn-sm btn-circle hidden md:flex"
          >
            {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>

          {/* Mobile Palette Button */}
          <button
            type="button"
            onClick={() => setShowMobilePalette(true)}
            className="btn btn-outline btn-sm gap-1 lg:hidden"
          >
            <Grid className="size-4" />
            <span className="text-xs">Palette</span>
          </button>

          {/* Finish / Submit Test button */}
          <button onClick={() => setShowSubmitModal(true)} className="btn btn-primary btn-sm gap-1.5 font-bold shadow-sm">
            <Send className="size-3.5" />
            <span className="hidden sm:inline">Finish & Submit</span>
            <span className="sm:hidden">Submit</span>
          </button>
        </div>
      </header>

      {/* ======================================================================
          Section Navigation Bar
         ====================================================================== */}
      <div className="bg-base-100 border-base-300 flex items-center gap-2 border-b px-4 py-2 overflow-x-auto md:px-8">
        <span className="text-xs font-semibold text-base-content/60 uppercase mr-1 shrink-0">Sections:</span>
        <div className="flex items-center gap-2">
          {attempt.snapshot.sections.map((sec) => {
            const isActive = sec.id === currentSectionId;
            return (
              <button
                key={sec.id}
                onClick={() => {
                  const firstQ = sec.questions[0];
                  if (firstQ) navigateToQuestion(sec.id, firstQ.id);
                }}
                className={`btn btn-sm font-semibold transition-all shrink-0 ${
                  isActive ? 'btn-primary shadow-xs' : 'btn-ghost text-base-content/80 hover:bg-base-200'
                }`}
              >
                {sec.title}
                <span className="badge badge-xs font-mono ml-1">{sec.questions.length}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ======================================================================
          Main Examination Split Layout
         ====================================================================== */}
      <div className="flex flex-1 flex-col lg:flex-row overflow-hidden pb-6 md:pb-0">
        {/* Left/Center: Question Stimulus & Response Form */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
          {currentQuestion ? (
            <div className="bg-base-100 border-base-300 rounded-box border p-5 md:p-6 shadow-sm space-y-6">
              {/* Question Header */}
              <div className="border-base-300 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
                <div className="flex items-center gap-2">
                  <span className="text-primary text-lg font-extrabold tracking-tight">
                    Question {currentSection.questions.findIndex((q) => q.id === currentQuestion.id) + 1}
                  </span>
                  <span className="badge badge-outline border-base-300 text-xs font-mono">
                    {currentQuestion.type}
                  </span>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 text-xs font-semibold">
                  <span className="text-success bg-success/10 rounded-md px-2 py-1">
                    Correct: +{currentQuestion.marks}
                  </span>
                  <span className="text-error bg-error/10 rounded-md px-2 py-1">
                    Incorrect: -{currentQuestion.negativeMarks}
                  </span>
                </div>
              </div>

              {/* Question Image if any */}
              {currentQuestion.imageUrl && (
                <div className="max-w-md overflow-hidden rounded-xl border border-base-300">
                  <img
                    src={currentQuestion.imageUrl}
                    alt={currentQuestion.imageAlt || 'Question diagram'}
                    className="w-full object-cover"
                  />
                </div>
              )}

              {/* Question Body with KaTeX Math */}
              <div className="text-base leading-relaxed md:text-lg">
                <MathRenderer content={currentQuestion.body} />
              </div>

              {/* Interactive Candidate Response Input */}
              <div className="border-base-300 border-t pt-6">
                <QuestionInput
                  key={currentQuestion.id}
                  question={currentQuestion}
                  response={responses[currentQuestion.id]}
                  onChange={handleResponseChange}
                />
              </div>

              {/* Practice Mode: Instant Check Answer & Verified Solution */}
              {isPractice && (
                <div className="border-base-300 border-t pt-4 space-y-4">
                  <div className="flex items-center gap-3">
                    <button onClick={handleCheckAnswer} className="btn btn-secondary btn-sm gap-2">
                      <CheckCircle2 className="size-4" />
                      Check Answer
                    </button>
                    {currentQuestion.solution && (
                      <button
                        onClick={() =>
                          setShowSolutionInstant((prev) => ({
                            ...prev,
                            [currentQuestion.id]: !prev[currentQuestion.id],
                          }))
                        }
                        className="btn btn-ghost btn-sm gap-1.5 text-primary font-semibold"
                      >
                        <Eye className="size-4" />
                        {showSolutionInstant[currentQuestion.id] ? 'Hide Solution' : 'Show Solution'}
                      </button>
                    )}
                  </div>

                  {showSolutionInstant[currentQuestion.id] && currentQuestion.solution && (
                    <div className="bg-base-200/80 border-base-300 rounded-xl border p-4 text-sm animate-fade-in">
                      <div className="text-primary flex items-center gap-1.5 mb-2 text-xs font-bold uppercase tracking-wider">
                        <Sparkles className="size-4" />
                        Verified Derivation & Explanation
                      </div>
                      <MathRenderer content={currentQuestion.solution} />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center p-8">Question not found.</div>
          )}

          {/* Bottom Action Controls */}
          <div className="bg-base-100 border-base-300 rounded-box flex flex-wrap items-center justify-between gap-3 border p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleMarkForReviewAndNext}
                className="btn btn-outline border-purple-500/50 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 btn-sm gap-1.5"
              >
                <Bookmark className="size-4" />
                <span className="hidden sm:inline">Mark for Review & Next</span>
                <span className="sm:hidden">Review</span>
              </button>
              <button
                type="button"
                onClick={handleClearResponse}
                className="btn btn-ghost btn-sm text-base-content/70 gap-1.5"
              >
                <RotateCcw className="size-3.5" />
                Clear
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button type="button" onClick={handlePrevious} className="btn btn-outline border-base-300 btn-sm gap-1">
                <ChevronLeft className="size-4" />
                Previous
              </button>
              <button type="button" onClick={handleSaveAndNext} className="btn btn-primary btn-sm gap-1 font-bold">
                Save & Next
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ====================================================================
            Right Column: Official CBT Question Palette (Desktop Split View)
           ==================================================================== */}
        <aside className="bg-base-100 border-base-300 w-full border-t lg:w-80 lg:border-t-0 lg:border-l p-4 hidden lg:flex flex-col justify-between overflow-y-auto">
          <div className="space-y-5">
            {/* Palette Status Legend (Section 37 Non-color accessible) */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-base-content/70">Question Palette</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="size-5 rounded-md bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold">
                    ✓
                  </span>
                  <span>Answered ({answeredCount})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-5 rounded-md bg-rose-500 text-white flex items-center justify-center text-[10px] font-bold">
                    ✕
                  </span>
                  <span>Not Answered ({skippedCount})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-5 rounded-md bg-purple-600 text-white flex items-center justify-center text-[10px] font-bold">
                    •
                  </span>
                  <span>Review ({markedCount})</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-5 rounded-md bg-purple-600 text-white border-2 border-emerald-400 flex items-center justify-center text-[10px] font-bold">
                    ★
                  </span>
                  <span>Ans & Review ({answeredMarkedCount})</span>
                </div>
                <div className="flex items-center gap-2 col-span-2">
                  <span className="size-5 rounded-md bg-base-300 flex items-center justify-center text-[10px] font-bold">
                    —
                  </span>
                  <span>Not Visited ({notVisitedCount})</span>
                </div>
              </div>
            </div>

            {/* Questions Grid for Current Section */}
            <div className="border-base-300 border-t pt-4">
              <div className="text-xs font-semibold text-base-content/60 mb-2">
                Questions in {currentSection.title}:
              </div>
              <div className="grid grid-cols-5 gap-2">
                {currentSection.questions.map((q, idx) => {
                  const isCurrent = q.id === currentQuestionId;
                  const status = visitStatuses[q.id] || 'NOT_VISITED';

                  let bgStyle = 'bg-base-200 text-base-content/70 border-base-300';
                  if (status === 'ANSWERED') {
                    bgStyle = 'bg-emerald-500 text-white border-emerald-600 shadow-xs';
                  } else if (status === 'SKIPPED') {
                    bgStyle = 'bg-rose-500 text-white border-rose-600 shadow-xs';
                  } else if (status === 'MARKED_FOR_REVIEW') {
                    bgStyle = 'bg-purple-600 text-white border-purple-700 shadow-xs';
                  } else if (status === 'ANSWERED_AND_MARKED') {
                    bgStyle = 'bg-purple-600 text-white border-emerald-400 ring-2 ring-emerald-400 shadow-xs';
                  }

                  return (
                    <button
                      key={q.id}
                      onClick={() => navigateToQuestion(currentSection.id, q.id)}
                      className={`btn btn-sm aspect-square p-0 font-bold border transition-all ${bgStyle} ${
                        isCurrent ? 'ring-2 ring-primary ring-offset-2' : ''
                      }`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Quick Submit button at bottom of drawer */}
          <div className="border-base-300 border-t pt-4 mt-6">
            <button
              onClick={() => setShowSubmitModal(true)}
              className="btn btn-outline btn-primary w-full gap-2 font-bold"
            >
              <Send className="size-4" />
              Submit Entire Test
            </button>
          </div>
        </aside>
      </div>

      {/* ======================================================================
          Mobile Palette Modal / Drawer
         ====================================================================== */}
      {showMobilePalette && (
        <div className="modal modal-open modal-bottom lg:hidden bg-black/60 backdrop-blur-xs z-50">
          <div className="modal-box border-base-300 max-w-lg border p-5">
            <div className="flex items-center justify-between border-b pb-3 mb-4">
              <h3 className="font-bold text-base">Question Palette — {currentSection.title}</h3>
              <button
                type="button"
                onClick={() => setShowMobilePalette(false)}
                className="btn btn-ghost btn-sm btn-circle"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Mobile Status Legend */}
            <div className="grid grid-cols-2 gap-2 text-xs mb-4">
              <div className="flex items-center gap-1.5">
                <span className="size-4 rounded-md bg-emerald-500 text-white flex items-center justify-center text-[9px] font-bold">✓</span>
                <span>Answered ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-4 rounded-md bg-rose-500 text-white flex items-center justify-center text-[9px] font-bold">✕</span>
                <span>Skipped ({skippedCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-4 rounded-md bg-purple-600 text-white flex items-center justify-center text-[9px] font-bold">•</span>
                <span>Review ({markedCount + answeredMarkedCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-4 rounded-md bg-base-300 flex items-center justify-center text-[9px] font-bold">—</span>
                <span>Unvisited ({notVisitedCount})</span>
              </div>
            </div>

            {/* Mobile Grid */}
            <div className="grid grid-cols-5 gap-2 max-h-60 overflow-y-auto p-1">
              {currentSection.questions.map((q, idx) => {
                const isCurrent = q.id === currentQuestionId;
                const status = visitStatuses[q.id] || 'NOT_VISITED';

                let bgStyle = 'bg-base-200 text-base-content/70 border-base-300';
                if (status === 'ANSWERED') bgStyle = 'bg-emerald-500 text-white border-emerald-600';
                else if (status === 'SKIPPED') bgStyle = 'bg-rose-500 text-white border-rose-600';
                else if (status === 'MARKED_FOR_REVIEW') bgStyle = 'bg-purple-600 text-white border-purple-700';
                else if (status === 'ANSWERED_AND_MARKED') bgStyle = 'bg-purple-600 text-white border-emerald-400 ring-2 ring-emerald-400';

                return (
                  <button
                    key={q.id}
                    onClick={() => navigateToQuestion(currentSection.id, q.id)}
                    className={`btn btn-sm aspect-square p-0 font-bold border transition-all ${bgStyle} ${
                      isCurrent ? 'ring-2 ring-primary ring-offset-2' : ''
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="modal-action border-t pt-3 mt-4">
              <button
                type="button"
                onClick={() => {
                  setShowMobilePalette(false);
                  setShowSubmitModal(true);
                }}
                className="btn btn-primary btn-sm w-full gap-2 font-bold"
              >
                <Send className="size-4" />
                Finish & Submit Test
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          Submit Confirmation Modal
         ====================================================================== */}
      {showSubmitModal && (
        <div className="modal modal-open modal-bottom sm:modal-middle bg-black/60 backdrop-blur-xs z-50">
          <div className="modal-box border-base-300 max-w-lg border p-6">
            <div className="flex items-center gap-3 text-warning mb-2">
              <AlertTriangle className="size-6" />
              <h3 className="text-xl font-bold text-base-content">Submit Test Confirmation</h3>
            </div>
            <p className="text-sm text-base-content/70">
              Are you sure you want to finish your test? You will not be able to change your answers once submitted.
            </p>

            {/* Candidate Summary Stats */}
            <div className="bg-base-200/60 rounded-xl border border-base-300 my-4 p-4 grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-base-content/70">Total Answered:</span>
                <span className="font-bold text-emerald-500">{answeredCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-base-content/70">Not Answered:</span>
                <span className="font-bold text-rose-500">{skippedCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-base-content/70">Marked for Review:</span>
                <span className="font-bold text-purple-500">{markedCount + answeredMarkedCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-base-content/70">Not Visited:</span>
                <span className="font-bold text-base-content/60">{notVisitedCount}</span>
              </div>
            </div>

            <div className="modal-action">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                disabled={isSubmitting}
                className="btn btn-ghost"
              >
                Continue Test
              </button>
              <button
                type="button"
                onClick={() => handleFinalSubmit(false)}
                disabled={isSubmitting}
                className="btn btn-primary gap-2 font-bold"
              >
                {isSubmitting ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : (
                  <Send className="size-4" />
                )}
                Confirm & Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
