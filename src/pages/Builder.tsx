import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  AlertCircle,
  AlertTriangle,
  Award,
  BarChart3,
  BookOpen,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Eye,
  FolderOpen,
  Hash,
  Layers,
  Play,
  Search,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { MathRenderer } from '@/components/shared/MathRenderer';
import { AiPromptModal } from '@/components/shared/AiPromptModal';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { pickImportFile, sendNativeNotification, showNativeAlert } from '@/core/native/tauriBridge';
import { detectContentFormat, sanitizeLlmMarkdown } from '@/core/parser/llmSanitizer';
import { parseMarkdownQuestions } from '@/core/parser/markdownParser';
import { parseJsonQuestions } from '@/core/parser/jsonConverter';
import { parseFullTestMarkdown, parseFullTestJson } from '@/core/parser/testSerializer';
import { assessmentRepository } from '@/core/storage/repository';
import type { QuestionModel } from '@/types/question';
import type { TestMode } from '@/types/test';

type BuilderMode = 'INGEST' | 'COMPOSER';
type IngestFormat = 'AUTO' | 'FULL_PAPER' | 'QUESTION_PACK';
type PreviewTab = 'overview' | 'questions' | 'diagnostics';

/** Tallies metadata distribution across parsed questions for the preview panel. */
function computeDistribution(questions: QuestionModel[]) {
  const subjects: Record<string, number> = {};
  const types: Record<string, number> = {};
  const difficulties: Record<string, number> = {};
  const tags: Record<string, number> = {};
  let totalMarks = 0;
  let withSolution = 0;

  for (const q of questions) {
    if (q.subject) subjects[q.subject] = (subjects[q.subject] || 0) + 1;
    if (q.type) types[q.type] = (types[q.type] || 0) + 1;
    if (q.difficulty) difficulties[q.difficulty] = (difficulties[q.difficulty] || 0) + 1;
    totalMarks += q.marks || 0;
    if (q.solution) withSolution++;
    if (q.tags) {
      for (const t of q.tags) {
        tags[t] = (tags[t] || 0) + 1;
      }
    }
  }
  return { subjects, types, difficulties, tags, totalMarks, withSolution };
}

type DistributionStats = ReturnType<typeof computeDistribution>;
type PerQuestionDiag = { idx: number; errors: string[]; warnings: string[] };

type LivePreviewResult =
  | {
      kind: 'FULL_PAPER';
      title: string;
      description?: string;
      duration: number;
      mode: string;
      sectionsCount: number;
      sections: { id: string; title: string; questions: QuestionModel[] }[];
      questionsCount: number;
      allQuestions: QuestionModel[];
      errors: string[];
      warnings: string[];
      perQuestion: PerQuestionDiag[];
      stats: DistributionStats;
    }
  | {
      kind: 'QUESTION_PACK';
      questionsCount: number;
      allQuestions: QuestionModel[];
      errors: string[];
      warnings: string[];
      perQuestion: PerQuestionDiag[];
      stats: DistributionStats;
    }
  | {
      kind: 'ERROR';
      message: string;
    };

