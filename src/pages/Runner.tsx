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
    <div className="bg-background text-foreground flex min-h-screen flex-col font-sans select-none">
      {/* ======================================================================
          CBT Header Bar (Native Window Drag Region)
         ====================================================================== */}
      <header
        data-tauri-drag-region
        className="bg-card border-border sticky top-0 z-40 flex items-center justify-between border-b px-4 py-2 shadow-2xs md:px-6"
      >
        <div data-tauri-drag-region className="flex items-center gap-2.5">
          <div className="bg-primary/10 text-primary rounded-md px-1.5 py-0.5 text-xs font-bold hidden sm:block pointer-events-none">
            CBT
          </div>
          <div data-tauri-drag-region>
            <h1 className="text-sm font-semibold md:text-base line-clamp-1 tracking-tight text-foreground">{attempt.snapshot.testTitle}</h1>
            <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <span className="badge badge-xs badge-neutral uppercase font-mono">{attempt.snapshot.mode}</span>
              <span className="hidden sm:inline">Attempt #{attempt.id.slice(-6)}</span>
            </div>
          </div>
        </div>

        {/* Center/Right: Timer & Controls */}
        <div className="flex items-center gap-2">
          {hasTimer ? (
            <div
              role="timer"
              aria-live="polite"
              aria-label={`Time remaining: ${formatTimeSeconds(timerSnapshot.remainingSeconds)}`}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs sm:text-sm font-semibold shadow-2xs transition-colors ${
                timerSnapshot.isWarning
                  ? 'border-error/60 bg-error/15 text-error animate-pulse'
                  : 'border-border bg-muted/60 text-foreground'
              }`}
            >
              <Clock className="size-3.5 shrink-0" />
              <span>{formatTimeSeconds(timerSnapshot.remainingSeconds)}</span>
              {isPractice && (
                <button
                  type="button"
                  onClick={() => {
                    if (timerSnapshot.state === 'RUNNING') timerEngineRef.current?.pause();
                    else timerEngineRef.current?.resume();
                    setTimerSnapshot(timerEngineRef.current!.getSnapshot());
                  }}
                  className="btn btn-ghost btn-xs btn-circle ml-0.5 active:scale-90"
                  aria-label={timerSnapshot.state === 'RUNNING' ? 'Pause timer' : 'Resume timer'}
                >
                  {timerSnapshot.state === 'RUNNING' ? <Pause className="size-3" /> : <Play className="size-3" />}
                </button>
              )}
            </div>
          ) : (
            <div
              role="timer"
              aria-label={`Elapsed time: ${formatTimeSeconds(timerSnapshot.elapsedSeconds)}`}
              className="badge badge-outline border-border gap-1 py-2 font-mono text-xs text-muted-foreground"
            >
              <Clock className="size-3" />
              Elapsed: {formatTimeSeconds(timerSnapshot.elapsedSeconds)}
            </div>
          )}

          {/* Fullscreen Proctoring Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            className="btn btn-ghost btn-xs btn-circle hidden md:flex text-muted-foreground hover:text-foreground active:scale-90"
          >
            {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>

          {/* Mobile Palette Button */}
          <button
            type="button"
            onClick={() => setShowMobilePalette(true)}
            aria-label="Open Question Palette"
            className="btn btn-outline btn-xs gap-1 lg:hidden active:scale-95"
          >
            <Grid className="size-3.5" />
            <span>Palette</span>
          </button>

          {/* Finish / Submit Test button */}
          <button
            onClick={() => setShowSubmitModal(true)}
            className="btn btn-primary btn-sm gap-1.5 font-medium shadow-xs active:scale-95"
          >
            <Send className="size-3" />
            <span className="hidden sm:inline">Finish & Submit</span>
            <span className="sm:hidden">Submit</span>
          </button>
        </div>
      </header>

      {/* ======================================================================
          Section Navigation Bar
         ====================================================================== */}
      <nav aria-label="Exam Sections" className="bg-card border-border flex items-center gap-1.5 border-b px-4 py-1.5 overflow-x-auto md:px-6">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase mr-1 shrink-0">Sections:</span>
        <div className="flex items-center gap-1.5">
          {attempt.snapshot.sections.map((sec) => {
            const isActive = sec.id === currentSectionId;
            return (
              <button
                key={sec.id}
                onClick={() => {
                  const firstQ = sec.questions[0];
                  if (firstQ) navigateToQuestion(sec.id, firstQ.id);
                }}
                aria-current={isActive ? 'true' : undefined}
                className={`btn btn-xs font-medium transition-all shrink-0 rounded-md active:scale-95 ${
                  isActive ? 'btn-primary shadow-2xs' : 'btn-ghost text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {sec.title}
                <span className="badge badge-xs font-mono ml-1">{sec.questions.length}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ======================================================================
          Main Examination Split Layout
         ====================================================================== */}
      <div className="flex flex-1 flex-col lg:flex-row overflow-hidden pb-6 md:pb-0">
        {/* Left/Center: Question Stimulus & Response Form */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          {currentQuestion ? (
            <div className="bg-card border-border rounded-lg border p-4 md:p-6 shadow-2xs space-y-5">
              {/* Question Header */}
              <div className="border-border/60 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-primary text-base font-bold tracking-tight">
                    Question {currentSection.questions.findIndex((q) => q.id === currentQuestion.id) + 1}
                  </span>
                  <span className="badge badge-outline border-border/80 text-[11px] font-mono">
                    {currentQuestion.type}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs font-medium">
                  <span className="text-success bg-success/10 rounded px-1.5 py-0.5">
                    +{currentQuestion.marks}
                  </span>
                  <span className="text-error bg-error/10 rounded px-1.5 py-0.5">
                    -{currentQuestion.negativeMarks}
                  </span>
                </div>
              </div>

              {/* Question Image if any */}
              {currentQuestion.imageUrl && (
                <div className="max-w-md overflow-hidden rounded-md border border-border/60">
                  <img
                    src={currentQuestion.imageUrl}
                    alt={currentQuestion.imageAlt || 'Question diagram'}
                    className="w-full object-cover"
                  />
                </div>
              )}

              {/* Question Body with KaTeX Math (Selectable for student copying) */}
              <div className="selectable-content text-sm leading-relaxed md:text-base">
                <MathRenderer content={currentQuestion.body} />
              </div>

              {/* Interactive Candidate Response Input */}
              <div className="border-border/60 border-t pt-4">
                <QuestionInput
                  key={currentQuestion.id}
                  question={currentQuestion}
                  response={responses[currentQuestion.id]}
                  onChange={handleResponseChange}
                />
              </div>

              {/* Practice Mode: Instant Check Answer & Verified Solution */}
              {isPractice && (
                <div className="border-border/60 border-t pt-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <button onClick={handleCheckAnswer} className="btn btn-outline btn-xs gap-1.5 active:scale-95">
                      <CheckCircle2 className="size-3.5 text-success" />
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
                        className="btn btn-ghost btn-xs gap-1 text-primary font-medium active:scale-95"
                      >
                        <Eye className="size-3.5" />
                        {showSolutionInstant[currentQuestion.id] ? 'Hide Solution' : 'Show Solution'}
                      </button>
                    )}
                  </div>

                  {showSolutionInstant[currentQuestion.id] && currentQuestion.solution && (
                    <div className="bg-muted/40 border-border/60 rounded-md border p-3.5 text-xs animate-fade-in selectable-content">
                      <div className="text-primary flex items-center gap-1.5 mb-1.5 text-[11px] font-bold uppercase tracking-wider">
                        <Sparkles className="size-3.5" />
                        Explanation & Solution
                      </div>
                      <MathRenderer content={currentQuestion.solution} />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center p-8 text-muted-foreground text-sm">Question not found.</div>
          )}

          {/* Bottom Action Controls */}
          <div className="bg-card border-border rounded-lg flex flex-wrap items-center justify-between gap-2 border p-3 shadow-2xs">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleMarkForReviewAndNext}
                className="btn btn-outline border-border text-foreground/80 hover:bg-muted btn-sm gap-1.5 text-xs font-medium rounded-md active:scale-95"
              >
                <Bookmark className="size-3.5 text-amber-500" />
                <span className="hidden sm:inline">Mark for Review & Next</span>
                <span className="sm:hidden">Review</span>
              </button>
              <button
                type="button"
                onClick={handleClearResponse}
                className="btn btn-ghost btn-sm text-xs text-muted-foreground hover:text-foreground gap-1.5 rounded-md active:scale-95"
              >
                <RotateCcw className="size-3" />
                Clear
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <button type="button" onClick={handlePrevious} className="btn btn-outline border-border btn-sm text-xs font-medium rounded-md gap-1 active:scale-95">
                <ChevronLeft className="size-3.5" />
                Previous
              </button>
              <button type="button" onClick={handleSaveAndNext} className="btn btn-primary btn-sm text-xs font-medium rounded-md gap-1 active:scale-95">
                Save & Next
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          </div>
        </main>

        {/* ====================================================================
            Right Column: Official CBT Question Palette (Desktop Split View)
           ==================================================================== */}
        <aside aria-label="Question Palette" className="bg-card border-border w-full border-t lg:w-72 lg:border-t-0 lg:border-l p-3.5 hidden lg:flex flex-col justify-between overflow-y-auto">
          <div className="space-y-4">
            {/* Palette Status Legend (Section 37 Non-color accessible) */}
            <div className="space-y-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Question Palette</h4>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="size-4.5 rounded bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold">
                    ✓
                  </span>
                  <span className="text-[11px]">Answered ({answeredCount})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="size-4.5 rounded bg-rose-600 text-white flex items-center justify-center text-[10px] font-bold">
                    ✕
                  </span>
                  <span className="text-[11px]">Skipped ({skippedCount})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="size-4.5 rounded bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold">
                    •
                  </span>
                  <span className="text-[11px]">Review ({markedCount})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="size-4.5 rounded bg-amber-500 text-white ring-2 ring-emerald-400 flex items-center justify-center text-[10px] font-bold">
                    ★
                  </span>
                  <span className="text-[11px]">Ans & Rev ({answeredMarkedCount})</span>
                </div>
                <div className="flex items-center gap-1.5 col-span-2">
                  <span className="size-4.5 rounded bg-muted text-muted-foreground border border-border flex items-center justify-center text-[10px] font-bold">
                    -
                  </span>
                  <span className="text-[11px]">Unvisited ({notVisitedCount})</span>
                </div>
              </div>
            </div>

            {/* Questions Grid for Current Section */}
            <div className="border-border/60 border-t pt-3">
              <div className="text-[11px] font-semibold text-muted-foreground mb-2">
                Questions in {currentSection.title}:
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {currentSection.questions.map((q, idx) => {
                  const isCurrent = q.id === currentQuestionId;
                  const status = visitStatuses[q.id] || 'NOT_VISITED';

                  let bgStyle = 'bg-muted/60 text-muted-foreground border-border hover:bg-muted';
                  if (status === 'ANSWERED') {
                    bgStyle = 'bg-emerald-600 text-white border-emerald-700 shadow-2xs';
                  } else if (status === 'SKIPPED') {
                    bgStyle = 'bg-rose-600 text-white border-rose-700 shadow-2xs';
                  } else if (status === 'MARKED_FOR_REVIEW') {
                    bgStyle = 'bg-amber-500 text-white border-amber-600 shadow-2xs';
                  } else if (status === 'ANSWERED_AND_MARKED') {
                    bgStyle = 'bg-amber-500 text-white border-amber-600 ring-2 ring-emerald-400 shadow-2xs';
                  }

                  return (
                    <button
                      key={q.id}
                      onClick={() => navigateToQuestion(currentSection.id, q.id)}
                      aria-label={`Question ${idx + 1}, ${status.replace(/_/g, ' ').toLowerCase()}`}
                      aria-current={isCurrent ? 'page' : undefined}
                      className={`btn btn-xs aspect-square p-0 font-bold border rounded-md transition-all active:scale-90 ${bgStyle} ${
                        isCurrent ? 'ring-2 ring-primary ring-offset-1' : ''
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
          <div className="border-border border-t pt-3 mt-4">
            <button
              onClick={() => setShowSubmitModal(true)}
              className="btn btn-outline btn-primary btn-sm w-full gap-1.5 font-medium rounded-md"
            >
              <Send className="size-3.5" />
              Submit Test
            </button>
          </div>
        </aside>
      </div>

      {/* ======================================================================
          Mobile Palette Modal / Drawer
         ====================================================================== */}
      {showMobilePalette && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-palette-title"
          className="modal modal-open modal-bottom lg:hidden bg-black/40 backdrop-blur-xs z-50"
        >
          <div className="modal-box border-border max-w-sm border p-4 rounded-xl shadow-xl bg-card">
            <div className="flex items-center justify-between border-b border-border/60 pb-2.5 mb-3">
              <h3 id="mobile-palette-title" className="font-semibold text-sm">Question Palette: {currentSection.title}</h3>
              <button
                type="button"
                onClick={() => setShowMobilePalette(false)}
                aria-label="Close palette"
                className="btn btn-ghost btn-xs btn-circle active:scale-90"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {/* Mobile Status Legend */}
            <div className="grid grid-cols-2 gap-1.5 text-xs mb-3">
              <div className="flex items-center gap-1.5">
                <span className="size-4 rounded bg-emerald-600 text-white flex items-center justify-center text-[9px] font-bold">✓</span>
                <span className="text-[11px]">Answered ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-4 rounded bg-rose-600 text-white flex items-center justify-center text-[9px] font-bold">✕</span>
                <span className="text-[11px]">Skipped ({skippedCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-4 rounded bg-amber-500 text-white flex items-center justify-center text-[9px] font-bold">•</span>
                <span className="text-[11px]">Review ({markedCount + answeredMarkedCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-4 rounded bg-muted text-muted-foreground border border-border flex items-center justify-center text-[9px] font-bold">-</span>
                <span className="text-[11px]">Unvisited ({notVisitedCount})</span>
              </div>
            </div>

            {/* Mobile Grid */}
            <div className="grid grid-cols-5 gap-1.5 max-h-56 overflow-y-auto p-0.5">
              {currentSection.questions.map((q, idx) => {
                const isCurrent = q.id === currentQuestionId;
                const status = visitStatuses[q.id] || 'NOT_VISITED';

                let bgStyle = 'bg-muted/60 text-muted-foreground border-border';
                if (status === 'ANSWERED') bgStyle = 'bg-emerald-600 text-white border-emerald-700';
                else if (status === 'SKIPPED') bgStyle = 'bg-rose-600 text-white border-rose-700';
                else if (status === 'MARKED_FOR_REVIEW') bgStyle = 'bg-amber-500 text-white border-amber-600';
                else if (status === 'ANSWERED_AND_MARKED') bgStyle = 'bg-amber-500 text-white border-amber-600 ring-2 ring-emerald-400';

                return (
                  <button
                    key={q.id}
                    onClick={() => {
                      navigateToQuestion(currentSection.id, q.id);
                      setShowMobilePalette(false);
                    }}
                    aria-label={`Question ${idx + 1}, ${status.replace(/_/g, ' ').toLowerCase()}`}
                    aria-current={isCurrent ? 'page' : undefined}
                    className={`btn btn-xs aspect-square p-0 font-bold border rounded-md transition-all active:scale-90 ${bgStyle} ${
                      isCurrent ? 'ring-2 ring-primary ring-offset-1' : ''
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="modal-action border-t border-border/60 pt-2.5 mt-3">
              <button
                type="button"
                onClick={() => {
                  setShowMobilePalette(false);
                  setShowSubmitModal(true);
                }}
                className="btn btn-primary btn-sm w-full gap-1.5 font-medium rounded-md active:scale-95"
              >
                <Send className="size-3.5" />
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
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="submit-modal-title"
          className="modal modal-open modal-bottom sm:modal-middle bg-black/40 backdrop-blur-xs z-50"
        >
          <div className="modal-box border-border max-w-md border p-5 rounded-xl shadow-xl bg-card">
            <div className="flex items-center gap-2.5 text-warning mb-2">
              <AlertTriangle className="size-5 shrink-0" />
              <h3 id="submit-modal-title" className="text-base font-semibold text-foreground tracking-tight">Submit Exam</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Are you sure you want to finish your test? You will not be able to change your answers once submitted.
            </p>

            {/* Candidate Summary Stats */}
            <div className="bg-muted/40 rounded-lg border border-border my-3 p-3 grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Answered:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">{answeredCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Skipped:</span>
                <span className="font-semibold text-rose-600 dark:text-rose-400 font-mono">{skippedCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Review:</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400 font-mono">{markedCount + answeredMarkedCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Unvisited:</span>
                <span className="font-semibold text-muted-foreground font-mono">{notVisitedCount}</span>
              </div>
            </div>

            <div className="modal-action mt-3">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                disabled={isSubmitting}
                className="btn btn-ghost btn-sm text-xs rounded-md active:scale-95"
              >
                Continue Test
              </button>
              <button
                type="button"
                onClick={() => handleFinalSubmit(false)}
                disabled={isSubmitting}
                className="btn btn-primary btn-sm gap-1.5 font-medium rounded-md active:scale-95 shadow-xs"
              >
                {isSubmitting ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <Send className="size-3.5" />
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
