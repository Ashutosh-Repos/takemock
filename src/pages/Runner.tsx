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
  cleanQuestionBody,
  formatQuestionType,
} from '@/core/engine/questionPresentation';
import {
  getNextQuestion,
  getPreviousQuestion,
  resolveQuestionVisitStatus,
} from '@/core/engine/navigationEngine';
import { formatTimeSeconds, TimingEngine } from '@/core/engine/timingEngine';
import {
  sendNativeNotification,
  setWindowFullscreen,
  showNativeAlert,
} from '@/core/native/tauriBridge';
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
  const [timings, setTimings] = useState<
    Record<string, { timeSpentSeconds: number; visitCount: number }>
  >({});
  const [answerHistory, setAnswerHistory] = useState<Record<string, AnswerHistoryEntry[]>>({});

  // Synchronous mutable state refs to avoid React async batching race conditions
  const responsesRef = useRef<Record<string, any>>({});
  const visitStatusesRef = useRef<Record<string, QuestionVisitStatus>>({});
  const timingsRef = useRef<Record<string, { timeSpentSeconds: number; visitCount: number }>>({});
  const answerHistoryRef = useRef<Record<string, AnswerHistoryEntry[]>>({});

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
          `Your attempt for "${curAttempt?.snapshot.testTitle || 'Test'}" has been successfully submitted and scored.`,
        );
        navigate(`/result/${scored.id}`);
      } catch (err: any) {
        await showNativeAlert(`Submission failed: ${err.message || 'Unknown error'}`, {
          title: 'Submission Error',
          kind: 'error',
        });
        setIsSubmitting(false);
      }
    },
    [attemptId, navigate],
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
          await showNativeAlert('Attempt not found!', {
            title: 'Not Found',
            kind: 'warning',
          });
          navigate('/');
          return;
        }

        if (
          att.status === 'SCORED' ||
          att.status === 'SUBMITTED' ||
          att.status === 'AUTO_SUBMITTED'
        ) {
          navigate(`/result/${att.id}`);
          return;
        }

        if (!mounted) return;

        setAttempt(att);
        const initResp = att.responses || {};
        const initVisits = att.visitStatuses || {};
        const initTimings = att.timings || {};
        const initHistory = att.answerHistory || {};

        responsesRef.current = initResp;
        visitStatusesRef.current = initVisits;
        timingsRef.current = initTimings;
        answerHistoryRef.current = initHistory;

        setResponses(initResp);
        setVisitStatuses(initVisits);
        setTimings(initTimings);
        setAnswerHistory(initHistory);

        const initialSec = att.currentSectionId || att.snapshot.sections[0]?.id || '';
        const initialQ =
          att.currentQuestionId ||
          att.snapshot.sections.find((s) => s.id === initialSec)?.questions[0]?.id ||
          '';
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
    targetQuestionId = currentQuestionId,
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
    overrideVisits?: Record<string, QuestionVisitStatus>,
  ) => {
    if (secId === currentSectionId && qId === currentQuestionId) return;

    // Record time spent on leaving question
    const now = Date.now();
    const deltaSec = Math.max(0, Math.floor((now - questionEnteredTimeRef.current) / 1000));
    const curTiming = timingsRef.current[currentQuestionId] || { timeSpentSeconds: 0, visitCount: 0 };
    const updatedTimings = {
      ...timingsRef.current,
      [currentQuestionId]: {
        timeSpentSeconds: curTiming.timeSpentSeconds + deltaSec,
        visitCount: curTiming.visitCount + 1,
      },
    };
    timingsRef.current = updatedTimings;
    setTimings(updatedTimings);

    // If destination question was NOT_VISITED, mark it as SKIPPED (visited)
    const updatedVisits = { ...(overrideVisits || visitStatusesRef.current) };
    if (!updatedVisits[qId] || updatedVisits[qId] === 'NOT_VISITED') {
      updatedVisits[qId] = 'SKIPPED';
    }
    visitStatusesRef.current = updatedVisits;
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

    syncToDb(responsesRef.current, updatedVisits, updatedTimings, answerHistoryRef.current, secId, qId);
  };

  // Handle Response Change
  const handleResponseChange = useCallback(
    (value: any, targetQId?: string) => {
      const qId = targetQId || currentQuestionId;
      const updatedResponses = { ...responsesRef.current, [qId]: value };
      responsesRef.current = updatedResponses;
      setResponses(updatedResponses);

      // Record answer change history
      const now = Date.now();
      const deltaSec = Math.max(0, Math.floor((now - questionEnteredTimeRef.current) / 1000));
      const currentQHistory = answerHistoryRef.current[qId] || [];
      const updatedHistory = {
        ...answerHistoryRef.current,
        [qId]: [
          ...currentQHistory,
          { timestamp: new Date().toISOString(), response: value, timeSpentSeconds: deltaSec },
        ],
      };
      answerHistoryRef.current = updatedHistory;
      setAnswerHistory(updatedHistory);

      // Update visit status
      const currentVisit = visitStatusesRef.current[qId];
      const isMarked = currentVisit === 'MARKED_FOR_REVIEW' || currentVisit === 'ANSWERED_AND_MARKED';
      const newStatus = resolveQuestionVisitStatus(value !== undefined && value !== '', isMarked);

      const updatedVisits = { ...visitStatusesRef.current, [qId]: newStatus };
      visitStatusesRef.current = updatedVisits;
      setVisitStatuses(updatedVisits);

      if (attemptId) {
        assessmentRepository.recordEvent(attemptId, {
          type: 'QUESTION_ANSWERED',
          sectionId: currentSectionId,
          questionId: qId,
          payload: { value },
        });
      }

      syncToDb(
        updatedResponses,
        updatedVisits,
        timingsRef.current,
        updatedHistory,
        currentSectionId,
        qId,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attemptId, currentQuestionId, currentSectionId],
  );

  // Action: Save & Next
  const handleSaveAndNext = () => {
    if (!attempt) return;
    const curResponses = responsesRef.current;
    const hasResp =
      curResponses[currentQuestionId] !== undefined && curResponses[currentQuestionId] !== '';
    const newStatus = resolveQuestionVisitStatus(hasResp, false);
    const updatedVisits = { ...visitStatusesRef.current, [currentQuestionId]: newStatus };
    visitStatusesRef.current = updatedVisits;
    setVisitStatuses(updatedVisits);

    const next = getNextQuestion(attempt.snapshot, currentSectionId, currentQuestionId);
    if (next) {
      navigateToQuestion(next.sectionId, next.questionId, updatedVisits);
    } else {
      syncToDb(
        curResponses,
        updatedVisits,
        timingsRef.current,
        answerHistoryRef.current,
        currentSectionId,
        currentQuestionId,
      );
    }
  };

  // Action: Mark for Review & Next
  const handleMarkForReviewAndNext = () => {
    if (!attempt) return;
    const curResponses = responsesRef.current;
    const hasResp =
      curResponses[currentQuestionId] !== undefined && curResponses[currentQuestionId] !== '';
    const newStatus = resolveQuestionVisitStatus(hasResp, true);
    const updatedVisits = { ...visitStatusesRef.current, [currentQuestionId]: newStatus };
    visitStatusesRef.current = updatedVisits;
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
      syncToDb(
        curResponses,
        updatedVisits,
        timingsRef.current,
        answerHistoryRef.current,
        currentSectionId,
        currentQuestionId,
      );
    }
  };

  // Action: Clear Response
  const handleClearResponse = () => {
    const updatedResponses = { ...responsesRef.current };
    delete updatedResponses[currentQuestionId];
    responsesRef.current = updatedResponses;
    setResponses(updatedResponses);

    const currentStatus = visitStatusesRef.current[currentQuestionId];
    const isMarked =
      currentStatus === 'MARKED_FOR_REVIEW' || currentStatus === 'ANSWERED_AND_MARKED';
    const nextStatus: QuestionVisitStatus = isMarked ? 'MARKED_FOR_REVIEW' : 'SKIPPED';

    const updatedVisits: Record<string, QuestionVisitStatus> = {
      ...visitStatusesRef.current,
      [currentQuestionId]: nextStatus,
    };
    visitStatusesRef.current = updatedVisits;
    setVisitStatuses(updatedVisits);

    if (attemptId) {
      assessmentRepository.recordEvent(attemptId, {
        type: 'ANSWER_CLEARED',
        sectionId: currentSectionId,
        questionId: currentQuestionId,
      });
    }

    syncToDb(
      updatedResponses,
      updatedVisits,
      timingsRef.current,
      answerHistoryRef.current,
      currentSectionId,
      currentQuestionId,
    );
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
  const actionsRef = useRef<{
    handleSaveAndNext: () => void;
    handlePrevious: () => void;
    handleMarkForReviewAndNext: () => void;
    handleClearResponse: () => void;
    setShowSubmitModal: (show: boolean) => void;
    toggleFullscreen: () => void;
    isExam: boolean;
    isInProgress: boolean;
  } | null>(null);

  // Always keep actionsRef fresh with latest handlers
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  });

  // Keyboard shortcut & native proctoring listeners (bound once)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when candidate is typing inside text inputs
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        actionsRef.current?.handleSaveAndNext();
      } else if (e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        actionsRef.current?.handlePrevious();
      } else if (e.altKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        actionsRef.current?.handleMarkForReviewAndNext();
      } else if (e.altKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        actionsRef.current?.handleClearResponse();
      } else if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        actionsRef.current?.setShowSubmitModal(true);
      } else if (e.key === 'F11') {
        e.preventDefault();
        actionsRef.current?.toggleFullscreen();
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      // In CBT Exam mode, suppress web context menu to maintain exam integrity
      if (actionsRef.current?.isExam) {
        e.preventDefault();
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (actionsRef.current?.isInProgress) {
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
  let currentQuestion: QuestionModel | undefined = currentSection?.questions.find(
    (q) => q.id === currentQuestionId,
  );

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
  const hasTimer =
    attempt.snapshot.timing.mode !== 'NONE' && attempt.snapshot.timing.totalDurationSeconds > 0;

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

  // Helper for question palette tile styling adhering to Apple Liquid Glass & light tones
  const getPaletteItemStyles = (status: QuestionVisitStatus, isCurrent: boolean) => {
    let bgStyle =
      'bg-white/50 dark:bg-white/[0.04] text-foreground/70 border-black/[0.06] dark:border-white/[0.08] hover:bg-white/80 dark:hover:bg-white/[0.08] hover:text-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.75)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]';
    let isMarkedOnly = false;
    let isAnsAndMark = false;

    if (status === 'ANSWERED') {
      bgStyle =
        'bg-emerald-500/[0.13] dark:bg-emerald-400/[0.16] text-emerald-800 dark:text-emerald-200 border-emerald-500/25 dark:border-emerald-400/30 hover:bg-emerald-500/[0.22] dark:hover:bg-emerald-400/[0.26] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.65)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]';
    } else if (status === 'SKIPPED') {
      bgStyle =
        'bg-rose-500/[0.13] dark:bg-rose-400/[0.16] text-rose-800 dark:text-rose-200 border-rose-500/25 dark:border-rose-400/30 hover:bg-rose-500/[0.22] dark:hover:bg-rose-400/[0.26] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.65)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]';
    } else if (status === 'MARKED_FOR_REVIEW') {
      // Marked for Review (Unanswered): Pure soft purple glass with purple review tag
      isMarkedOnly = true;
      bgStyle =
        'bg-purple-500/[0.13] dark:bg-purple-400/[0.16] text-purple-800 dark:text-purple-200 border-purple-400/35 dark:border-purple-400/40 hover:bg-purple-500/[0.22] dark:hover:bg-purple-400/[0.26] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.65)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]';
    } else if (status === 'ANSWERED_AND_MARKED') {
      // Answered & Marked: Prominent Dual-tone Purple-Emerald Gradient + Emerald Border + Green Check Badge
      isAnsAndMark = true;
      bgStyle =
        'bg-gradient-to-br from-purple-500/[0.22] via-purple-500/[0.14] to-emerald-500/[0.24] dark:from-purple-500/[0.26] dark:via-purple-500/[0.18] dark:to-emerald-400/[0.28] text-purple-950 dark:text-purple-50 border-emerald-500/50 dark:border-emerald-400/55 hover:from-purple-500/[0.28] hover:to-emerald-500/[0.30] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]';
    }

    // Active state: Strictly NO outline, NO ring, NO border color change.
    // Differentiated solely by subtle elevation, gentle scale, crisp text, and Apple bottom indicator dash.
    const activeStyle = isCurrent
      ? 'font-bold brightness-110 dark:brightness-125 shadow-md shadow-black/8 dark:shadow-black/35 scale-[1.06] z-10 after:content-[""] after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-2.5 after:h-0.5 after:rounded-full after:bg-current'
      : 'font-medium';

    return { bgStyle, activeStyle, isMarkedOnly, isAnsAndMark };
  };

  return (
    <div className="text-foreground flex h-screen max-h-screen w-full flex-col overflow-hidden bg-background font-sans select-none">
      {/* ======================================================================
          CBT Header Bar (Native Window Drag Region)
         ====================================================================== */}
      <header
        data-tauri-drag-region
        className={`liquid-glass-header shrink-0 sticky top-0 z-40 flex items-center justify-between px-4 py-2 shadow-2xs transition-[padding] duration-150 md:px-6 ${
          !isFullscreen ? 'pl-19.5 md:pl-21' : ''
        }`}
      >
        <div data-tauri-drag-region className="flex items-center gap-2.5">
          <div className="bg-primary/10 text-primary pointer-events-none hidden rounded-md px-1.5 py-0.5 text-xs font-bold sm:block">
            CBT
          </div>
          <div data-tauri-drag-region>
            <h1 className="text-foreground line-clamp-1 text-sm font-semibold tracking-tight md:text-base">
              {attempt.snapshot.testTitle}
            </h1>
            <div className="text-muted-foreground flex items-center gap-1.5 text-[11px]">
              <span className="badge badge-xs badge-neutral font-mono uppercase">
                {attempt.snapshot.mode}
              </span>
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
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs font-semibold shadow-2xs transition-colors sm:text-sm ${
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
                  {timerSnapshot.state === 'RUNNING' ? (
                    <Pause className="size-3" />
                  ) : (
                    <Play className="size-3" />
                  )}
                </button>
              )}
            </div>
          ) : (
            <div
              role="timer"
              aria-label={`Elapsed time: ${formatTimeSeconds(timerSnapshot.elapsedSeconds)}`}
              className="badge badge-outline border-border text-muted-foreground gap-1 py-2 font-mono text-xs"
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
            className="btn btn-ghost btn-xs btn-circle text-muted-foreground hover:text-foreground hidden active:scale-90 md:flex"
          >
            {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>

          {/* Mobile Palette Button */}
          <button
            type="button"
            onClick={() => setShowMobilePalette(true)}
            aria-label="Open Question Palette"
            className="btn btn-outline btn-xs gap-1 active:scale-95 lg:hidden"
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
      <nav
        aria-label="Exam Sections"
        className="liquid-glass-header shrink-0 flex items-center gap-1.5 overflow-x-auto border-b px-4 py-1.5 md:px-6"
      >
        <span className="text-muted-foreground mr-1 shrink-0 text-[11px] font-semibold uppercase">
          Sections:
        </span>
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
                className={`btn btn-xs shrink-0 rounded-lg font-medium transition-all active:scale-95 ${
                  isActive
                    ? 'btn-primary shadow-xs'
                    : 'bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground border-border/60 border'
                }`}
              >
                {sec.title}
                <span className="badge badge-xs ml-1 font-mono">{sec.questions.length}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ======================================================================
          Main Examination Split Layout
         ====================================================================== */}
      <div className="flex flex-1 min-h-0 w-full overflow-hidden lg:flex-row">
        {/* Left/Center: Question Stimulus & Response Form */}
        <main className="flex flex-1 min-h-0 flex-col overflow-hidden p-3 md:p-4 lg:p-5">
          {currentQuestion ? (
            <div className="card flex flex-1 min-h-0 flex-col overflow-hidden p-4 shadow-xs md:p-5">
              {/* Question Header (Pinned inside card) */}
              <div className="border-border/60 shrink-0 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-primary text-base font-bold tracking-tight">
                    Question{' '}
                    {currentSection.questions.findIndex((q) => q.id === currentQuestion.id) + 1}
                  </span>
                  <span className="badge badge-outline border-border/80 font-mono text-[11px]">
                    {formatQuestionType(currentQuestion.type)}
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

              {/* Scrollable Question Stimulus and Input Container */}
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-4 pt-3.5 pr-1.5">
                {/* Question Image if any */}
                {currentQuestion.imageUrl && (
                  <div className="border-border/60 max-w-md overflow-hidden rounded-md border">
                    <img
                      src={currentQuestion.imageUrl}
                      alt={currentQuestion.imageAlt || 'Question diagram'}
                      className="w-full object-cover"
                    />
                  </div>
                )}

                {/* Question Body with KaTeX Math (Selectable for student copying) */}
                <div className="selectable-content text-sm leading-relaxed md:text-base">
                  <MathRenderer content={cleanQuestionBody(currentQuestion.body)} />
                </div>

                {/* Interactive Candidate Response Input */}
                <div className="border-border/60 border-t pt-4">
                  <QuestionInput
                    key={currentQuestion.id}
                    question={currentQuestion}
                    response={responses[currentQuestion.id]}
                    onChange={(val) => handleResponseChange(val, currentQuestion.id)}
                  />
                </div>

                {/* Practice Mode: Instant Check Answer & Verified Solution */}
                {isPractice && (
                  <div className="border-border/60 space-y-3 border-t pt-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCheckAnswer}
                        className="btn btn-outline btn-xs gap-1.5 active:scale-95"
                      >
                        <CheckCircle2 className="text-success size-3.5" />
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
                          className="btn btn-ghost btn-xs text-primary gap-1 font-medium active:scale-95"
                        >
                          <Eye className="size-3.5" />
                          {showSolutionInstant[currentQuestion.id]
                            ? 'Hide Solution'
                            : 'Show Solution'}
                        </button>
                      )}
                    </div>

                    {showSolutionInstant[currentQuestion.id] && currentQuestion.solution && (
                      <div className="bg-muted/40 border-border/60 animate-fade-in selectable-content rounded-md border p-3.5 text-xs">
                        <div className="text-primary mb-1.5 flex items-center gap-1.5 text-[11px] font-bold tracking-wider uppercase">
                          <Sparkles className="size-3.5" />
                          Explanation & Solution
                        </div>
                        <MathRenderer content={cleanQuestionBody(currentQuestion.solution)} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground p-8 text-center text-sm">Question not found.</div>
          )}

          {/* Bottom Action Controls (Always Pinned in View) */}
          <footer className="shrink-0 pt-2.5">
            <div className="bg-card border-border flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 shadow-2xs">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleMarkForReviewAndNext}
                  className="btn btn-outline border-border text-foreground/80 hover:bg-muted btn-sm gap-1.5 rounded-md text-xs font-medium active:scale-95"
                >
                  <Bookmark className="size-3.5 text-purple-500" />
                  <span className="hidden sm:inline">Mark for Review & Next</span>
                  <span className="sm:hidden">Review</span>
                </button>
                <button
                  type="button"
                  onClick={handleClearResponse}
                  className="btn btn-ghost btn-sm text-muted-foreground hover:text-foreground gap-1.5 rounded-md text-xs active:scale-95"
                >
                  <RotateCcw className="size-3" />
                  Clear
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handlePrevious}
                  className="btn btn-outline border-border btn-sm gap-1 rounded-md text-xs font-medium active:scale-95"
                >
                  <ChevronLeft className="size-3.5" />
                  Previous
                </button>
                <button
                  type="button"
                  onClick={handleSaveAndNext}
                  className="btn btn-primary btn-sm gap-1 rounded-md text-xs font-medium active:scale-95"
                >
                  Save & Next
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            </div>
          </footer>
        </main>

        {/* ====================================================================
            Right Column: Official CBT Question Palette (Desktop Split View)
           ==================================================================== */}
        <aside
          aria-label="Question Palette"
          className="border-l border-black/[0.08] dark:border-white/[0.08] bg-white/70 dark:bg-zinc-900/60 backdrop-blur-2xl hidden w-72 shrink-0 flex-col justify-between overflow-hidden p-3.5 lg:flex shadow-[-2px_0_16px_rgba(0,0,0,0.02)]"
        >
          <div className="flex flex-1 min-h-0 flex-col overflow-hidden space-y-3">
            {/* Palette Status Legend (Native Glass Light Tone) */}
            <div className="shrink-0 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-muted-foreground text-[11px] font-bold tracking-wider uppercase">
                  Question Palette
                </h4>
                <span className="text-[11px] font-mono text-muted-foreground/80">
                  {answeredCount + skippedCount + markedCount + answeredMarkedCount} / {currentSection.questions.length} Active
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {/* Answered */}
                <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/[0.08] dark:bg-emerald-400/[0.10] border border-emerald-500/20 dark:border-emerald-400/20 px-2 py-1 backdrop-blur-xs">
                  <span className="flex size-4 items-center justify-center rounded-sm bg-emerald-500/20 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                    ✓
                  </span>
                  <span className="text-[11px] text-foreground/80 font-medium truncate">Answered</span>
                  <span className="ml-auto font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    {answeredCount}
                  </span>
                </div>

                {/* Skipped */}
                <div className="flex items-center gap-1.5 rounded-lg bg-rose-500/[0.08] dark:bg-rose-400/[0.10] border border-rose-500/20 dark:border-rose-400/20 px-2 py-1 backdrop-blur-xs">
                  <span className="flex size-4 items-center justify-center rounded-sm bg-rose-500/20 text-[10px] font-bold text-rose-700 dark:text-rose-300">
                    ✕
                  </span>
                  <span className="text-[11px] text-foreground/80 font-medium truncate">Skipped</span>
                  <span className="ml-auto font-mono text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                    {skippedCount}
                  </span>
                </div>

                {/* Review */}
                <div className="flex items-center gap-1.5 rounded-lg bg-purple-500/[0.08] dark:bg-purple-400/[0.10] border border-purple-500/20 dark:border-purple-400/20 px-2 py-1 backdrop-blur-xs">
                  <span className="flex size-4 items-center justify-center rounded-sm bg-purple-500/20 text-[10px] font-bold text-purple-700 dark:text-purple-300">
                    •
                  </span>
                  <span className="text-[11px] text-foreground/80 font-medium truncate">Review</span>
                  <span className="ml-auto font-mono text-[11px] font-semibold text-purple-700 dark:text-purple-300">
                    {markedCount}
                  </span>
                </div>

                {/* Ans & Rev */}
                <div className="flex items-center gap-1.5 rounded-lg bg-linear-to-r from-purple-500/[0.08] to-emerald-500/[0.08] dark:from-purple-400/[0.10] dark:to-emerald-400/[0.10] border border-emerald-500/25 dark:border-emerald-400/25 px-2 py-1 backdrop-blur-xs">
                  <span className="relative flex size-4 items-center justify-center rounded-sm bg-purple-500/20 text-[9px] font-bold text-purple-700 dark:text-purple-300">
                    ★
                    <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-emerald-500 shadow-2xs" />
                  </span>
                  <span className="text-[11px] text-foreground/80 font-medium truncate">Ans & Rev</span>
                  <span className="ml-auto font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    {answeredMarkedCount}
                  </span>
                </div>

                {/* Unvisited */}
                <div className="col-span-2 flex items-center gap-1.5 rounded-lg bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.05] dark:border-white/[0.08] px-2 py-1 backdrop-blur-xs">
                  <span className="flex size-4 items-center justify-center rounded-sm bg-black/[0.05] dark:bg-white/[0.08] text-[10px] font-bold text-muted-foreground">
                    -
                  </span>
                  <span className="text-[11px] text-foreground/70 font-medium">Not Visited</span>
                  <span className="ml-auto font-mono text-[11px] font-medium text-muted-foreground">
                    {notVisitedCount}
                  </span>
                </div>
              </div>
            </div>

            {/* Questions Grid for Current Section */}
            <div className="border-border/60 flex flex-1 min-h-0 flex-col border-t pt-2.5 overflow-hidden">
              <div className="text-muted-foreground mb-2 shrink-0 text-[11px] font-semibold">
                Questions in {currentSection.title}:
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1">
                <div className="grid grid-cols-5 gap-1.5">
                  {currentSection.questions.map((q, idx) => {
                    const isCurrent = q.id === currentQuestionId;
                    const status = visitStatuses[q.id] || 'NOT_VISITED';
                    const { bgStyle, activeStyle, isMarkedOnly, isAnsAndMark } =
                      getPaletteItemStyles(status, isCurrent);

                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => navigateToQuestion(currentSection.id, q.id)}
                        aria-label={`Question ${idx + 1}, ${status.replace(/_/g, ' ').toLowerCase()}`}
                        aria-current={isCurrent ? 'page' : undefined}
                        className={`relative inline-flex items-center justify-center aspect-square rounded-lg border text-xs backdrop-blur-md transition-all duration-150 active:scale-95 select-none cursor-pointer outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus-visible:ring-0 ${bgStyle} ${activeStyle}`}
                      >
                        {idx + 1}
                        {isMarkedOnly && (
                          <span
                            title="Marked for Review (Unanswered)"
                            className="pointer-events-none absolute top-1 right-1 size-1.5 rounded-full bg-purple-500 dark:bg-purple-400 shadow-2xs"
                          />
                        )}
                        {isAnsAndMark && (
                          <span
                            title="Answered & Marked for Review"
                            className="pointer-events-none absolute top-1 right-1 size-2 rounded-full bg-emerald-500 dark:bg-emerald-400 shadow-xs ring-1 ring-background/60"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Submit button at bottom of drawer */}
          <div className="shrink-0 mt-3 border-t border-black/[0.06] dark:border-white/[0.08] pt-3">
            <button
              onClick={() => setShowSubmitModal(true)}
              className="btn btn-primary btn-sm w-full gap-1.5 rounded-lg font-medium shadow-xs active:scale-95"
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
          className="modal modal-open modal-bottom z-50 bg-black/40 backdrop-blur-sm lg:hidden"
        >
          <div className="modal-box border-black/[0.08] dark:border-white/[0.1] bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl max-w-sm rounded-2xl border p-4 shadow-2xl">
            <div className="border-border/60 mb-3 flex items-center justify-between border-b pb-2.5">
              <h3 id="mobile-palette-title" className="text-sm font-semibold">
                Question Palette: {currentSection.title}
              </h3>
              <button
                type="button"
                onClick={() => setShowMobilePalette(false)}
                aria-label="Close palette"
                className="btn btn-ghost btn-xs btn-circle active:scale-90"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {/* Mobile Status Legend (Native Glass Light Tone) */}
            <div className="mb-3 grid grid-cols-2 gap-1.5 text-xs">
              <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/[0.08] dark:bg-emerald-400/[0.10] border border-emerald-500/20 dark:border-emerald-400/20 px-2 py-1 backdrop-blur-xs">
                <span className="flex size-4 items-center justify-center rounded-sm bg-emerald-500/20 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                  ✓
                </span>
                <span className="text-[11px] text-foreground/80 font-medium truncate">Answered</span>
                <span className="ml-auto font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  {answeredCount}
                </span>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg bg-rose-500/[0.08] dark:bg-rose-400/[0.10] border border-rose-500/20 dark:border-rose-400/20 px-2 py-1 backdrop-blur-xs">
                <span className="flex size-4 items-center justify-center rounded-sm bg-rose-500/20 text-[10px] font-bold text-rose-700 dark:text-rose-300">
                  ✕
                </span>
                <span className="text-[11px] text-foreground/80 font-medium truncate">Skipped</span>
                <span className="ml-auto font-mono text-[11px] font-semibold text-rose-700 dark:text-rose-300">
                  {skippedCount}
                </span>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg bg-purple-500/[0.08] dark:bg-purple-400/[0.10] border border-purple-500/20 dark:border-purple-400/20 px-2 py-1 backdrop-blur-xs">
                <span className="flex size-4 items-center justify-center rounded-sm bg-purple-500/20 text-[10px] font-bold text-purple-700 dark:text-purple-300">
                  •
                </span>
                <span className="text-[11px] text-foreground/80 font-medium truncate">Review</span>
                <span className="ml-auto font-mono text-[11px] font-semibold text-purple-700 dark:text-purple-300">
                  {markedCount}
                </span>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-500/[0.08] to-emerald-500/[0.08] dark:from-purple-400/[0.10] dark:to-emerald-400/[0.10] border border-emerald-500/25 dark:border-emerald-400/25 px-2 py-1 backdrop-blur-xs">
                <span className="relative flex size-4 items-center justify-center rounded-sm bg-purple-500/20 text-[9px] font-bold text-purple-700 dark:text-purple-300">
                  ★
                  <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-emerald-500 shadow-2xs" />
                </span>
                <span className="text-[11px] text-foreground/80 font-medium truncate">Ans & Rev</span>
                <span className="ml-auto font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  {answeredMarkedCount}
                </span>
              </div>
              <div className="col-span-2 flex items-center gap-1.5 rounded-lg bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.05] dark:border-white/[0.08] px-2 py-1 backdrop-blur-xs">
                <span className="flex size-4 items-center justify-center rounded-sm bg-black/[0.05] dark:bg-white/[0.08] text-[10px] font-bold text-muted-foreground">
                  -
                </span>
                <span className="text-[11px] text-foreground/70 font-medium">Not Visited</span>
                <span className="ml-auto font-mono text-[11px] font-medium text-muted-foreground">
                  {notVisitedCount}
                </span>
              </div>
            </div>

            {/* Mobile Grid */}
            <div className="grid max-h-56 grid-cols-5 gap-1.5 overflow-y-auto p-0.5">
              {currentSection.questions.map((q, idx) => {
                const isCurrent = q.id === currentQuestionId;
                const status = visitStatuses[q.id] || 'NOT_VISITED';
                const { bgStyle, activeStyle, isMarkedOnly, isAnsAndMark } = getPaletteItemStyles(
                  status,
                  isCurrent
                );

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      navigateToQuestion(currentSection.id, q.id);
                      setShowMobilePalette(false);
                    }}
                    aria-label={`Question ${idx + 1}, ${status.replace(/_/g, ' ').toLowerCase()}`}
                    aria-current={isCurrent ? 'page' : undefined}
                    className={`relative inline-flex items-center justify-center aspect-square rounded-lg border text-xs backdrop-blur-md transition-all duration-150 active:scale-90 select-none cursor-pointer outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 focus-visible:ring-0 ${bgStyle} ${activeStyle}`}
                  >
                    {idx + 1}
                    {isMarkedOnly && (
                      <span
                        title="Marked for Review (Unanswered)"
                        className="pointer-events-none absolute top-1 right-1 size-1.5 rounded-full bg-purple-500 dark:bg-purple-400 shadow-2xs"
                      />
                    )}
                    {isAnsAndMark && (
                      <span
                        title="Answered & Marked for Review"
                        className="pointer-events-none absolute top-1 right-1 size-2 rounded-full bg-emerald-500 dark:bg-emerald-400 shadow-xs ring-1 ring-background/60"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="modal-action border-border/60 mt-3 border-t pt-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowMobilePalette(false);
                  setShowSubmitModal(true);
                }}
                className="btn btn-primary btn-sm w-full gap-1.5 rounded-md font-medium active:scale-95"
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
          className="modal modal-open modal-bottom sm:modal-middle z-50 bg-black/40 backdrop-blur-sm"
        >
          <div className="bg-card/95 text-card-foreground border-border/80 max-w-md rounded-2xl border p-5 shadow-2xl backdrop-blur-xl">
            <div className="text-warning mb-2 flex items-center gap-2.5">
              <AlertTriangle className="size-5 shrink-0" />
              <h3
                id="submit-modal-title"
                className="text-foreground text-base font-semibold tracking-tight"
              >
                Submit Exam
              </h3>
            </div>
            <p className="text-muted-foreground text-xs">
              Are you sure you want to finish your test? You will not be able to change your answers
              once submitted.
            </p>

            {/* Candidate Summary Stats */}
            <div className="bg-muted/40 border-border my-3 grid grid-cols-2 gap-2 rounded-lg border p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Answered:</span>
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  {answeredCount}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Skipped:</span>
                <span className="font-mono font-semibold text-rose-600 dark:text-rose-400">
                  {skippedCount}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Review:</span>
                <span className="font-mono font-semibold text-purple-600 dark:text-purple-400">
                  {markedCount + answeredMarkedCount}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Unvisited:</span>
                <span className="text-muted-foreground font-mono font-semibold">
                  {notVisitedCount}
                </span>
              </div>
            </div>

            <div className="modal-action mt-3">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                disabled={isSubmitting}
                className="btn btn-ghost btn-sm rounded-md text-xs active:scale-95"
              >
                Continue Test
              </button>
              <button
                type="button"
                onClick={() => handleFinalSubmit(false)}
                disabled={isSubmitting}
                className="btn btn-primary btn-sm gap-1.5 rounded-md font-medium shadow-xs active:scale-95"
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