export function Builder() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Mode
  const [mode, setMode] = useState<BuilderMode>('INGEST');

  // Ingest State
  const [rawText, setRawText] = useState('');
  const [formatMode, setFormatMode] = useState<IngestFormat>('AUTO');
  const [ingesting, setIngesting] = useState(false);
  const [ingestSuccess, setIngestSuccess] = useState<string | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [previewTab, setPreviewTab] = useState<PreviewTab>('overview');
  const [expandedQIdx, setExpandedQIdx] = useState<number | null>(null);

  // Composer State
  const [composerTitle, setComposerTitle] = useState('New Custom Mock Test');
  const [composerDescription, setComposerDescription] = useState('');
  const [composerDuration, setComposerDuration] = useState(60);
  const [composerMode, setComposerMode] = useState<TestMode>('EXAM');
  const [composerDefaultMarks, setComposerDefaultMarks] = useState(4);
  const [composerNegativeMarks, setComposerNegativeMarks] = useState(1);
  const [allQuestions, setAllQuestions] = useState<QuestionModel[]>([]);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [filterSubject, setFilterSubject] = useState('ALL');
  const [filterTopic, setFilterTopic] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectsList, setSubjectsList] = useState<string[]>([]);
  const [topicsList, setTopicsList] = useState<string[]>([]);

  const loadComposerQuestions = async () => {
    try {
      const qs = await assessmentRepository.getQuestions();
      setAllQuestions(qs);
      const subjs = await assessmentRepository.getDistinctSubjects();
      setSubjectsList(subjs);
    } catch (err) {
      console.error('Failed to load questions for composer:', err);
    }
  };

  // Load questions for composer
  useEffect(() => {
    loadComposerQuestions();
  }, []);

  useEffect(() => {
    if (filterSubject !== 'ALL') {
      assessmentRepository.getDistinctTopics(filterSubject).then(setTopicsList);
    } else {
      setTopicsList([]);
    }
  }, [filterSubject]);

  // Live Auto-Detection
  const detectedFormat = useMemo(() => {
    if (!rawText.trim()) return null;
    return detectContentFormat(rawText);
  }, [rawText]);

  // Resolved Effective Format
  const effectiveFormat = useMemo(() => {
    if (formatMode === 'FULL_PAPER') return 'FULL_PAPER';
    if (formatMode === 'QUESTION_PACK') return 'QUESTION_PACK';
    if (detectedFormat === 'MARKDOWN_FULL_TEST' || detectedFormat === 'JSON_FULL_TEST') {
      return 'FULL_PAPER';
    }
    return 'QUESTION_PACK';
  }, [formatMode, detectedFormat]);

  // Live Parsing Preview — debounced to avoid blocking UI on every keystroke
  const [livePreview, setLivePreview] = useState<LivePreviewResult | null>(null);
  const parseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear pending parse
    if (parseTimerRef.current) clearTimeout(parseTimerRef.current);

    if (!rawText.trim()) {
      setLivePreview(null);
      return;
    }

    // Debounce: parse 200ms after last keystroke
    parseTimerRef.current = setTimeout(() => {
      try {
        const trimmed = rawText.trim();
        const isJson = trimmed.startsWith('{') || trimmed.startsWith('[');

        if (effectiveFormat === 'FULL_PAPER') {
          const parsed = isJson ? parseFullTestJson(rawText) : parseFullTestMarkdown(rawText);
          const allQs = parsed.allQuestions;
          setLivePreview({
            kind: 'FULL_PAPER',
            title: parsed.title || 'Untitled Exam Paper',
            description: parsed.description,
            duration: parsed.durationMinutes || 60,
            mode: parsed.mode || 'EXAM',
            sectionsCount: parsed.sections.length,
            sections: parsed.sections,
            questionsCount: allQs.length,
            allQuestions: allQs,
            errors: parsed.errors,
            warnings: [],
            perQuestion: [],
            stats: computeDistribution(allQs),
          });
        } else {
          const parsed = isJson ? parseJsonQuestions(rawText) : parseMarkdownQuestions(rawText);
          const allQs = parsed.questions;
          const perQuestion = parsed.diagnostics.map((d) => ({
            idx: d.questionIndex,
            errors: d.diagnostics.filter((i) => i.level === 'ERROR').map((i) => i.message),
            warnings: d.diagnostics.filter((i) => i.level === 'WARNING').map((i) => i.message),
          }));
          setLivePreview({
            kind: 'QUESTION_PACK',
            questionsCount: allQs.length,
            allQuestions: allQs,
            errors: perQuestion.flatMap((p) => p.errors),
            warnings: perQuestion.flatMap((p) => p.warnings),
            perQuestion,
            stats: computeDistribution(allQs),
          });
        }
      } catch (err: any) {
        setLivePreview({
          kind: 'ERROR',
          message: err.message || 'Syntax parsing error',
        });
      }
    }, 200);

    return () => {
      if (parseTimerRef.current) clearTimeout(parseTimerRef.current);
    };
  }, [rawText, effectiveFormat]);

  // Actions
  const handleCleanChatter = () => {
    const cleaned = sanitizeLlmMarkdown(rawText);
    setRawText(cleaned);
  };

  const handleNativeFilePick = async () => {
    const picked = await pickImportFile();
    if (picked) {
      setRawText(picked.content);
      setIngestError(null);
      setIngestSuccess(`Loaded file "${picked.name}" successfully!`);
    }
  };

  // If launched via native macOS menu item "File -> Import Question Pack..." (⌘O)
  useEffect(() => {
    if (searchParams.get('import') === '1') {
      handleNativeFilePick();
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleExecuteIngest = async (autoLaunch: boolean = false) => {
    if (!rawText.trim()) return;
    setIngesting(true);
    setIngestSuccess(null);
    setIngestError(null);

    try {
      const result = await assessmentRepository.ingestFromText(rawText, formatMode);

      sendNativeNotification('TakeMock Ingest Complete', result.message).catch(() => {});
      setIngestSuccess(result.message);

      if (autoLaunch && result.paperCreated) {
        const attempt = await assessmentRepository.startAttempt(result.paperCreated.id);
        navigate(`/runner/${attempt.id}`);
      } else if (autoLaunch && result.formatDetected === 'QUESTION_PACK') {
        // Create quick paper and launch
        const parsed = parseMarkdownQuestions(rawText);
        if (parsed.questions.length > 0) {
          const paper = await assessmentRepository.createPaperFromQuestions(
            `Imported Drill (${parsed.questions.length} Qs)`,
            parsed.questions,
            { mode: 'PRACTICE' },
          );
          const attempt = await assessmentRepository.startAttempt(paper.id);
          navigate(`/runner/${attempt.id}`);
        }
      }
    } catch (err: any) {
      setIngestError(err.message || 'Failed to ingest input.');
    } finally {
      setIngesting(false);
    }
  };

  // Composer Actions
  const filteredQuestions = useMemo(() => {
    return allQuestions.filter((q) => {
      if (filterSubject !== 'ALL' && q.subject !== filterSubject) return false;
      if (filterTopic !== 'ALL' && q.topic !== filterTopic) return false;
      if (searchQuery.trim()) {
        const qText = q.body?.toLowerCase() || '';
        const matchSearch = qText.includes(searchQuery.toLowerCase());
        const matchTag = (q.tags || []).some((t) =>
          t.toLowerCase().includes(searchQuery.toLowerCase()),
        );
        if (!matchSearch && !matchTag) return false;
      }
      return true;
    });
  }, [allQuestions, filterSubject, filterTopic, searchQuery]);

  const toggleSelectQuestion = (id: string) => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      filteredQuestions.forEach((q) => next.add(q.id));
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedQuestionIds(new Set());
  };

  const handleCreatePaperFromComposer = async (autoLaunch: boolean = false) => {
    if (selectedQuestionIds.size === 0) {
      await showNativeAlert('Please select at least one question for your paper.', {
        title: 'Empty Selection',
        kind: 'warning',
      });
      return;
    }

    const selectedList = allQuestions.filter((q) => selectedQuestionIds.has(q.id));

    try {
      const paper = await assessmentRepository.createPaperFromQuestions(
        composerTitle,
        selectedList,
        {
          description: composerDescription,
          durationMinutes: composerDuration,
          mode: composerMode,
          defaultMarks: composerDefaultMarks,
          negativeMarks: composerNegativeMarks,
        },
      );

      if (autoLaunch) {
        const attempt = await assessmentRepository.startAttempt(paper.id);
        navigate(`/runner/${attempt.id}`);
      } else {
        navigate('/');
      }
    } catch (err: any) {
      await showNativeAlert(`Could not create paper: ${err.message || 'Unknown error'}`, {
        title: 'Creation Error',
        kind: 'error',
      });
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-6 py-5 pb-20 lg:px-8">
      {/* Standard Header */}
      <div className="border-border/60 flex flex-col justify-between gap-3 border-b pb-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-foreground text-xl font-bold tracking-tight">Builder</h1>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Import questions from text, files, or AI, or compose a paper visually.
          </p>
        </div>

        {/* Studio Mode Selector */}
        <SegmentedControl
          value={mode}
          onValueChange={(val) => setMode(val as 'INGEST' | 'COMPOSER')}
          options={[
            { value: 'INGEST', label: 'AI & Text Ingest', icon: Sparkles },
            { value: 'COMPOSER', label: 'Visual Composer', icon: Layers },
          ]}
        />
      </div>

      {mode === 'INGEST' ? (
        /* ====================================================================== */
        /* INGEST WORKSPACE                                                       */
        /* ====================================================================== */
        <div className="space-y-6">
          {/* Top Bar Controls */}
          <div className="card flex flex-wrap items-center justify-between gap-3 p-3.5 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                Format Mode:
              </span>
              <SegmentedControl
                value={formatMode}
                onValueChange={(val) => setFormatMode(val as IngestFormat)}
                size="sm"
                options={[
                  { value: 'AUTO', label: 'Auto-Detect', icon: Wand2 },
                  { value: 'FULL_PAPER', label: 'Full Paper', icon: BookOpen },
                  { value: 'QUESTION_PACK', label: 'Question Pack', icon: Layers },
                ]}
              />

              {detectedFormat && (
                <span className="badge badge-neutral gap-1 text-[11px]">
                  Detected: {detectedFormat.replace(/_/g, ' ')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCleanChatter}
                disabled={!rawText.trim()}
                className="btn btn-ghost btn-sm text-foreground/80 border-border/60 h-7 gap-1.5 border text-xs active:scale-95"
                title="Strips conversational greetings and markdown backticks"
                aria-label="Strip AI conversation chatter"
              >
                <Wand2 className="text-secondary size-3" />
                Strip Chatter
              </button>

              <button
                id="builder-pick-file-btn"
                type="button"
                onClick={handleNativeFilePick}
                className="btn btn-outline btn-sm border-border/70 h-7 gap-1.5 text-xs active:scale-95"
                aria-label="Pick file from computer"
                title="Pick File from Computer (⌘O)"
              >
                <FolderOpen className="size-3.5" />
                Pick File (.md, .json)
              </button>

              <button
                type="button"
                onClick={() => setShowAiModal(true)}
                className="btn btn-secondary btn-sm h-7 gap-1.5 text-xs shadow-2xs active:scale-95"
                aria-label="Open AI Format Suffix"
              >
                <Bot className="size-3.5" />
                Format Suffix
              </button>
            </div>
          </div>

          {/* Feedback Alerts */}
          {ingestSuccess && (
            <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
              <span>{ingestSuccess}</span>
            </div>
          )}
          {ingestError && (
            <div className="flex items-center gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300">
              <AlertCircle className="size-4 shrink-0 text-rose-500" />
              <span>{ingestError}</span>
            </div>
          )}

          {/* Dual Split Workspace: Left Input | Right Live Preview */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Left: Input Textarea */}
            <div className="card flex flex-col p-4 shadow-xs">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                  Input Markdown / JSON / Prompt Output
                </span>
                <span className="text-muted-foreground font-mono text-[11px]">
                  {rawText.length} chars • {rawText.split(/\r?\n/).length} lines
                </span>
              </div>

              <textarea
                value={rawText}
                onChange={(e) => {
                  setRawText(e.target.value);
                  setIngestError(null);
                  setIngestSuccess(null);
                }}
                placeholder={`Paste your questions or full examination paper here...

Examples:
1. Full Paper Blueprint with frontmatter:
---
title: Physics Advanced Mock
durationMinutes: 90
mode: EXAM
---
# Section: Mechanics
---
type: single_choice
subject: Physics
topic: Kinematics
---
A car accelerates from rest at 2 m/s^2. Find its velocity after 5 seconds.
- [x] 10 m/s
- [ ] 20 m/s
- [ ] 5 m/s
- [ ] 25 m/s

:::solution
v = u + at = 0 + 2 * 5 = 10 m/s
:::

2. Standalone Question Pack:
---
type: single_choice
subject: Biology
topic: Cell Division
---
During which phase of mitosis do chromosomes align at the equatorial plate?
- [x] Metaphase
- [ ] Anaphase
- [ ] Prophase
- [ ] Telophase`}
                className="border-border/80 bg-background/50 text-foreground placeholder:text-muted-foreground/60 focus:ring-primary/20 focus:border-primary min-h-115 w-full flex-1 resize-y rounded-xl border p-3.5 font-mono text-xs leading-relaxed transition-all focus:ring-2 focus:outline-none dark:bg-black/20"
              />

              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setRawText('')}
                  disabled={!rawText.trim()}
                  className="btn btn-ghost btn-xs text-muted-foreground hover:text-destructive active:scale-95"
                >
                  <Trash2 className="size-3" />
                  Clear
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleExecuteIngest(false)}
                    disabled={!rawText.trim() || ingesting}
                    className="btn btn-outline btn-sm font-medium shadow-xs active:scale-95"
                  >
                    {ingesting ? (
                      <span className="loading-spinner size-3.5" />
                    ) : (
                      <CheckCircle2 className="size-3.5" />
                    )}
                    {effectiveFormat === 'FULL_PAPER' ? 'Save Paper' : 'Save to Question Bank'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExecuteIngest(true)}
                    disabled={!rawText.trim() || ingesting}
                    className="btn btn-primary btn-sm font-medium shadow-xs active:scale-95"
                  >
                    {ingesting ? (
                      <span className="loading-spinner size-3.5" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                    {effectiveFormat === 'FULL_PAPER'
                      ? 'Save & Start Exam'
                      : 'Package & Start Drill'}
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Live Parser & KaTeX Preview */}
            <div className="card flex flex-col overflow-hidden shadow-xs">
              {/* Header + Tabs */}
              <div className="border-border/60 flex items-center justify-between border-b px-4 pt-3 pb-2.5">
                <div className="flex items-center gap-2">
                  <Eye className="text-primary size-3.5" />
                  <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                    Live Preview
                  </span>
                  {livePreview && livePreview.kind !== 'ERROR' && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="size-2.5" />
                      {livePreview.errors.length === 0
                        ? 'Valid'
                        : `${livePreview.errors.length} issue${livePreview.errors.length > 1 ? 's' : ''}`}
                    </span>
                  )}
                  {livePreview &&
                    livePreview.kind !== 'ERROR' &&
                    livePreview.warnings.length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="size-2.5" />
                        {livePreview.warnings.length}
                      </span>
                    )}
                </div>
              </div>

              {/* Native macOS Segmented Control Tab Bar */}
              {livePreview && livePreview.kind !== 'ERROR' && (
                <div className="border-border/40 bg-muted/10 flex items-center border-b px-3.5 py-2">
                  <SegmentedControl
                    value={previewTab}
                    onValueChange={(val) => setPreviewTab(val as PreviewTab)}
                    size="sm"
                    options={[
                      { value: 'overview', label: 'Overview', icon: BarChart3 },
                      {
                        value: 'questions',
                        label: `Questions (${livePreview.questionsCount})`,
                        icon: Layers,
                      },
                      {
                        value: 'diagnostics',
                        label: (
                          <span className="flex items-center gap-1.5">
                            Diagnostics
                            {livePreview.errors.length + livePreview.warnings.length > 0 && (
                              <span className="py-0.2 rounded-full border border-rose-500/20 bg-rose-500/10 px-1.5 text-[9px] font-bold text-rose-600 dark:text-rose-400">
                                {livePreview.errors.length + livePreview.warnings.length}
                              </span>
                            )}
                          </span>
                        ),
                        icon: AlertCircle,
                      },
                    ]}
                  />
                </div>
              )}

              {/* Panel Content */}
              <div className="flex-1 overflow-y-auto p-4" style={{ maxHeight: '600px' }}>
                {!livePreview ? (
                  /* Empty state */
                  <div className="border-border/60 flex min-h-100 flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
                    <Code2 className="text-muted-foreground/40 size-12" />
                    <h3 className="text-foreground mt-3 text-sm font-semibold">Awaiting Input</h3>
                    <p className="text-muted-foreground mx-auto mt-1 max-w-xs text-xs">
                      Paste markdown or JSON on the left to see live question extraction, sections,
                      and LaTeX equations.
                    </p>
                  </div>
                ) : livePreview.kind === 'ERROR' ? (
                  /* Fatal parse error */
                  <div className="flex min-h-100 flex-col items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/5 p-6 text-center">
                    <AlertCircle className="size-10 text-rose-500" />
                    <h3 className="mt-2 text-sm font-semibold text-rose-600 dark:text-rose-400">
                      Parser Error
                    </h3>
                    <p className="text-muted-foreground mt-1 max-w-sm font-mono text-xs">
                      {livePreview.message}
                    </p>
                  </div>
                ) : previewTab === 'overview' ? (
                  /* ══════════════════ OVERVIEW TAB ══════════════════ */
                  <div className="space-y-4">
                    {/* Paper/Pack header card */}
                    <div className="bg-muted/30 border-border/60 rounded-xl border p-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            livePreview.kind === 'FULL_PAPER'
                              ? 'bg-primary/10 text-primary border-primary/20 border'
                              : 'border border-purple-500/20 bg-purple-500/10 text-purple-600 dark:text-purple-400'
                          }`}
                        >
                          {livePreview.kind === 'FULL_PAPER' ? 'FULL PAPER' : 'QUESTION PACK'}
                        </span>
                        {livePreview.kind === 'FULL_PAPER' && (
                          <span className="bg-muted text-muted-foreground border-border/60 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium">
                            {livePreview.mode}
                          </span>
                        )}
                      </div>
                      {livePreview.kind === 'FULL_PAPER' && (
                        <>
                          <h3 className="text-foreground mt-2 text-base font-bold">
                            {livePreview.title}
                          </h3>
                          {livePreview.description && (
                            <p className="text-muted-foreground mt-1 text-xs">
                              {livePreview.description}
                            </p>
                          )}
                        </>
                      )}
                      <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-4 text-xs font-medium">
                        {livePreview.kind === 'FULL_PAPER' && (
                          <>
                            <span className="flex items-center gap-1">
                              <Clock className="size-3.5 text-amber-500" />
                              {livePreview.duration} min
                            </span>
                            <span className="flex items-center gap-1">
                              <Layers className="size-3.5 text-blue-500" />
                              {livePreview.sectionsCount} section(s)
                            </span>
                          </>
                        )}
                        <span className="flex items-center gap-1">
                          <Award className="size-3.5 text-emerald-500" />
                          {livePreview.questionsCount} question(s)
                        </span>
                        <span className="flex items-center gap-1">
                          <Hash className="text-primary size-3.5" />
                          {livePreview.stats.totalMarks} total marks
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="size-3.5 text-emerald-500" />
                          {livePreview.stats.withSolution}/{livePreview.questionsCount} explanations
                        </span>
                      </div>
                    </div>

                    {/* Section breakdown for full paper */}
                    {livePreview.kind === 'FULL_PAPER' && livePreview.sections.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                          Sections
                        </span>
                        {livePreview.sections.map((sec, si) => (
                          <div
                            key={sec.id}
                            className="bg-card border-border/60 flex items-center justify-between rounded-lg border px-3 py-2"
                          >
                            <span className="text-foreground text-xs font-medium">
                              {si + 1}. {sec.title}
                            </span>
                            <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                              {sec.questions.length} Q
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Metadata distribution chips */}
                    {Object.keys(livePreview.stats.subjects).length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                          Subjects
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(livePreview.stats.subjects).map(([subj, count]) => (
                            <span
                              key={subj}
                              className="bg-muted text-foreground border-border/60 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                            >
                              {subj} <span className="text-muted-foreground">×{count}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {Object.keys(livePreview.stats.types).length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                          Question Types
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(livePreview.stats.types).map(([type, count]) => (
                            <span
                              key={type}
                              className="bg-muted/60 text-muted-foreground border-border/60 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                            >
                              {type.replace(/_/g, ' ')} <span className="opacity-70">×{count}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {Object.keys(livePreview.stats.difficulties).length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                          Difficulty
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(livePreview.stats.difficulties).map(([d, count]) => (
                            <span
                              key={d}
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${
                                d === 'easy'
                                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : d === 'medium'
                                    ? 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                    : 'border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {d} <span className="opacity-70">×{count}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {Object.keys(livePreview.stats.tags).length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                          Tags
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(livePreview.stats.tags)
                            .slice(0, 20)
                            .map(([tag, count]) => (
                              <span
                                key={tag}
                                className="bg-muted/50 text-muted-foreground border-border/40 inline-flex items-center gap-0.5 rounded-md border px-2 py-0.5 font-mono text-[10px]"
                              >
                                #{tag} <span className="opacity-60">×{count}</span>
                              </span>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* First question quick preview with math rendering */}
                    {livePreview.allQuestions[0] && (
                      <div className="space-y-1.5">
                        <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                          First Question Preview
                        </span>
                        <div className="bg-card border-border/80 rounded-xl border p-3 shadow-2xs">
                          <div className="prose prose-sm max-w-none text-xs">
                            <MathRenderer content={livePreview.allQuestions[0].body} />
                          </div>
                          {livePreview.allQuestions[0].options && (
                            <div className="mt-2 space-y-1">
                              {livePreview.allQuestions[0].options.map((opt, i) => (
                                <div
                                  key={opt.id}
                                  className={`flex items-start gap-2 rounded-lg border p-1.5 text-xs ${
                                    opt.isCorrect
                                      ? 'border-emerald-500/40 bg-emerald-500/10 font-medium'
                                      : 'border-border/60'
                                  }`}
                                >
                                  <span className="text-foreground mt-0.5 text-[10px] font-bold">
                                    {String.fromCharCode(65 + i)}.
                                  </span>
                                  <div className="flex-1">
                                    <MathRenderer content={opt.text} />
                                  </div>
                                  {opt.isCorrect && (
                                    <span className="py-0.2 inline-flex items-center rounded-full bg-emerald-500 px-1.5 text-[9px] font-bold text-white">
                                      ✓
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : previewTab === 'questions' ? (
                  /* ══════════════════ QUESTIONS TAB ══════════════════ */
                  <div className="space-y-2">
                    {livePreview.allQuestions.length === 0 ? (
                      <div className="text-muted-foreground py-8 text-center text-xs">
                        No questions parsed yet.
                      </div>
                    ) : (
                      livePreview.allQuestions.map((q, idx) => {
                        const isExpanded = expandedQIdx === idx;
                        const qDiag = livePreview.perQuestion.find((p) => p.idx === idx);
                        const hasIssues =
                          qDiag && (qDiag.errors.length > 0 || qDiag.warnings.length > 0);
                        return (
                          <div
                            key={q.id || idx}
                            className={`overflow-hidden rounded-xl border transition-colors ${
                              hasIssues
                                ? 'border-amber-500/40 bg-amber-500/2'
                                : 'border-border/60 bg-card'
                            }`}
                          >
                            {/* Collapsed header — always visible */}
                            <button
                              onClick={() => setExpandedQIdx(isExpanded ? null : idx)}
                              className="hover:bg-muted/30 flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors"
                            >
                              {isExpanded ? (
                                <ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
                              ) : (
                                <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
                              )}
                              <span className="text-primary shrink-0 text-[11px] font-bold">
                                Q{idx + 1}
                              </span>
                              <span className="text-foreground/90 flex-1 truncate text-xs">
                                {q.body.substring(0, 80)}
                                {q.body.length > 80 ? '…' : ''}
                              </span>
                              <div className="flex shrink-0 items-center gap-1">
                                {q.subject && (
                                  <span className="bg-muted text-muted-foreground border-border/60 inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-medium">
                                    {q.subject}
                                  </span>
                                )}
                                <span
                                  className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-medium capitalize ${
                                    q.difficulty === 'easy'
                                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                      : q.difficulty === 'medium'
                                        ? 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                        : 'border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                  }`}
                                >
                                  {q.difficulty}
                                </span>
                                {hasIssues && <AlertTriangle className="size-3 text-amber-500" />}
                              </div>
                            </button>

                            {/* Expanded detail */}
                            {isExpanded && (
                              <div className="border-border/40 bg-muted/10 space-y-3 border-t px-4 pt-1 pb-3">
                                {/* Metadata row */}
                                <div className="flex flex-wrap gap-1.5 text-[10px]">
                                  <span className="bg-muted text-muted-foreground border-border/60 inline-flex items-center rounded-full border px-2 py-0.5 font-medium">
                                    {q.type.replace(/_/g, ' ')}
                                  </span>
                                  {q.topic && (
                                    <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 font-medium">
                                      {q.topic}
                                    </span>
                                  )}
                                  <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 font-medium">
                                    {q.marks} marks
                                  </span>
                                  {q.negativeMarks > 0 && (
                                    <span className="inline-flex items-center rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-0.5 font-medium text-rose-600 dark:text-rose-400">
                                      -{q.negativeMarks}
                                    </span>
                                  )}
                                  {q.tags.map((t) => (
                                    <span
                                      key={t}
                                      className="bg-muted/60 text-muted-foreground inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[9px]"
                                    >
                                      #{t}
                                    </span>
                                  ))}
                                </div>

                                {/* Body with math */}
                                <div className="prose prose-sm text-foreground max-w-none text-xs">
                                  <MathRenderer content={q.body} />
                                </div>

                                {/* Options */}
                                {q.options && (
                                  <div className="space-y-1">
                                    {q.options.map((opt, oi) => (
                                      <div
                                        key={opt.id}
                                        className={`flex items-start gap-2 rounded-lg border p-1.5 text-xs ${
                                          opt.isCorrect
                                            ? 'border-emerald-500/40 bg-emerald-500/10 font-medium'
                                            : 'border-border/60 bg-background'
                                        }`}
                                      >
                                        <span className="text-foreground mt-0.5 text-[10px] font-bold">
                                          {String.fromCharCode(65 + oi)}.
                                        </span>
                                        <div className="flex-1">
                                          <MathRenderer content={opt.text} />
                                        </div>
                                        {opt.isCorrect && (
                                          <span className="py-0.2 inline-flex items-center rounded-full bg-emerald-500 px-1.5 text-[9px] font-bold text-white">
                                            ✓
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Solution */}
                                {q.solution && (
                                  <div className="rounded-lg border border-blue-500/25 bg-blue-500/10 p-2.5 text-xs">
                                    <span className="mb-1 block text-[11px] font-bold text-blue-600 dark:text-blue-400">
                                      Explanation
                                    </span>
                                    <MathRenderer content={q.solution} />
                                  </div>
                                )}

                                {/* Per-question diagnostics inline */}
                                {qDiag &&
                                  (qDiag.errors.length > 0 || qDiag.warnings.length > 0) && (
                                    <div className="space-y-1">
                                      {qDiag.errors.map((e, ei) => (
                                        <div
                                          key={ei}
                                          className="flex items-start gap-1.5 rounded-md border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-xs text-rose-600 dark:text-rose-400"
                                        >
                                          <AlertCircle className="mt-0.5 size-3 shrink-0" />
                                          <span>{e}</span>
                                        </div>
                                      ))}
                                      {qDiag.warnings.map((w, wi) => (
                                        <div
                                          key={wi}
                                          className="flex items-start gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-xs text-amber-600 dark:text-amber-400"
                                        >
                                          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                                          <span>{w}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : (
                  /* ══════════════════ DIAGNOSTICS TAB ══════════════════ */
                  <div className="space-y-4">
                    {livePreview.errors.length === 0 && livePreview.warnings.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <CheckCircle2 className="size-10 text-emerald-500/70" />
                        <h4 className="mt-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                          All Clear
                        </h4>
                        <p className="text-muted-foreground mt-1 text-xs">
                          No errors or warnings detected in your content.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Summary */}
                        <div className="bg-muted/30 border-border/60 flex items-center gap-4 rounded-xl border p-3">
                          {livePreview.errors.length > 0 && (
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                              <AlertCircle className="size-4" />
                              {livePreview.errors.length} Error
                              {livePreview.errors.length > 1 ? 's' : ''}
                            </div>
                          )}
                          {livePreview.warnings.length > 0 && (
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                              <AlertTriangle className="size-4" />
                              {livePreview.warnings.length} Warning
                              {livePreview.warnings.length > 1 ? 's' : ''}
                            </div>
                          )}
                        </div>

                        {/* Error list */}
                        {livePreview.errors.length > 0 && (
                          <div className="space-y-1.5">
                            <span className="text-[11px] font-semibold tracking-wider text-rose-600 uppercase dark:text-rose-400">
                              Errors
                            </span>
                            {livePreview.errors.map((e, ei) => (
                              <div
                                key={ei}
                                className="flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300"
                              >
                                <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-rose-500" />
                                <span>{e}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Warning list */}
                        {livePreview.warnings.length > 0 && (
                          <div className="space-y-1.5">
                            <span className="text-[11px] font-semibold tracking-wider text-amber-600 uppercase dark:text-amber-400">
                              Warnings
                            </span>
                            {livePreview.warnings.map((w, wi) => (
                              <div
                                key={wi}
                                className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300"
                              >
                                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                                <span>{w}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Per-question breakdown */}
                        {livePreview.perQuestion.filter(
                          (p) => p.errors.length > 0 || p.warnings.length > 0,
                        ).length > 0 && (
                          <div className="space-y-1.5">
                            <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
                              By Question
                            </span>
                            {livePreview.perQuestion
                              .filter((p) => p.errors.length > 0 || p.warnings.length > 0)
                              .map((p) => (
                                <button
                                  key={p.idx}
                                  onClick={() => {
                                    setPreviewTab('questions');
                                    setExpandedQIdx(p.idx);
                                  }}
                                  className="bg-card border-border/60 hover:bg-muted/40 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors"
                                >
                                  <span className="text-primary text-xs font-bold">
                                    Q{p.idx + 1}
                                  </span>
                                  <div className="flex flex-1 gap-1.5">
                                    {p.errors.length > 0 && (
                                      <span className="inline-flex items-center rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 dark:text-rose-400">
                                        {p.errors.length} err
                                      </span>
                                    )}
                                    {p.warnings.length > 0 && (
                                      <span className="inline-flex items-center rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                        {p.warnings.length} warn
                                      </span>
                                    )}
                                  </div>
                                  <ChevronRight className="text-muted-foreground size-3" />
                                </button>
                              ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ====================================================================== */
        /* VISUAL PAPER COMPOSER                                                  */
        /* ====================================================================== */
        <div className="space-y-6">
          {/* Metadata Card */}
          <div className="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="text-muted-foreground mb-1 block text-[11px] font-semibold tracking-wider uppercase">
                Paper Title
              </label>
              <input
                type="text"
                value={composerTitle}
                onChange={(e) => setComposerTitle(e.target.value)}
                placeholder="e.g. JEE Main Full Physics Mock 2026"
                className="border-border/80 bg-background text-foreground placeholder:text-muted-foreground/60 focus:ring-primary/20 focus:border-primary h-8 w-full rounded-md border px-3 text-xs font-semibold transition-colors focus:ring-2 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-muted-foreground mb-1 block text-[11px] font-semibold tracking-wider uppercase">
                Duration (Minutes)
              </label>
              <input
                type="number"
                min="5"
                max="360"
                value={composerDuration}
                onChange={(e) => setComposerDuration(Number(e.target.value))}
                className="border-border/80 bg-background text-foreground focus:ring-primary/20 focus:border-primary h-8 w-full rounded-md border px-3 text-xs transition-colors focus:ring-2 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-muted-foreground mb-1 block text-[11px] font-semibold tracking-wider uppercase">
                Assessment Mode
              </label>
              <select
                value={composerMode}
                onChange={(e) => setComposerMode(e.target.value as TestMode)}
                className="border-border/80 bg-background text-foreground focus:ring-primary/20 focus:border-primary h-8 w-full rounded-md border px-2.5 text-xs transition-colors focus:ring-2 focus:outline-none"
              >
                <option value="EXAM">Strict Exam Mode (Timed)</option>
                <option value="PRACTICE">Practice Mode (Instant Feedback)</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="text-muted-foreground mb-1 block text-[11px] font-semibold tracking-wider uppercase">
                Description / Notes
              </label>
              <input
                type="text"
                value={composerDescription}
                onChange={(e) => setComposerDescription(e.target.value)}
                placeholder="e.g. Revision paper covering kinematics and thermodynamics"
                className="border-border/80 bg-background text-foreground placeholder:text-muted-foreground/60 focus:ring-primary/20 focus:border-primary h-8 w-full rounded-md border px-3 text-xs transition-colors focus:ring-2 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-muted-foreground mb-1 block text-[11px] font-semibold tracking-wider uppercase">
                Marks Per Question
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={composerDefaultMarks}
                onChange={(e) => setComposerDefaultMarks(Number(e.target.value))}
                className="border-border/80 bg-background text-foreground focus:ring-primary/20 focus:border-primary h-8 w-full rounded-md border px-3 text-xs transition-colors focus:ring-2 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-muted-foreground mb-1 block text-[11px] font-semibold tracking-wider uppercase">
                Negative Penalty
              </label>
              <input
                type="number"
                min="0"
                max="10"
                value={composerNegativeMarks}
                onChange={(e) => setComposerNegativeMarks(Number(e.target.value))}
                className="border-border/80 bg-background text-foreground focus:ring-primary/20 focus:border-primary h-8 w-full rounded-md border px-3 text-xs transition-colors focus:ring-2 focus:outline-none"
              />
            </div>
          </div>

          {/* Question Picker Toolbar */}
          <div className="card flex flex-wrap items-center justify-between gap-3 p-3.5 sm:p-4">
            <div className="flex flex-wrap items-center gap-2">
              {/* Subject Filter */}
              <select
                value={filterSubject}
                onChange={(e) => {
                  setFilterSubject(e.target.value);
                  setFilterTopic('ALL');
                }}
                className="border-border/80 bg-background text-foreground focus:border-primary h-7 rounded-md border px-2 text-xs focus:outline-none"
              >
                <option value="ALL">All Subjects</option>
                {subjectsList.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              {/* Topic Filter */}
              {topicsList.length > 0 && (
                <select
                  value={filterTopic}
                  onChange={(e) => setFilterTopic(e.target.value)}
                  className="border-border/80 bg-background text-foreground focus:border-primary h-7 rounded-md border px-2 text-xs focus:outline-none"
                >
                  <option value="ALL">All Topics</option>
                  {topicsList.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              )}

              {/* Search */}
              <div className="macos-search-field">
                <Search className="size-3.5" />
                <input
                  type="search"
                  placeholder="Search questions or tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-48 sm:w-64"
                />
              </div>

              <span className="text-muted-foreground text-xs">
                {filteredQuestions.length} available • {selectedQuestionIds.size} selected
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={selectAllFiltered}
                className="btn btn-ghost btn-xs border-border/70 border text-xs"
              >
                Select All Filtered
              </button>
              <button
                onClick={clearSelection}
                className="btn btn-ghost btn-xs text-muted-foreground text-xs"
              >
                Clear
              </button>
              <button
                onClick={() => handleCreatePaperFromComposer(false)}
                disabled={selectedQuestionIds.size === 0}
                className="btn btn-outline btn-sm h-7 text-xs font-medium"
              >
                Save Paper
              </button>
              <button
                onClick={() => handleCreatePaperFromComposer(true)}
                disabled={selectedQuestionIds.size === 0}
                className="btn btn-primary btn-sm h-7 px-3 text-xs font-medium shadow-xs"
              >
                <Play className="size-3.5" />
                Save & Start Now
              </button>
            </div>
          </div>

          {/* Questions Grid */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filteredQuestions.map((q) => {
              const isSelected = selectedQuestionIds.has(q.id);
              return (
                <div
                  key={q.id}
                  onClick={() => toggleSelectQuestion(q.id)}
                  className={`flex cursor-pointer flex-col justify-between rounded-xl p-4 shadow-xs transition-all ${
                    isSelected
                      ? 'card border-primary ring-primary/40 bg-primary/5 dark:bg-primary/10 ring-1'
                      : 'card hover:border-primary/40'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="bg-muted text-muted-foreground border-border/60 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium">
                        {q.subject}
                      </span>
                      <span className="text-muted-foreground text-[11px]">{q.topic}</span>
                    </div>

                    <div className="text-foreground/90 overflow-visible text-xs leading-relaxed wrap-break-word">
                      <MathRenderer content={q.body} />
                    </div>
                  </div>

                  <div className="border-border/40 mt-3 flex items-center justify-between border-t pt-2 text-[11px]">
                    <span className="text-muted-foreground capitalize">{q.difficulty}</span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground border-border/60 border'
                      }`}
                    >
                      {isSelected ? '✓ Selected' : '+ Add'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Prompt Guide Modal */}
      <AiPromptModal
        isOpen={showAiModal}
        onClose={() => setShowAiModal(false)}
        defaultTarget={effectiveFormat === 'FULL_PAPER' ? 'FULL_PAPER' : 'QUESTION_PACK'}
      />
    </div>
  );
}
