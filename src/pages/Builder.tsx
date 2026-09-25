import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertCircle,
  AlertTriangle,
  Award,
  BarChart3,
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
import { pickImportFile, sendNativeNotification } from '@/core/native/tauriBridge';
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
            { mode: 'PRACTICE' }
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
        const matchTag = (q.tags || []).some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
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
      alert('Please select at least one question for your paper.');
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
        }
      );

      if (autoLaunch) {
        const attempt = await assessmentRepository.startAttempt(paper.id);
        navigate(`/runner/${attempt.id}`);
      } else {
        navigate('/');
      }
    } catch (err: any) {
      alert(`Could not create paper: ${err.message || 'Unknown error'}`);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 pb-36 md:p-8">
      {/* Header */}
      <div className="border-base-300 flex flex-col justify-between gap-4 border-b pb-5 md:flex-row md:items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight md:text-2xl">Builder</h1>
          <p className="text-base-content/50 mt-0.5 text-xs">
            Import questions from text, files, or AI — or compose a paper visually.
          </p>
        </div>

        {/* Studio Mode Selector */}
        <div className="bg-base-200/80 border-border/80 flex items-center rounded-2xl border p-1 shadow-2xs">
          <button
            onClick={() => setMode('INGEST')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              mode === 'INGEST'
                ? 'bg-primary text-primary-content shadow-xs'
                : 'text-base-content/70 hover:text-base-content'
            }`}
          >
            <Sparkles className="size-3.5" />
            AI & Text Ingest
          </button>
          <button
            onClick={() => setMode('COMPOSER')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
              mode === 'COMPOSER'
                ? 'bg-primary text-primary-content shadow-xs'
                : 'text-base-content/70 hover:text-base-content'
            }`}
          >
            <Layers className="size-3.5" />
            Visual Composer
          </button>
        </div>
      </div>

      {mode === 'INGEST' ? (
        /* ====================================================================== */
        /* INGEST WORKSPACE                                                       */
        /* ====================================================================== */
        <div className="space-y-6">
          {/* Top Bar Controls */}
          <div className="bg-card border-border/80 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base-content/60 text-xs font-semibold uppercase tracking-wider">Format Mode:</span>
              <div className="join">
                <button
                  onClick={() => setFormatMode('AUTO')}
                  className={`btn btn-xs join-item font-semibold ${
                    formatMode === 'AUTO' ? 'btn-primary' : 'btn-ghost'
                  }`}
                >
                  Auto-Detect
                </button>
                <button
                  onClick={() => setFormatMode('FULL_PAPER')}
                  className={`btn btn-xs join-item font-semibold ${
                    formatMode === 'FULL_PAPER' ? 'btn-primary' : 'btn-ghost'
                  }`}
                >
                  📄 Full Paper
                </button>
                <button
                  onClick={() => setFormatMode('QUESTION_PACK')}
                  className={`btn btn-xs join-item font-semibold ${
                    formatMode === 'QUESTION_PACK' ? 'btn-primary' : 'btn-ghost'
                  }`}
                >
                  🧩 Question Pack
                </button>
              </div>

              {detectedFormat && (
                <span className="badge badge-neutral gap-1 text-[11px]">
                  Detected: {detectedFormat.replace(/_/g, ' ')}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCleanChatter}
                disabled={!rawText.trim()}
                className="btn btn-ghost btn-xs text-base-content/80 gap-1 border border-border/60"
                title="Strips conversational greetings and markdown backticks"
              >
                <Wand2 className="size-3 text-secondary" />
                Strip Chatter
              </button>

              <button
                onClick={handleNativeFilePick}
                className="btn btn-outline btn-xs gap-1 border-border/70"
              >
                <FolderOpen className="size-3" />
                Pick File (.md, .json)
              </button>

              <button
                onClick={() => setShowAiModal(true)}
                className="btn btn-secondary btn-xs gap-1 shadow-2xs"
              >
                <Bot className="size-3" />
                AI Prompt Helper
              </button>
            </div>
          </div>

          {/* Feedback Alerts */}
          {ingestSuccess && (
            <div className="alert alert-success shadow-xs text-xs">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>{ingestSuccess}</span>
            </div>
          )}
          {ingestError && (
            <div className="alert alert-error shadow-xs text-xs">
              <AlertCircle className="size-4 shrink-0" />
              <span>{ingestError}</span>
            </div>
          )}

          {/* Dual Split Workspace: Left Input | Right Live Preview */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Left: Input Textarea */}
            <div className="bg-card border-border/80 flex flex-col rounded-2xl border p-4 shadow-xs">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-base-content/70">
                  Input Markdown / JSON / Prompt Output
                </span>
                <span className="text-[11px] font-mono text-base-content/50">
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
                className="textarea textarea-bordered border-border/80 font-mono text-xs w-full flex-1 min-h-[460px] p-3 leading-relaxed focus:border-primary resize-y"
              />

              <div className="mt-3 flex items-center justify-between">
                <button
                  onClick={() => setRawText('')}
                  disabled={!rawText.trim()}
                  className="btn btn-ghost btn-xs text-base-content/50 hover:text-error"
                >
                  <Trash2 className="size-3" />
                  Clear
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleExecuteIngest(false)}
                    disabled={!rawText.trim() || ingesting}
                    className="btn btn-outline btn-sm font-bold shadow-xs"
                  >
                    {ingesting ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      <CheckCircle2 className="size-3.5" />
                    )}
                    {effectiveFormat === 'FULL_PAPER' ? 'Save Paper' : 'Save to Question Bank'}
                  </button>

                  <button
                    onClick={() => handleExecuteIngest(true)}
                    disabled={!rawText.trim() || ingesting}
                    className="btn btn-primary btn-sm font-bold shadow-md"
                  >
                    {ingesting ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                    {effectiveFormat === 'FULL_PAPER' ? 'Save & Start Exam' : 'Package & Start Drill'}
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Live Parser & KaTeX Preview */}
            <div className="bg-card border-border/80 flex flex-col rounded-2xl border shadow-xs overflow-hidden">
              {/* Header + Tabs */}
              <div className="flex items-center justify-between border-b border-border/60 px-4 pt-3 pb-0">
                <div className="flex items-center gap-2">
                  <Eye className="size-3.5 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider text-base-content/70">
                    Live Preview
                  </span>
                  {livePreview && livePreview.kind !== 'ERROR' && (
                    <span className="badge badge-success badge-xs font-bold gap-0.5 text-success-content">
                      <CheckCircle2 className="size-2.5" />
                      {livePreview.errors.length === 0 ? 'Valid' : `${livePreview.errors.length} issue${livePreview.errors.length > 1 ? 's' : ''}`}
                    </span>
                  )}
                  {livePreview && livePreview.kind !== 'ERROR' && livePreview.warnings.length > 0 && (
                    <span className="badge badge-warning badge-xs font-bold gap-0.5">
                      <AlertTriangle className="size-2.5" />
                      {livePreview.warnings.length}
                    </span>
                  )}
                </div>
              </div>

              {/* Tab bar — only show when we have content */}
              {livePreview && livePreview.kind !== 'ERROR' && (
                <div className="flex border-b border-border/40 px-4 gap-1">
                  {(['overview', 'questions', 'diagnostics'] as PreviewTab[]).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setPreviewTab(tab)}
                      className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider border-b-2 transition-colors ${
                        previewTab === tab
                          ? 'border-primary text-primary'
                          : 'border-transparent text-base-content/50 hover:text-base-content/80'
                      }`}
                    >
                      {tab === 'overview' && <BarChart3 className="size-3 inline mr-1 -mt-0.5" />}
                      {tab === 'questions' && <Layers className="size-3 inline mr-1 -mt-0.5" />}
                      {tab === 'diagnostics' && <AlertCircle className="size-3 inline mr-1 -mt-0.5" />}
                      {tab}
                      {tab === 'questions' && (
                        <span className="ml-1 text-[10px] opacity-60">({livePreview.questionsCount})</span>
                      )}
                      {tab === 'diagnostics' && (livePreview.errors.length + livePreview.warnings.length) > 0 && (
                        <span className="ml-1 badge badge-error badge-xs text-[9px] px-1">{livePreview.errors.length + livePreview.warnings.length}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Panel Content */}
              <div className="flex-1 overflow-y-auto p-4" style={{ maxHeight: '600px' }}>
                {!livePreview ? (
                  /* Empty state */
                  <div className="border-border/60 flex flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center min-h-[400px]">
                    <Code2 className="text-base-content/30 size-12" />
                    <h3 className="mt-3 text-sm font-bold">Awaiting Input</h3>
                    <p className="text-base-content/50 mx-auto mt-1 max-w-xs text-xs">
                      Paste markdown or JSON on the left to see live question extraction, sections, and LaTeX equations.
                    </p>
                  </div>
                ) : livePreview.kind === 'ERROR' ? (
                  /* Fatal parse error */
                  <div className="border-error/40 bg-error/5 flex flex-col items-center justify-center rounded-xl border p-6 text-center min-h-[400px]">
                    <AlertCircle className="size-10 text-error" />
                    <h3 className="text-error mt-2 font-bold text-sm">Parser Error</h3>
                    <p className="text-base-content/70 mt-1 max-w-sm text-xs font-mono">{livePreview.message}</p>
                  </div>
                ) : previewTab === 'overview' ? (
                  /* ══════════════════ OVERVIEW TAB ══════════════════ */
                  <div className="space-y-4">
                    {/* Paper/Pack header card */}
                    <div className="bg-base-200/50 border-border/60 rounded-xl border p-4">
                      <div className="flex items-center gap-2">
                        <span className={`badge text-[10px] font-bold ${livePreview.kind === 'FULL_PAPER' ? 'badge-primary' : 'badge-secondary'}`}>
                          {livePreview.kind === 'FULL_PAPER' ? 'FULL PAPER' : 'QUESTION PACK'}
                        </span>
                        {livePreview.kind === 'FULL_PAPER' && (
                          <span className="badge badge-outline text-[10px]">{livePreview.mode}</span>
                        )}
                      </div>
                      {livePreview.kind === 'FULL_PAPER' && (
                        <>
                          <h3 className="mt-2 text-lg font-black">{livePreview.title}</h3>
                          {livePreview.description && (
                            <p className="text-base-content/60 mt-1 text-xs">{livePreview.description}</p>
                          )}
                        </>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-semibold text-base-content/70">
                        {livePreview.kind === 'FULL_PAPER' && (
                          <>
                            <span className="flex items-center gap-1">
                              <Clock className="size-3.5 text-warning" />
                              {livePreview.duration} min
                            </span>
                            <span className="flex items-center gap-1">
                              <Layers className="size-3.5 text-info" />
                              {livePreview.sectionsCount} section(s)
                            </span>
                          </>
                        )}
                        <span className="flex items-center gap-1">
                          <Award className="size-3.5 text-success" />
                          {livePreview.questionsCount} question(s)
                        </span>
                        <span className="flex items-center gap-1">
                          <Hash className="size-3.5 text-accent" />
                          {livePreview.stats.totalMarks} total marks
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="size-3.5 text-info" />
                          {livePreview.stats.withSolution}/{livePreview.questionsCount} have explanations
                        </span>
                      </div>
                    </div>

                    {/* Section breakdown for full paper */}
                    {livePreview.kind === 'FULL_PAPER' && livePreview.sections.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/50">Sections</span>
                        {livePreview.sections.map((sec, si) => (
                          <div key={sec.id} className="bg-base-100 border-border/50 flex items-center justify-between rounded-lg border px-3 py-2">
                            <span className="text-xs font-semibold">{si + 1}. {sec.title}</span>
                            <span className="badge badge-ghost badge-xs">{sec.questions.length} Q</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Metadata distribution chips */}
                    {Object.keys(livePreview.stats.subjects).length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/50">Subjects</span>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(livePreview.stats.subjects).map(([subj, count]) => (
                            <span key={subj} className="badge badge-neutral badge-sm gap-1">
                              {subj} <span className="opacity-60">×{count}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {Object.keys(livePreview.stats.types).length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/50">Question Types</span>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(livePreview.stats.types).map(([type, count]) => (
                            <span key={type} className="badge badge-outline badge-sm gap-1">
                              {type.replace(/_/g, ' ')} <span className="opacity-60">×{count}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {Object.keys(livePreview.stats.difficulties).length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/50">Difficulty</span>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(livePreview.stats.difficulties).map(([d, count]) => (
                            <span key={d} className={`badge badge-sm gap-1 ${
                              d === 'easy' ? 'badge-success' : d === 'medium' ? 'badge-warning' : 'badge-error'
                            }`}>
                              {d} <span className="opacity-70">×{count}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {Object.keys(livePreview.stats.tags).length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/50">Tags</span>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(livePreview.stats.tags).slice(0, 20).map(([tag, count]) => (
                            <span key={tag} className="badge badge-ghost badge-xs gap-0.5">
                              #{tag} <span className="opacity-50">×{count}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* First question quick preview with math rendering */}
                    {livePreview.allQuestions[0] && (
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/50">First Question Preview</span>
                        <div className="bg-card border-border/80 rounded-xl border p-3 shadow-2xs">
                          <div className="prose prose-sm max-w-none text-xs">
                            <MathRenderer content={livePreview.allQuestions[0].body} />
                          </div>
                          {livePreview.allQuestions[0].options && (
                            <div className="space-y-1 mt-2">
                              {livePreview.allQuestions[0].options.map((opt, i) => (
                                <div key={opt.id} className={`flex items-start gap-2 rounded-lg border p-1.5 text-xs ${
                                  opt.isCorrect ? 'border-success/60 bg-success/10' : 'border-border/60'
                                }`}>
                                  <span className="font-bold text-[10px] mt-0.5">{String.fromCharCode(65 + i)}.</span>
                                  <div className="flex-1"><MathRenderer content={opt.text} /></div>
                                  {opt.isCorrect && <span className="badge badge-success badge-xs">✓</span>}
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
                      <div className="text-center text-base-content/50 text-xs py-8">No questions parsed yet.</div>
                    ) : (
                      livePreview.allQuestions.map((q, idx) => {
                        const isExpanded = expandedQIdx === idx;
                        const qDiag = livePreview.perQuestion.find((p) => p.idx === idx);
                        const hasIssues = qDiag && (qDiag.errors.length > 0 || qDiag.warnings.length > 0);
                        return (
                          <div key={q.id || idx} className={`border rounded-xl overflow-hidden transition-colors ${
                            hasIssues ? 'border-warning/60' : 'border-border/60'
                          }`}>
                            {/* Collapsed header — always visible */}
                            <button
                              onClick={() => setExpandedQIdx(isExpanded ? null : idx)}
                              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-base-200/40 transition-colors"
                            >
                              {isExpanded ? (
                                <ChevronDown className="size-3.5 text-base-content/50 shrink-0" />
                              ) : (
                                <ChevronRight className="size-3.5 text-base-content/50 shrink-0" />
                              )}
                              <span className="text-[11px] font-bold text-primary shrink-0">Q{idx + 1}</span>
                              <span className="text-xs truncate flex-1 text-base-content/80">
                                {q.body.substring(0, 80)}{q.body.length > 80 ? '…' : ''}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                {q.subject && <span className="badge badge-neutral badge-xs text-[9px]">{q.subject}</span>}
                                <span className={`badge badge-xs text-[9px] ${
                                  q.difficulty === 'easy' ? 'badge-success' : q.difficulty === 'medium' ? 'badge-warning' : 'badge-error'
                                }`}>{q.difficulty}</span>
                                {hasIssues && <AlertTriangle className="size-3 text-warning" />}
                              </div>
                            </button>

                            {/* Expanded detail */}
                            {isExpanded && (
                              <div className="px-4 pb-3 pt-1 border-t border-border/40 space-y-3 bg-base-100/50">
                                {/* Metadata row */}
                                <div className="flex flex-wrap gap-1.5 text-[10px]">
                                  <span className="badge badge-outline badge-xs">{q.type.replace(/_/g, ' ')}</span>
                                  {q.topic && <span className="badge badge-ghost badge-xs">{q.topic}</span>}
                                  <span className="badge badge-ghost badge-xs">{q.marks} marks</span>
                                  {q.negativeMarks > 0 && <span className="badge badge-error badge-xs">-{q.negativeMarks}</span>}
                                  {q.tags.map((t) => (
                                    <span key={t} className="badge badge-ghost badge-xs">#{t}</span>
                                  ))}
                                </div>

                                {/* Body with math */}
                                <div className="prose prose-sm max-w-none text-xs">
                                  <MathRenderer content={q.body} />
                                </div>

                                {/* Options */}
                                {q.options && (
                                  <div className="space-y-1">
                                    {q.options.map((opt, oi) => (
                                      <div key={opt.id} className={`flex items-start gap-2 rounded-lg border p-1.5 text-xs ${
                                        opt.isCorrect ? 'border-success/60 bg-success/10 font-medium' : 'border-border/60 bg-base-100'
                                      }`}>
                                        <span className="font-bold text-[10px] mt-0.5">{String.fromCharCode(65 + oi)}.</span>
                                        <div className="flex-1"><MathRenderer content={opt.text} /></div>
                                        {opt.isCorrect && <span className="badge badge-success badge-xs font-bold text-success-content">✓</span>}
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Solution */}
                                {q.solution && (
                                  <div className="bg-info/10 border-info/30 rounded-lg border p-2.5 text-xs">
                                    <span className="text-info font-bold text-[11px] block mb-1">Explanation</span>
                                    <MathRenderer content={q.solution} />
                                  </div>
                                )}

                                {/* Per-question diagnostics inline */}
                                {qDiag && (qDiag.errors.length > 0 || qDiag.warnings.length > 0) && (
                                  <div className="space-y-1">
                                    {qDiag.errors.map((e, ei) => (
                                      <div key={ei} className="flex items-start gap-1.5 text-xs text-error bg-error/5 rounded-md px-2 py-1">
                                        <AlertCircle className="size-3 mt-0.5 shrink-0" />
                                        <span>{e}</span>
                                      </div>
                                    ))}
                                    {qDiag.warnings.map((w, wi) => (
                                      <div key={wi} className="flex items-start gap-1.5 text-xs text-warning bg-warning/5 rounded-md px-2 py-1">
                                        <AlertTriangle className="size-3 mt-0.5 shrink-0" />
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
                      <div className="flex flex-col items-center justify-center text-center py-12">
                        <CheckCircle2 className="size-10 text-success/60" />
                        <h4 className="mt-2 text-sm font-bold text-success">All Clear</h4>
                        <p className="text-base-content/50 text-xs mt-1">No errors or warnings detected in your content.</p>
                      </div>
                    ) : (
                      <>
                        {/* Summary */}
                        <div className="bg-base-200/50 rounded-xl p-3 flex items-center gap-4">
                          {livePreview.errors.length > 0 && (
                            <div className="flex items-center gap-1.5 text-error text-xs font-bold">
                              <AlertCircle className="size-4" />
                              {livePreview.errors.length} Error{livePreview.errors.length > 1 ? 's' : ''}
                            </div>
                          )}
                          {livePreview.warnings.length > 0 && (
                            <div className="flex items-center gap-1.5 text-warning text-xs font-bold">
                              <AlertTriangle className="size-4" />
                              {livePreview.warnings.length} Warning{livePreview.warnings.length > 1 ? 's' : ''}
                            </div>
                          )}
                        </div>

                        {/* Error list */}
                        {livePreview.errors.length > 0 && (
                          <div className="space-y-1.5">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-error/80">Errors</span>
                            {livePreview.errors.map((e, ei) => (
                              <div key={ei} className="flex items-start gap-2 text-xs bg-error/5 border border-error/20 rounded-lg px-3 py-2">
                                <AlertCircle className="size-3.5 text-error mt-0.5 shrink-0" />
                                <span className="text-base-content/90">{e}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Warning list */}
                        {livePreview.warnings.length > 0 && (
                          <div className="space-y-1.5">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-warning/80">Warnings</span>
                            {livePreview.warnings.map((w, wi) => (
                              <div key={wi} className="flex items-start gap-2 text-xs bg-warning/5 border border-warning/20 rounded-lg px-3 py-2">
                                <AlertTriangle className="size-3.5 text-warning mt-0.5 shrink-0" />
                                <span className="text-base-content/90">{w}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Per-question breakdown */}
                        {livePreview.perQuestion.filter((p) => p.errors.length > 0 || p.warnings.length > 0).length > 0 && (
                          <div className="space-y-1.5">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/50">By Question</span>
                            {livePreview.perQuestion
                              .filter((p) => p.errors.length > 0 || p.warnings.length > 0)
                              .map((p) => (
                                <button
                                  key={p.idx}
                                  onClick={() => { setPreviewTab('questions'); setExpandedQIdx(p.idx); }}
                                  className="w-full flex items-center gap-2 text-left bg-base-100 border border-border/50 rounded-lg px-3 py-2 hover:bg-base-200/60 transition-colors"
                                >
                                  <span className="text-xs font-bold text-primary">Q{p.idx + 1}</span>
                                  <div className="flex gap-1.5 flex-1">
                                    {p.errors.length > 0 && <span className="badge badge-error badge-xs">{p.errors.length} err</span>}
                                    {p.warnings.length > 0 && <span className="badge badge-warning badge-xs">{p.warnings.length} warn</span>}
                                  </div>
                                  <ChevronRight className="size-3 text-base-content/40" />
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
          <div className="bg-card border-border/80 grid grid-cols-1 gap-4 rounded-2xl border p-5 shadow-xs sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-base-content/70">Paper Title</label>
              <input
                type="text"
                value={composerTitle}
                onChange={(e) => setComposerTitle(e.target.value)}
                placeholder="e.g. JEE Main Full Physics Mock 2026"
                className="input input-bordered input-sm mt-1 w-full font-bold"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-base-content/70">
                Duration (Minutes)
              </label>
              <input
                type="number"
                min="5"
                max="360"
                value={composerDuration}
                onChange={(e) => setComposerDuration(Number(e.target.value))}
                className="input input-bordered input-sm mt-1 w-full"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-base-content/70">Assessment Mode</label>
              <select
                value={composerMode}
                onChange={(e) => setComposerMode(e.target.value as TestMode)}
                className="select select-bordered select-sm mt-1 w-full"
              >
                <option value="EXAM">Strict Exam Mode (Timed)</option>
                <option value="PRACTICE">Practice Mode (Instant Feedback)</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-base-content/70">
                Description / Notes
              </label>
              <input
                type="text"
                value={composerDescription}
                onChange={(e) => setComposerDescription(e.target.value)}
                placeholder="e.g. Revision paper covering kinematics and thermodynamics"
                className="input input-bordered input-sm mt-1 w-full text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-base-content/70">
                Marks Per Question
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={composerDefaultMarks}
                onChange={(e) => setComposerDefaultMarks(Number(e.target.value))}
                className="input input-bordered input-sm mt-1 w-full text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-base-content/70">
                Negative Penalty
              </label>
              <input
                type="number"
                min="0"
                max="10"
                value={composerNegativeMarks}
                onChange={(e) => setComposerNegativeMarks(Number(e.target.value))}
                className="input input-bordered input-sm mt-1 w-full text-xs"
              />
            </div>
          </div>

          {/* Question Picker Toolbar */}
          <div className="bg-card border-border/80 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              {/* Subject Filter */}
              <select
                value={filterSubject}
                onChange={(e) => {
                  setFilterSubject(e.target.value);
                  setFilterTopic('ALL');
                }}
                className="select select-bordered select-xs"
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
                  className="select select-bordered select-xs"
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
              <div className="relative">
                <Search className="text-base-content/40 absolute top-2 left-2 size-3.5" />
                <input
                  type="text"
                  placeholder="Search questions or tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input input-bordered input-xs pl-7 w-48 sm:w-64"
                />
              </div>

              <span className="text-base-content/50 text-xs">
                {filteredQuestions.length} available • {selectedQuestionIds.size} selected
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={selectAllFiltered} className="btn btn-ghost btn-xs border border-border/70">
                Select All Filtered
              </button>
              <button onClick={clearSelection} className="btn btn-ghost btn-xs text-base-content/50">
                Clear
              </button>
              <button
                onClick={() => handleCreatePaperFromComposer(false)}
                disabled={selectedQuestionIds.size === 0}
                className="btn btn-outline btn-sm font-bold"
              >
                Save Paper
              </button>
              <button
                onClick={() => handleCreatePaperFromComposer(true)}
                disabled={selectedQuestionIds.size === 0}
                className="btn btn-primary btn-sm font-bold shadow-md"
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
                  className={`border-border/80 flex flex-col justify-between rounded-xl border p-4 shadow-2xs cursor-pointer transition-all ${
                    isSelected ? 'border-primary ring-2 ring-primary/40 bg-primary/5' : 'bg-card hover:bg-base-200/40'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="badge badge-sm badge-neutral">{q.subject}</span>
                      <span className="text-base-content/50 text-[11px]">{q.topic}</span>
                    </div>

                    <div className="line-clamp-3 text-xs leading-relaxed">
                      <MathRenderer content={q.body} />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-border/40 text-[11px]">
                    <span className="capitalize text-base-content/60">{q.difficulty}</span>
                    <span
                      className={`badge badge-xs font-bold ${
                        isSelected ? 'badge-primary text-primary-content' : 'badge-ghost'
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