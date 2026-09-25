/**
 * Library & Question Bank Page.
 * Browse, search, filter, preview questions with KaTeX math, and import/export Markdown v2 & JSON.
 * Adheres strictly to docs/master_architecture_prompt_v2.md & docs/markdown_format_spec_v2.md.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileCode2,
  FileJson,
  Info,
  Layers,
  Plus,
  Search,
  Sparkles,
  Upload,
} from 'lucide-react';
import { MathRenderer } from '@/components/shared/MathRenderer';
import { AiPromptModal } from '@/components/shared/AiPromptModal';
import { pickImportFile, saveExportFile } from '@/core/native/tauriBridge';
import { parseJsonQuestions, serializeJsonQuestions, type JsonParseResult } from '@/core/parser/jsonConverter';
import { parseMarkdownQuestions, type ParseResult } from '@/core/parser/markdownParser';
import { serializeMarkdownQuestions } from '@/core/parser/markdownSerializer';
import { assessmentRepository } from '@/core/storage/repository';
import type { QuestionModel } from '@/types/question';

export function Library() {
  const navigate = useNavigate();

  const [questions, setQuestions] = useState<QuestionModel[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('ALL');
  const [selectedDifficulty, setSelectedDifficulty] = useState('ALL');
  const [selectedType, setSelectedType] = useState('ALL');

  // Solution preview drawer
  const [expandedSolutions, setExpandedSolutions] = useState<Record<string, boolean>>({});

  // Importer Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAiStudio, setShowAiStudio] = useState(false);
  const [importFormat, setImportFormat] = useState<'MARKDOWN' | 'JSON'>('MARKDOWN');
  const [textInput, setTextInput] = useState('');
  const [importResult, setImportResult] = useState<ParseResult | JsonParseResult | null>(null);
  const [importSuccessMsg, setImportSuccessMsg] = useState('');

  // High-performance database-level paginated query (Section 38: Low time & space complexity)
  const loadQuestions = useCallback(async (targetPage = page) => {
    setLoading(true);
    try {
      const res = await assessmentRepository.getQuestionsPaged({
        page: targetPage,
        pageSize,
        filters: {
          subject: selectedSubject,
          difficulty: selectedDifficulty,
          type: selectedType,
          search,
        },
      });
      setQuestions(res.items);
      setTotalCount(res.totalCount);
      setTotalPages(res.totalPages);
      setPage(res.page);

      // Load distinct subjects directly from B-tree index
      const distSubjects = await assessmentRepository.getDistinctSubjects();
      setSubjects(distSubjects);
    } catch (err) {
      console.error('Failed to load questions:', err);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, selectedSubject, selectedDifficulty, selectedType, search]);

  useEffect(() => {
    loadQuestions(1);
  }, [selectedSubject, selectedDifficulty, selectedType, search]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    loadQuestions(newPage);
  };

  const toggleSolution = (id: string) => {
    setExpandedSolutions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Live validation on text change
  const handleTextChange = (text: string, format = importFormat) => {
    setTextInput(text);
    if (!text.trim()) {
      setImportResult(null);
      return;
    }
    if (format === 'MARKDOWN') {
      const result = parseMarkdownQuestions(text);
      setImportResult(result);
    } else {
      const result = parseJsonQuestions(text);
      setImportResult(result);
    }
  };

  // Perform import
  const handleExecuteImport = async () => {
    if (!textInput.trim()) return;
    try {
      let result: ParseResult | JsonParseResult;
      if (importFormat === 'MARKDOWN') {
        result = await assessmentRepository.importQuestionsFromMarkdown(textInput);
      } else {
        result = await assessmentRepository.importQuestionsFromJson(textInput);
      }

      setImportResult(result);

      const errorQIds = new Set<string>();
      for (const d of result.diagnostics) {
        if (d.diagnostics.some((item) => item.level === 'ERROR')) {
          if (d.questionId) errorQIds.add(d.questionId);
        }
      }
      const validCount = result.questions.filter((q) => !errorQIds.has(q.id)).length;

      if (validCount > 0) {
        if (result.hasErrors) {
          setImportSuccessMsg(`Imported ${validCount} valid question(s). Please fix the questions with errors.`);
        } else {
          setImportSuccessMsg(`Successfully imported all ${validCount} question(s) into Question Bank!`);
        }
        await loadQuestions();
        if (!result.hasErrors) {
          setTimeout(() => {
            setShowImportModal(false);
            setTextInput('');
            setImportResult(null);
            setImportSuccessMsg('');
          }, 1200);
        }
      } else {
        setImportSuccessMsg('');
      }
    } catch (err: any) {
      alert(`Import failed: ${err.message || 'Unknown error'}`);
    }
  };

  // Native / Web File Picker handler (.md or .json)
  const handleNativeFilePick = async () => {
    const picked = await pickImportFile();
    if (!picked) return;

    const isJson = picked.name.toLowerCase().endsWith('.json');
    const newFormat = isJson ? 'JSON' : 'MARKDOWN';
    setImportFormat(newFormat);
    setShowImportModal(true);
    handleTextChange(picked.content, newFormat);
  };

  // Export all questions matching current filters as Markdown v2
  const handleExportMarkdown = async () => {
    const allQ = await assessmentRepository.getQuestions({
      subject: selectedSubject !== 'ALL' ? selectedSubject : undefined,
      difficulty: selectedDifficulty !== 'ALL' ? selectedDifficulty : undefined,
      type: selectedType !== 'ALL' ? selectedType : undefined,
      search: search.trim() ? search : undefined,
    });
    if (allQ.length === 0) {
      alert('No questions found to export matching current filters.');
      return;
    }
    const md = serializeMarkdownQuestions(allQ);
    await saveExportFile(
      `takemock_questions_${new Date().toISOString().slice(0, 10)}.md`,
      md,
      'text/markdown;charset=utf-8;'
    );
  };

  // Export all questions matching current filters as JSON
  const handleExportJson = async () => {
    const allQ = await assessmentRepository.getQuestions({
      subject: selectedSubject !== 'ALL' ? selectedSubject : undefined,
      difficulty: selectedDifficulty !== 'ALL' ? selectedDifficulty : undefined,
      type: selectedType !== 'ALL' ? selectedType : undefined,
      search: search.trim() ? search : undefined,
    });
    if (allQ.length === 0) {
      alert('No questions found to export matching current filters.');
      return;
    }
    const jsonStr = serializeJsonQuestions(allQ);
    await saveExportFile(
      `takemock_questions_${new Date().toISOString().slice(0, 10)}.json`,
      jsonStr,
      'application/json;charset=utf-8;'
    );
  };

  const sampleMarkdownTemplate = `---
schemaVersion: "2.0"
id: sample-math-101
type: single_choice
subject: Mathematics
topic: Calculus
difficulty: medium
marks: 4
negativeMarks: 1
tags: [integration, calculus]
---

Evaluate the definite integral:

$$
\\int_{0}^{1} x^2 \\, dx
$$

- [ ] $1$
- [ ] $\\frac{1}{2}$
- [x] $\\frac{1}{3}$
- [ ] $\\frac{1}{4}$

:::solution
Using the power rule for integration:
$$
\\int x^2 \\, dx = \\frac{x^3}{3}
$$
Evaluating between limits $0$ and $1$:
$$
\\left[ \\frac{x^3}{3} \\right]_0^1 = \\frac{1}{3} - 0 = \\frac{1}{3}
$$
:::
`;

  const sampleJsonTemplate = `[
  {
    "schemaVersion": "2.0",
    "id": "sample-cs-201",
    "type": "single_choice",
    "subject": "Computer Science",
    "topic": "Algorithms",
    "difficulty": "medium",
    "marks": 4,
    "negativeMarks": 1,
    "tags": ["algorithms", "searching"],
    "body": "What is the worst-case time complexity of Binary Search on a sorted array of $n$ elements?",
    "options": [
      { "id": "opt_0", "text": "$\\\\mathcal{O}(1)$", "isCorrect": false },
      { "id": "opt_1", "text": "$\\\\mathcal{O}(\\\\log n)$", "isCorrect": true },
      { "id": "opt_2", "text": "$\\\\mathcal{O}(n)$", "isCorrect": false },
      { "id": "opt_3", "text": "$\\\\mathcal{O}(n \\\\log n)$", "isCorrect": false }
    ],
    "solution": "Binary search repeatedly halves the search space, giving a logarithmic recurrence $T(n) = T(n/2) + \\\\mathcal{O}(1) = \\\\mathcal{O}(\\\\log n)$."
  }
]`;

  return (
    <div className="mx-auto min-h-screen max-w-7xl space-y-8 p-6 pb-36 md:p-10">
      {/* Header */}
      <div className="border-base-300 flex flex-col justify-between gap-4 border-b pb-6 md:flex-row md:items-center">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="badge badge-primary gap-1 font-medium shadow-sm">
              <Layers className="size-3.5" />
              Question Bank
            </span>
            <span className="badge badge-outline border-base-300 gap-1 text-xs">
              <BookOpen className="size-3" />
              {questions.length} Questions Stored Offline
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">Repository & Question Bank</h1>
          <p className="text-base-content/70 mt-1 text-sm md:text-base">
            Search, filter, and author questions adhering strictly to Canonical Markdown v2 and JSON with KaTeX math.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowAiStudio(true)}
            className="btn btn-secondary gap-2 shadow-xs"
            title="Copy AI format contract suffix for ChatGPT, Claude, etc."
          >
            <Sparkles className="size-4" />
            AI Format Suffix
          </button>
          <button
            onClick={handleNativeFilePick}
            className="btn btn-outline border-base-300 gap-2"
            title="Upload or pick .md or .json file"
          >
            <Upload className="size-4" />
            Upload File
          </button>
          <button onClick={() => setShowImportModal(true)} className="btn btn-primary gap-2 shadow-sm">
            <FileCode2 className="size-4" />
            Paste / Import
          </button>
          <div className="dropdown dropdown-end">
            <div tabIndex={0} role="button" className="btn btn-outline border-base-300 gap-2">
              <Download className="size-4" />
              Export
              <ChevronDown className="size-3" />
            </div>
            <ul tabIndex={0} className="dropdown-content menu bg-base-100 rounded-box border border-base-300 z-10 w-44 p-2 shadow-lg">
              <li>
                <button onClick={handleExportMarkdown} className="gap-2 text-xs">
                  <FileCode2 className="size-3.5 text-primary" /> Export Markdown v2
                </button>
              </li>
              <li>
                <button onClick={handleExportJson} className="gap-2 text-xs">
                  <FileJson className="size-3.5 text-secondary" /> Export JSON
                </button>
              </li>
            </ul>
          </div>
          <button onClick={() => navigate('/builder')} className="btn btn-secondary gap-2 shadow-sm">
            <Plus className="size-4" />
            Build Test
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-base-200/50 border-base-300 rounded-box flex flex-col gap-4 border p-4 shadow-sm md:flex-row md:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="text-base-content/40 absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by topic, formula, text, or tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input input-bordered w-full pl-9"
          />
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Subject */}
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="select select-bordered select-sm"
          >
            <option value="ALL">All Subjects</option>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* Difficulty */}
          <select
            value={selectedDifficulty}
            onChange={(e) => setSelectedDifficulty(e.target.value)}
            className="select select-bordered select-sm"
          >
            <option value="ALL">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>

          {/* Question Type */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="select select-bordered select-sm"
          >
            <option value="ALL">All Types</option>
            <option value="single_choice">Single Choice</option>
            <option value="multiple_choice">Multiple Choice</option>
            <option value="true_false">True / False</option>
            <option value="numerical">Numerical</option>
            <option value="integer">Integer</option>
            <option value="fill_blank">Fill Blank</option>
            <option value="match">Match</option>
            <option value="assertion_reason">Assertion-Reason</option>
            <option value="passage">Passage</option>
            <option value="image_based">Image Based</option>
          </select>
        </div>
      </div>

      {/* Questions List */}
      {loading ? (
        <div className="flex items-center justify-center p-12">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      ) : questions.length === 0 ? (
        <div className="bg-base-200/40 border-base-300 rounded-box border p-12 text-center">
          <BookOpen className="text-base-content/30 mx-auto size-12" />
          <h3 className="mt-4 text-lg font-bold">No questions found</h3>
          <p className="text-base-content/60 mt-1 text-sm">
            Try adjusting your search filters or import new questions using the Import tool.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-base-content/70 flex items-center justify-between text-xs font-semibold uppercase tracking-wider">
            <span>
              Showing {totalCount === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount} questions
            </span>
            <span>Page {page} of {totalPages}</span>
          </div>

          <div className="grid grid-cols-1 gap-5">
            {questions.map((q, idx) => {
              const isSolutionOpen = expandedSolutions[q.id];

              return (
                <div
                  key={q.id}
                  className="bg-base-100 border-base-300 hover:border-primary/40 rounded-box flex flex-col justify-between border p-6 shadow-sm transition-all"
                >
                  <div className="space-y-4">
                    {/* Top Metadata Badges */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="badge badge-neutral font-mono text-xs font-bold">
                          #{idx + 1} · {q.id}
                        </span>
                        <span className="badge badge-primary badge-outline text-xs font-medium">
                          {q.subject} / {q.topic}
                        </span>
                        <span className="badge badge-ghost text-xs font-mono">{q.type}</span>
                        <span
                          className={`badge badge-sm font-semibold capitalize ${
                            q.difficulty === 'easy'
                              ? 'badge-success text-success-content'
                              : q.difficulty === 'hard'
                              ? 'badge-error text-error-content'
                              : 'badge-warning text-warning-content'
                          }`}
                        >
                          {q.difficulty}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs font-mono">
                        <span className="text-success font-semibold">+{q.marks}</span>
                        <span className="text-error font-semibold">-{q.negativeMarks}</span>
                        <span className="text-base-content/50">v{q.version || 1}</span>
                      </div>
                    </div>

                    {/* Question Image if any */}
                    {q.imageUrl && (
                      <div className="overflow-hidden rounded-xl border border-base-300 max-w-md">
                        <img src={q.imageUrl} alt={q.imageAlt || 'Question diagram'} className="w-full object-cover" />
                      </div>
                    )}

                    {/* Question Body with KaTeX Math */}
                    <div className="text-base leading-relaxed">
                      <MathRenderer content={q.body} />
                    </div>

                    {/* Options Preview */}
                    {q.options && q.options.length > 0 && (
                      <div className="grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2">
                        {q.options.map((opt, oIdx) => (
                          <div
                            key={opt.id}
                            className={`flex items-start gap-2.5 rounded-lg border p-3 text-sm transition-all ${
                              opt.isCorrect
                                ? 'border-success/60 bg-success/10 font-medium'
                                : 'border-base-300/80 bg-base-200/40 text-base-content/80'
                            }`}
                          >
                            <span
                              className={`badge badge-xs mt-0.5 font-bold ${
                                opt.isCorrect ? 'badge-success text-success-content' : 'badge-ghost'
                              }`}
                            >
                              {String.fromCharCode(65 + oIdx)}
                            </span>
                            <div className="flex-1">
                              <MathRenderer content={opt.text} />
                            </div>
                            {opt.isCorrect && (
                              <CheckCircle2 className="text-success size-4 shrink-0" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Numerical / Value answer display */}
                    {q.correctValue !== undefined && (
                      <div className="bg-success/10 border-success/30 rounded-lg border p-3 text-sm">
                        <span className="font-semibold text-success">Correct Value: </span>
                        <span className="font-mono font-bold">{q.correctValue}</span>
                        {q.unit && <span className="ml-1 text-xs">{q.unit}</span>}
                        {q.toleranceAbsolute ? (
                          <span className="text-xs text-base-content/60 ml-2">(±{q.toleranceAbsolute})</span>
                        ) : null}
                      </div>
                    )}

                    {/* Fill blank answer display */}
                    {q.acceptedAnswers && q.acceptedAnswers.length > 0 && (
                      <div className="bg-success/10 border-success/30 rounded-lg border p-3 text-sm">
                        <span className="font-semibold text-success">Accepted Answers: </span>
                        <span className="font-mono font-medium">{q.acceptedAnswers.join(' | ')}</span>
                      </div>
                    )}

                    {/* Tags */}
                    {q.tags && q.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {q.tags.map((t) => (
                          <span key={t} className="badge badge-ghost badge-sm text-[0.6875rem]">
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Solution Accordion */}
                    {q.solution && (
                      <div className="border-base-300 border-t pt-3">
                        <button
                          type="button"
                          onClick={() => toggleSolution(q.id)}
                          className="btn btn-ghost btn-xs text-primary gap-1 font-semibold"
                        >
                          <Sparkles className="size-3.5" />
                          {isSolutionOpen ? 'Hide Solution' : 'View Verified Solution'}
                          <ChevronDown className={`size-3 transition-transform ${isSolutionOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isSolutionOpen && (
                          <div className="bg-base-200/70 border-base-300 mt-2.5 rounded-xl border p-4 text-sm">
                            <div className="text-primary mb-2 text-xs font-bold tracking-wide uppercase">
                              Verified Derivation & Explanation
                            </div>
                            <MathRenderer content={q.solution} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-base-300">
              <div className="text-xs text-base-content/70">
                Showing page <span className="font-semibold text-base-content">{page}</span> of{' '}
                <span className="font-semibold text-base-content">{totalPages}</span> ({totalCount} total questions)
              </div>
              <div className="join shadow-xs">
                <button
                  type="button"
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1}
                  className="join-item btn btn-sm btn-outline gap-1"
                >
                  <ChevronLeft className="size-4" />
                  Prev
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  let p = i + 1;
                  if (totalPages > 7) {
                    if (page > 4 && page < totalPages - 2) {
                      p = page - 3 + i;
                    } else if (page >= totalPages - 2) {
                      p = totalPages - 6 + i;
                    }
                  }
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handlePageChange(p)}
                      className={`join-item btn btn-sm ${p === page ? 'btn-primary' : 'btn-outline'}`}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages}
                  className="join-item btn btn-sm btn-outline gap-1"
                >
                  Next
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================================
          Import Modal (Markdown v2 & JSON tabs)
         ====================================================================== */}
      {showImportModal && (
        <div className="modal modal-open modal-bottom sm:modal-middle bg-black/60 backdrop-blur-xs">
          <div className="modal-box border-base-300 max-w-4xl border p-6">
            <div className="flex items-center justify-between pb-4">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Upload className="text-primary size-5" />
                  Import Questions
                </h3>
                <p className="text-base-content/70 text-xs">
                  Paste or upload questions in Canonical Markdown v2 or JSON format.
                </p>
              </div>
              <button onClick={() => setShowImportModal(false)} className="btn btn-sm btn-circle btn-ghost">
                ✕
              </button>
            </div>

            {/* Format Segmented Switch */}
            <div className="tabs tabs-boxed bg-base-200/60 p-1 mb-3">
              <button
                type="button"
                onClick={() => {
                  setImportFormat('MARKDOWN');
                  handleTextChange(textInput, 'MARKDOWN');
                }}
                className={`tab tab-sm font-semibold gap-1.5 ${importFormat === 'MARKDOWN' ? 'tab-active bg-primary text-primary-content shadow-xs' : ''}`}
              >
                <FileCode2 className="size-3.5" />
                Markdown v2 Format
              </button>
              <button
                type="button"
                onClick={() => {
                  setImportFormat('JSON');
                  handleTextChange(textInput, 'JSON');
                }}
                className={`tab tab-sm font-semibold gap-1.5 ${importFormat === 'JSON' ? 'tab-active bg-primary text-primary-content shadow-xs' : ''}`}
              >
                <FileJson className="size-3.5" />
                JSON Format
              </button>
            </div>

            {importSuccessMsg ? (
              <div className="alert alert-success my-3 shadow-sm">
                <CheckCircle2 className="size-5" />
                <span>{importSuccessMsg}</span>
              </div>
            ) : null}

            {/* Template loader */}
            <div className="flex items-center justify-between py-1 text-xs">
              <span className="text-base-content/60 font-medium">
                {importFormat === 'MARKDOWN'
                  ? 'Canonical delimiter: === question ==='
                  : 'JSON array of QuestionModel objects'}
              </span>
              <button
                type="button"
                onClick={() =>
                  handleTextChange(importFormat === 'MARKDOWN' ? sampleMarkdownTemplate : sampleJsonTemplate)
                }
                className="btn btn-ghost btn-xs text-primary font-semibold"
              >
                Load Sample Template
              </button>
            </div>

            {/* Textarea */}
            <textarea
              rows={11}
              placeholder={
                importFormat === 'MARKDOWN'
                  ? 'Paste Markdown here starting with --- ...'
                  : 'Paste JSON array here [ { "id": "...", ... } ]'
              }
              value={textInput}
              onChange={(e) => handleTextChange(e.target.value)}
              className="textarea textarea-bordered w-full font-mono text-sm leading-relaxed"
            />

            {/* Real-time Diagnostics Display */}
            {importResult && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>Detected: {importResult.questions.length} valid question(s)</span>
                  <span className={importResult.hasErrors ? 'text-error' : 'text-success'}>
                    {importResult.hasErrors ? 'Validation Errors Present' : 'Ready to Import'}
                  </span>
                </div>

                {/* Diagnostic Items */}
                <div className="max-h-36 overflow-y-auto space-y-1.5">
                  {importResult.diagnostics.map((diagGroup, gIdx) =>
                    diagGroup.diagnostics.map((d, dIdx) => (
                      <div
                        key={`${gIdx}_${dIdx}`}
                        className={`alert alert-sm p-2 text-xs shadow-xs ${
                          d.level === 'ERROR'
                            ? 'alert-error'
                            : d.level === 'WARNING'
                            ? 'alert-warning'
                            : 'alert-info'
                        }`}
                      >
                        {d.level === 'ERROR' ? (
                          <AlertCircle className="size-3.5 shrink-0" />
                        ) : d.level === 'WARNING' ? (
                          <AlertCircle className="size-3.5 shrink-0" />
                        ) : (
                          <Info className="size-3.5 shrink-0" />
                        )}
                        <div>
                          <span className="font-bold mr-1">
                            [{d.level}] {diagGroup.questionId ? `(${diagGroup.questionId})` : ''}:
                          </span>
                          <span>{d.message}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="modal-action pt-3">
              <button onClick={() => setShowImportModal(false)} className="btn btn-ghost btn-sm">
                Cancel
              </button>
              <button
                onClick={handleExecuteImport}
                disabled={!importResult || importResult.questions.length === 0 || importResult.hasErrors}
                className="btn btn-primary btn-sm gap-2"
              >
                <Upload className="size-4" />
                Import {importResult?.questions.length || 0} Questions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Format Suffix Modal */}
      {showAiStudio && (
        <AiPromptModal
          isOpen={showAiStudio}
          onClose={() => setShowAiStudio(false)}
        />
      )}
    </div>
  );
}
