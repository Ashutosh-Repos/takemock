/**
 * Test Hub & Examination Studio.
 * Multi-modal test building and launching suite supporting:
 * 1. ⚡ Quick Practice Drills (3-second topic generation)
 * 2. 📋 Standard Exam Presets (JEE Main, NEET, GATE CS, Speed Drills)
 * 3. 🔁 Mistake Vault Drill (History-driven targeted revision)
 * 4. 🛠 Advanced Custom Designer with DUAL-MODE BIDIRECTIONAL SYNC:
 *    - Real-time two-way synchronization between visual UI controls and live Markdown/JSON editor
 *    - Changes in UI immediately reflect in code; edits/pastes in code immediately update visual UI
 *    - Bulk selection ("Add All Filtered into Section")
 * 5. 🤖 AI Prompt Generator & LLM Contract Assistant (docs/llm_question_prompt_standard_v2.md)
 * 6. 📚 Saved Tests Gallery
 *
 * Adheres strictly to docs/master_architecture_prompt_v2.md Sections 0, 8, 10, 13, 14, 15.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertCircle,
  Award,
  BookOpen,
  Bot,
  Clock,
  Columns2,
  Compass,
  Copy,
  DraftingCompass,
  FileCheck2,
  FileCode2,
  Flame,
  FolderPlus,
  Layers,
  Play,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Split,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';
import { AiPromptModal } from '@/components/shared/AiPromptModal';
import { pickImportFile } from '@/core/native/tauriBridge';
import { detectContentFormat, stripCodeFences } from '@/core/parser/llmSanitizer';
import {
  parseFullTestJson,
  parseFullTestMarkdown,
  serializeTestToJson,
  serializeTestToMarkdown,
} from '@/core/parser/testSerializer';
import type { ExamPresetDefinition } from '@/core/presets/examPresets';
import { assessmentRepository } from '@/core/storage/repository';
import type { QuestionModel } from '@/types/question';
import type { NavigationMode, TestDefinition, TestMode, TimingMode } from '@/types/test';

type HubTab = 'QUICK_DRILL' | 'EXAM_PRESETS' | 'MISTAKE_VAULT' | 'CUSTOM_DESIGNER' | 'SAVED_TESTS';
type DesignerViewMode = 'SPLIT' | 'VISUAL_ONLY' | 'CODE_ONLY';
type CodeFormat = 'MARKDOWN' | 'JSON';

export function Builder() {
  const navigate = useNavigate();

  // Active Hub Tab
  const [activeTab, setActiveTab] = useState<HubTab>('QUICK_DRILL');

  // Shared Data
  const [availableQuestions, setAvailableQuestions] = useState<QuestionModel[]>([]);
  const [existingTests, setExistingTests] = useState<TestDefinition[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [presetAvailability, setPresetAvailability] = useState<
    Array<{
      preset: ExamPresetDefinition;
      isSatisfiable: boolean;
      totalAvailable: number;
      totalRequired: number;
      percentage: number;
    }>
  >([]);
  const [mistakeCount, setMistakeCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // ---------------------------------------------------------------------------
  // TAB 1: Quick Drill State
  // ---------------------------------------------------------------------------
  const [quickSubject, setQuickSubject] = useState('ALL');
  const [quickTopic, setQuickTopic] = useState('ALL');
  const [quickDifficulty, setQuickDifficulty] = useState<'all' | 'easy' | 'medium' | 'hard'>('all');
  const [quickCount, setQuickCount] = useState<number>(10);
  const [quickDuration, setQuickDuration] = useState<number>(15);
  const [quickMode, setQuickMode] = useState<TestMode>('PRACTICE');

  // ---------------------------------------------------------------------------
  // TAB 4: Custom Designer State (Visual UI)
  // ---------------------------------------------------------------------------
  const [customTitle, setCustomTitle] = useState('New Examination Blueprint');
  const [customDescription, setCustomDescription] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [customMode, setCustomMode] = useState<TestMode>('EXAM');
  const [customTimingMode, setCustomTimingMode] = useState<TimingMode>('GLOBAL');
  const [customDurationMinutes, setCustomDurationMinutes] = useState(60);
  const [customNavMode, setCustomNavMode] = useState<NavigationMode>('FREE');
  const [customDefaultMarks, setCustomDefaultMarks] = useState(4);
  const [customNegativeMarks, setCustomNegativeMarks] = useState(1);
  const [customAllowPartialCredit, setCustomAllowPartialCredit] = useState(true);

  // Custom Sections
  const [sections, setSections] = useState<
    Array<{
      id: string;
      title: string;
      selectedQuestionIds: string[];
    }>
  >([
    {
      id: 'sec_1',
      title: 'Section 1: General',
      selectedQuestionIds: [],
    },
  ]);
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);

  // Bulk question picker filters inside Custom Designer
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerSubject, setPickerSubject] = useState('ALL');
  const [pickerDifficulty, setPickerDifficulty] = useState('ALL');

  // ---------------------------------------------------------------------------
  // DUAL-MODE BIDIRECTIONAL SYNC STATE
  // ---------------------------------------------------------------------------
  const [designerViewMode, setDesignerViewMode] = useState<DesignerViewMode>('SPLIT');
  const [codeFormat, setCodeFormat] = useState<CodeFormat>('MARKDOWN');
  const [codeText, setCodeText] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const isUpdatingFromCodeRef = useRef(false);
  const isUpdatingFromUiRef = useRef(false);

  // ---------------------------------------------------------------------------
  // AI PROMPT ASSISTANT & STUDIO (docs/llm_question_prompt_standard_v2.md)
  // ---------------------------------------------------------------------------
  const [showAiModal, setShowAiModal] = useState(false);

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------
  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [qs, ts, distSubjects, availability, attempts] = await Promise.all([
        assessmentRepository.getQuestions(),
        assessmentRepository.getTests(),
        assessmentRepository.getDistinctSubjects(),
        assessmentRepository.getPresetAvailability(),
        assessmentRepository.getAttempts(),
      ]);

      setAvailableQuestions(qs);
      setExistingTests(ts);
      setSubjects(distSubjects);
      setPresetAvailability(availability);

      const distTopics = Array.from(new Set(qs.map((q) => q.topic).filter(Boolean)));
      setTopics(distTopics);

      const wrongIds = new Set<string>();
      for (const att of attempts) {
        if (att.scoreResult?.questionScores) {
          for (const [qId, qScore] of Object.entries(att.scoreResult.questionScores)) {
            if (qScore.status === 'INCORRECT') {
              wrongIds.add(qId);
            }
          }
        }
      }
      setMistakeCount(wrongIds.size);

      // Pre-select questions for section 1 if empty
      if (qs.length > 0 && sections[0].selectedQuestionIds.length === 0) {
        setSections([
          {
            id: 'sec_1',
            title: 'Section 1: General',
            selectedQuestionIds: qs.slice(0, Math.min(5, qs.length)).map((q) => q.id),
          },
        ]);
      }
    } catch (err) {
      console.error('Failed to load Test Hub data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // ---------------------------------------------------------------------------
  // BIDIRECTIONAL SYNC: UI -> CODE
  // When visual state changes, re-serialize into codeText
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isUpdatingFromCodeRef.current) return;

    isUpdatingFromUiRef.current = true;
    try {
      const qMap = new Map(availableQuestions.map((q) => [q.id, q]));
      const sectionsWithQuestions = sections.map((sec) => ({
        id: sec.id,
        title: sec.title,
        questions: sec.selectedQuestionIds.map((id) => qMap.get(id)).filter(Boolean) as QuestionModel[],
      }));

      const meta = {
        title: customTitle,
        description: customDescription,
        instructions: customInstructions,
        mode: customMode,
        timingMode: customTimingMode,
        durationMinutes: customDurationMinutes,
        navigation: customNavMode,
        defaultMarks: customDefaultMarks,
        negativeMarks: customNegativeMarks,
        allowPartialCredit: customAllowPartialCredit,
      };

      if (codeFormat === 'MARKDOWN') {
        const md = serializeTestToMarkdown(meta, sectionsWithQuestions);
        setCodeText(md);
      } else {
        const json = serializeTestToJson(meta, sectionsWithQuestions);
        setCodeText(json);
      }
      setCodeError(null);
    } finally {
      isUpdatingFromUiRef.current = false;
    }
  }, [
    customTitle,
    customDescription,
    customInstructions,
    customMode,
    customTimingMode,
    customDurationMinutes,
    customNavMode,
    customDefaultMarks,
    customNegativeMarks,
    customAllowPartialCredit,
    sections,
    codeFormat,
    availableQuestions,
  ]);

  // ---------------------------------------------------------------------------
  // BIDIRECTIONAL SYNC: CODE -> UI
  // When user types or pastes into the code editor, parse and update visual UI
  // ---------------------------------------------------------------------------
  const handleCodeTextChange = useCallback(
    async (newCode: string, format = codeFormat) => {
      // Auto-strip code fences if pasted from an LLM
      const cleaned = stripCodeFences(newCode);
      setCodeText(cleaned);
      if (isUpdatingFromUiRef.current) return;

      if (!cleaned.trim()) {
        setCodeError(null);
        return;
      }

      isUpdatingFromCodeRef.current = true;
      try {
        // Auto-detect format in case user pastes JSON in Markdown mode or vice versa
        const detected = detectContentFormat(cleaned);
        let effectiveFormat = format;
        if (detected === 'JSON_QUESTIONS' || detected === 'JSON_FULL_TEST') {
          effectiveFormat = 'JSON';
          if (codeFormat !== 'JSON') setCodeFormat('JSON');
        } else if (detected === 'MARKDOWN_QUESTIONS' || detected === 'MARKDOWN_FULL_TEST') {
          effectiveFormat = 'MARKDOWN';
          if (codeFormat !== 'MARKDOWN') setCodeFormat('MARKDOWN');
        }

        let parsed;
        if (effectiveFormat === 'MARKDOWN') {
          parsed = parseFullTestMarkdown(cleaned);
        } else {
          parsed = parseFullTestJson(cleaned);
        }

        if (parsed.errors && parsed.errors.length > 0 && parsed.allQuestions.length === 0) {
          setCodeError(parsed.errors.join(' | '));
          return;
        }

        setCodeError(null);

        // Reflect parsed metadata into visual UI
        if (parsed.title !== undefined) setCustomTitle(parsed.title);
        if (parsed.description !== undefined) setCustomDescription(parsed.description);
        if (parsed.instructions !== undefined) setCustomInstructions(parsed.instructions);
        if (parsed.mode) setCustomMode(parsed.mode);
        if (parsed.timingMode) setCustomTimingMode(parsed.timingMode);
        if (parsed.durationMinutes !== undefined) setCustomDurationMinutes(parsed.durationMinutes);
        if (parsed.navigation) setCustomNavMode(parsed.navigation);
        if (parsed.defaultMarks !== undefined) setCustomDefaultMarks(parsed.defaultMarks);
        if (parsed.negativeMarks !== undefined) setCustomNegativeMarks(parsed.negativeMarks);
        if (parsed.allowPartialCredit !== undefined) setCustomAllowPartialCredit(parsed.allowPartialCredit);

        // Commit any newly authored questions into the bank
        if (parsed.allQuestions.length > 0) {
          await assessmentRepository.commitQuestions(parsed.allQuestions);
          const allQs = await assessmentRepository.getQuestions();
          setAvailableQuestions(allQs);
        }

        // Reflect parsed sections
        if (parsed.sections && parsed.sections.length > 0) {
          setSections(
            parsed.sections.map((s) => ({
              id: s.id,
              title: s.title,
              selectedQuestionIds: s.questions.map((q) => q.id),
            }))
          );
        }
      } catch (err: any) {
        setCodeError(err.message || 'Syntax error in code');
      } finally {
        isUpdatingFromCodeRef.current = false;
      }
    },
    [codeFormat]
  );

  // ---------------------------------------------------------------------------
  // Action Handlers
  // ---------------------------------------------------------------------------

  // Launch Quick Drill
  const handleLaunchQuickDrill = async () => {
    if (quickDrillMatchingCount === 0) {
      alert('No questions in the bank match your criteria. Please adjust your filters or import questions.');
      return;
    }
    const countToTake = Math.min(quickCount, quickDrillMatchingCount);

    setActionLoading(true);
    try {
      const attempt = await assessmentRepository.generateQuickDrill({
        subject: quickSubject,
        topic: quickTopic !== 'ALL' ? quickTopic : undefined,
        difficulty: quickDifficulty !== 'all' ? quickDifficulty : undefined,
        count: countToTake,
        durationMinutes: quickDuration,
        mode: quickMode,
      });
      navigate(`/runner/${attempt.id}`);
    } catch (err: any) {
      alert(`Failed to launch Quick Drill: ${err.message || 'Unknown error'}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Launch Exam Preset
  const handleLaunchPreset = async (presetId: string) => {
    setActionLoading(true);
    try {
      const attempt = await assessmentRepository.generatePresetExam(presetId);
      navigate(`/runner/${attempt.id}`);
    } catch (err: any) {
      alert(`Could not launch exam preset: ${err.message || 'Unknown error'}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Launch Mistake Vault
  const handleLaunchMistakeVault = async () => {
    if (mistakeCount === 0) {
      alert('Your Mistake Vault is empty! Complete some mock tests or drills first.');
      return;
    }
    setActionLoading(true);
    try {
      const attempt = await assessmentRepository.generateMistakeDrill(20);
      navigate(`/runner/${attempt.id}`);
    } catch (err: any) {
      alert(`Could not launch Mistake Vault: ${err.message || 'Unknown error'}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Launch Existing Saved Test
  const handleLaunchSavedTest = async (testId: string) => {
    setActionLoading(true);
    try {
      const attempt = await assessmentRepository.startAttempt(testId);
      navigate(`/runner/${attempt.id}`);
    } catch (err: any) {
      alert(`Failed to start test: ${err.message || 'Unknown error'}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Delete Saved Test
  const handleDeleteSavedTest = async (e: React.MouseEvent, testId: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this test blueprint?')) return;
    try {
      await assessmentRepository.deleteTest(testId);
      await loadAllData();
    } catch (err: any) {
      alert(`Error deleting test: ${err.message || 'Unknown error'}`);
    }
  };

  // Import Full Test Package File
  const handleImportTestPackage = async () => {
    try {
      const picked = await pickImportFile();
      if (!picked) return;

      try {
        const parsed = JSON.parse(picked.content);
        if (parsed.test && parsed.test.sections) {
          await assessmentRepository.importWholeTestPackage(parsed);
          await loadAllData();
          alert(`Test "${parsed.test.title}" imported successfully!`);
          setActiveTab('SAVED_TESTS');
          return;
        } else if (parsed.sections) {
          await assessmentRepository.saveTest(parsed);
          await loadAllData();
          alert(`Test "${parsed.title}" imported successfully!`);
          setActiveTab('SAVED_TESTS');
          return;
        }
      } catch {
        // Fallback: If Markdown or question list
        const res = await assessmentRepository.importQuestionsFromMarkdown(picked.content);
        if (res.questions.length > 0) {
          await loadAllData();
          alert(`Imported ${res.questions.length} questions into Question Bank!`);
        } else {
          alert('Could not parse valid test or questions from the selected file.');
        }
      }
    } catch (err: any) {
      alert(`Import error: ${err.message || 'Unknown error'}`);
    }
  };

  // Save Custom Test
  const handleSaveCustomTest = async (launchImmediately: boolean = false) => {
    if (!customTitle.trim()) {
      alert('Please provide a Test Title');
      return;
    }

    const totalSelected = sections.reduce((acc, s) => acc + s.selectedQuestionIds.length, 0);
    if (totalSelected === 0) {
      alert('Please select or author at least one question for your test sections.');
      return;
    }

    const testDef: TestDefinition = {
      id: `test_${Date.now()}`,
      title: customTitle.trim(),
      description: customDescription.trim(),
      instructions: customInstructions.trim() || undefined,
      mode: customMode,
      schemaVersion: '2.0',
      version: 1,
      sections: sections.map((sec, idx) => ({
        id: sec.id,
        title: sec.title.trim() || `Section ${idx + 1}`,
        order: idx,
        selection: {
          mode: 'STATIC',
          staticQuestionIds: sec.selectedQuestionIds.map((id) => ({ id })),
        },
      })),
      timing: {
        mode: customTimingMode,
        totalDurationSeconds: customTimingMode === 'NONE' ? 0 : customDurationMinutes * 60,
        allowPause: customMode === 'PRACTICE',
        autoSubmitOnExpiry: true,
        warnThresholdSeconds: 300,
      },
      scoring: {
        defaultMarks: customDefaultMarks,
        defaultNegativeMarks: customNegativeMarks,
        allowPartialCredit: customAllowPartialCredit,
      },
      navigation: customNavMode,
      randomization: {
        shuffleQuestions: false,
        shuffleOptions: false,
      },
      feedback: {
        showImmediateSolution: customMode === 'PRACTICE',
        showHint: customMode === 'PRACTICE',
        allowCheckAnswer: customMode === 'PRACTICE',
        showDetailedSolutionsAfterSubmit: true,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await assessmentRepository.saveTest(testDef);
      if (launchImmediately) {
        const attempt = await assessmentRepository.startAttempt(testDef.id);
        navigate(`/runner/${attempt.id}`);
      } else {
        await loadAllData();
        alert('Test Blueprint saved successfully!');
        setActiveTab('SAVED_TESTS');
      }
    } catch (err: any) {
      alert(`Error saving test: ${err.message || 'Unknown error'}`);
    }
  };

  // Section Management Helpers
  const activeSection = sections[activeSectionIndex] || sections[0];

  const handleAddSection = () => {
    const nextIdx = sections.length + 1;
    setSections((prev) => [
      ...prev,
      {
        id: `sec_${nextIdx}`,
        title: `Section ${nextIdx}: Subject Area`,
        selectedQuestionIds: [],
      },
    ]);
    setActiveSectionIndex(sections.length);
  };

  const handleRemoveSection = (index: number) => {
    if (sections.length <= 1) return;
    setSections((prev) => prev.filter((_, idx) => idx !== index));
    setActiveSectionIndex(0);
  };

  const toggleQuestionSelection = (questionId: string) => {
    setSections((prev) => {
      const current = prev[activeSectionIndex];
      const isSelected = current.selectedQuestionIds.includes(questionId);
      const updatedIds = isSelected
        ? current.selectedQuestionIds.filter((id) => id !== questionId)
        : [...current.selectedQuestionIds, questionId];

      const copy = [...prev];
      copy[activeSectionIndex] = { ...current, selectedQuestionIds: updatedIds };
      return copy;
    });
  };

  // Bulk: Add all matching questions to active section
  const handleBulkAddFiltered = () => {
    const matchingIds = filteredQuestionsForPicker.map((q) => q.id);
    if (matchingIds.length === 0) return;

    setSections((prev) => {
      const current = prev[activeSectionIndex];
      const merged = Array.from(new Set([...current.selectedQuestionIds, ...matchingIds]));
      const copy = [...prev];
      copy[activeSectionIndex] = { ...current, selectedQuestionIds: merged };
      return copy;
    });
  };

  // Bulk: Clear active section
  const handleBulkClearSection = () => {
    setSections((prev) => {
      const current = prev[activeSectionIndex];
      const copy = [...prev];
      copy[activeSectionIndex] = { ...current, selectedQuestionIds: [] };
      return copy;
    });
  };

  // Copy code to clipboard
  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(codeText);
    alert('Code copied to clipboard!');
  };

  // Paste from clipboard into live code editor
  const handlePasteCode = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        handleCodeTextChange(text);
      }
    } catch {
      alert('Could not read clipboard. Please paste manually into the code editor.');
    }
  };

  // Quick Drill Matching Filter
  const filteredTopicsForQuickDrill = useMemo(() => {
    if (quickSubject === 'ALL') return topics;
    const match = availableQuestions.filter(
      (q) => q.subject.toLowerCase() === quickSubject.toLowerCase()
    );
    return Array.from(new Set(match.map((q) => q.topic).filter(Boolean)));
  }, [quickSubject, availableQuestions, topics]);

  const quickDrillMatchingCount = useMemo(() => {
    return availableQuestions.filter((q) => {
      if (quickSubject !== 'ALL' && q.subject.toLowerCase() !== quickSubject.toLowerCase()) return false;
      if (quickTopic !== 'ALL' && q.topic.toLowerCase() !== quickTopic.toLowerCase()) return false;
      if (quickDifficulty !== 'all' && q.difficulty !== quickDifficulty) return false;
      return true;
    }).length;
  }, [availableQuestions, quickSubject, quickTopic, quickDifficulty]);

  // Filtered questions for the custom question picker
  const filteredQuestionsForPicker = useMemo(() => {
    return availableQuestions.filter((q) => {
      if (pickerSubject !== 'ALL' && q.subject.toLowerCase() !== pickerSubject.toLowerCase()) return false;
      if (pickerDifficulty !== 'ALL' && q.difficulty !== pickerDifficulty) return false;
      if (pickerSearch) {
        const term = pickerSearch.toLowerCase();
        const matchesBody = q.body.toLowerCase().includes(term);
        const matchesTopic = q.topic.toLowerCase().includes(term);
        const matchesTags = q.tags?.some((t) => t.toLowerCase().includes(term));
        if (!matchesBody && !matchesTopic && !matchesTags) return false;
      }
      return true;
    });
  }, [availableQuestions, pickerSubject, pickerDifficulty, pickerSearch]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-12">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-7xl space-y-8 p-6 pb-36 md:p-10 select-none">
      {/* Top Header */}
      <div className="border-base-300 flex flex-col justify-between gap-4 border-b pb-6 md:flex-row md:items-center">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="badge badge-primary gap-1 font-bold shadow-xs">
              <Compass className="size-3.5" />
              Test Hub
            </span>
            <span className="badge badge-outline border-base-300 gap-1 text-xs">
              <Award className="size-3" />
              Dual-Mode Assessment Studio
            </span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">Test Builder & Exam Studio</h1>
          <p className="text-base-content/70 mt-1 text-sm md:text-base">
            Instant drills, official competitive presets, mistake vaults, or bidirectional custom blueprints.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAiModal(true)}
            className="btn btn-primary btn-sm gap-2 shadow-sm font-bold"
          >
            <Bot className="size-4" />
            AI Prompt Assistant
          </button>
          <button
            type="button"
            onClick={handleImportTestPackage}
            className="btn btn-outline border-base-300 btn-sm gap-2 shadow-xs"
            title="Import test bundle or questions"
          >
            <Upload className="size-4 text-primary" />
            Import Test Paper
          </button>
        </div>
      </div>

      {/* Main Mode Navigation Tabs (DaisyUI 5 Tabs Boxed) */}
      <div className="tabs tabs-boxed bg-base-200/70 p-1.5 flex flex-wrap gap-1 shadow-xs border border-base-300">
        <button
          type="button"
          onClick={() => setActiveTab('QUICK_DRILL')}
          className={`tab tab-md font-bold gap-2 transition-all ${
            activeTab === 'QUICK_DRILL' ? 'tab-active bg-primary text-primary-content shadow-xs' : ''
          }`}
        >
          <Zap className="size-4" />
          ⚡ Quick Drill
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('EXAM_PRESETS')}
          className={`tab tab-md font-bold gap-2 transition-all ${
            activeTab === 'EXAM_PRESETS' ? 'tab-active bg-primary text-primary-content shadow-xs' : ''
          }`}
        >
          <Flame className="size-4" />
          📋 Exam Presets
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('MISTAKE_VAULT')}
          className={`tab tab-md font-bold gap-2 transition-all ${
            activeTab === 'MISTAKE_VAULT' ? 'tab-active bg-primary text-primary-content shadow-xs' : ''
          }`}
        >
          <RotateCcw className="size-4" />
          🔁 Mistake Vault ({mistakeCount})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('CUSTOM_DESIGNER')}
          className={`tab tab-md font-bold gap-2 transition-all ${
            activeTab === 'CUSTOM_DESIGNER' ? 'tab-active bg-primary text-primary-content shadow-xs' : ''
          }`}
        >
          <DraftingCompass className="size-4" />
          🛠 Custom Designer (Live Sync)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('SAVED_TESTS')}
          className={`tab tab-md font-bold gap-2 transition-all ${
            activeTab === 'SAVED_TESTS' ? 'tab-active bg-primary text-primary-content shadow-xs' : ''
          }`}
        >
          <BookOpen className="size-4" />
          📚 Saved Tests ({existingTests.length})
        </button>
      </div>

      {/* ======================================================================
          TAB 1: ⚡ QUICK PRACTICE DRILL GENERATOR
         ====================================================================== */}
      {activeTab === 'QUICK_DRILL' && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="bg-base-100 border-base-300 rounded-box border p-6 shadow-sm space-y-6 lg:col-span-8">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Zap className="text-warning size-5 fill-warning" />
                Configure Quick Practice Drill
              </h2>
              <p className="text-base-content/70 text-xs mt-1">
                Generate an immediate targeted drill from your question bank in 3 seconds.
              </p>
            </div>

            {/* Subject & Topic Selectors */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-base-content/70 uppercase">Subject Area</label>
                <select
                  value={quickSubject}
                  onChange={(e) => {
                    setQuickSubject(e.target.value);
                    setQuickTopic('ALL');
                  }}
                  className="select select-bordered mt-1.5 w-full font-medium"
                >
                  <option value="ALL">All Subjects (Mixed)</option>
                  {subjects.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-base-content/70 uppercase">Topic / Chapter</label>
                <select
                  value={quickTopic}
                  onChange={(e) => setQuickTopic(e.target.value)}
                  className="select select-bordered mt-1.5 w-full font-medium"
                >
                  <option value="ALL">All Topics</option>
                  {filteredTopicsForQuickDrill.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Difficulty & Count */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-base-content/70 uppercase">Difficulty Tier</label>
                <div className="join grid grid-cols-4 mt-1.5 shadow-2xs">
                  {(['all', 'easy', 'medium', 'hard'] as const).map((diff) => (
                    <button
                      key={diff}
                      type="button"
                      onClick={() => setQuickDifficulty(diff)}
                      className={`join-item btn btn-sm capitalize ${
                        quickDifficulty === diff ? 'btn-primary' : 'btn-outline border-base-300'
                      }`}
                    >
                      {diff}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-base-content/70 uppercase">Question Count</label>
                <div className="join grid grid-cols-6 mt-1.5 shadow-2xs">
                  {[5, 10, 15, 20, 25, 30].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setQuickCount(num)}
                      className={`join-item btn btn-sm ${
                        quickCount === num ? 'btn-primary' : 'btn-outline border-base-300'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Duration & Delivery Mode */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-base-content/70 uppercase">Timer / Duration</label>
                <select
                  value={quickDuration}
                  onChange={(e) => setQuickDuration(Number(e.target.value))}
                  className="select select-bordered mt-1.5 w-full font-medium"
                >
                  <option value={0}>Untimed (Relaxed Practice)</option>
                  <option value={10}>10 Minutes (Speed Blitz)</option>
                  <option value={15}>15 Minutes (Standard Drill)</option>
                  <option value={30}>30 Minutes (Deep Focus)</option>
                  <option value={45}>45 Minutes (Sectional)</option>
                  <option value={60}>60 Minutes (Hour Drill)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-base-content/70 uppercase">Feedback Mode</label>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  <button
                    type="button"
                    onClick={() => setQuickMode('PRACTICE')}
                    className={`btn btn-sm ${
                      quickMode === 'PRACTICE' ? 'btn-secondary shadow-xs' : 'btn-outline border-base-300'
                    }`}
                  >
                    <Sparkles className="size-3.5 mr-1" />
                    Practice (Instant)
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuickMode('EXAM')}
                    className={`btn btn-sm ${
                      quickMode === 'EXAM' ? 'btn-primary shadow-xs' : 'btn-outline border-base-300'
                    }`}
                  >
                    <ShieldAlert className="size-3.5 mr-1" />
                    Exam (Score at End)
                  </button>
                </div>
              </div>
            </div>

            {/* Launch CTA */}
            <div className="bg-base-200/50 rounded-xl border border-base-300 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs">
                <span className="font-semibold text-base-content/80">Matching Question Pool:</span>{' '}
                <span className="badge badge-sm badge-neutral font-mono font-bold">
                  {quickDrillMatchingCount} available
                </span>
                {quickDrillMatchingCount < quickCount && quickDrillMatchingCount > 0 && (
                  <span className="text-warning text-xs block mt-0.5">
                    Will select all {quickDrillMatchingCount} matching questions available.
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleLaunchQuickDrill}
                disabled={actionLoading || quickDrillMatchingCount === 0}
                className="btn btn-primary gap-2 w-full sm:w-auto shadow-sm font-bold text-sm"
              >
                <Play className="size-4 fill-current" />
                {actionLoading ? 'Generating Drill...' : 'Start Practice Drill Now'}
              </button>
            </div>
          </div>

          {/* Quick Drill Right Sidebar: Tips */}
          <div className="space-y-4 lg:col-span-4">
            <div className="bg-base-100 border-base-300 rounded-box border p-5 shadow-sm space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-1.5">
                <Sparkles className="text-primary size-4" />
                How Quick Drill Works
              </h3>
              <ul className="text-xs text-base-content/70 space-y-2 list-disc list-inside">
                <li>Samples eligible questions from your offline bank using deterministic PRNG.</li>
                <li>Preserves passage groups atomically without separating reading passages.</li>
                <li>Practice mode lets you check explanations and mathematical derivations instantly.</li>
                <li>Everything runs 100% locally and offline on your device.</li>
              </ul>
            </div>

            <div className="bg-primary/10 border-primary/30 rounded-box border p-5 space-y-2 text-xs">
              <div className="font-bold text-primary flex items-center gap-1.5">
                <Award className="size-4" /> Total Bank Inventory
              </div>
              <div className="text-2xl font-black font-mono">{availableQuestions.length} Questions</div>
              <p className="text-base-content/70">
                Spanning {subjects.length} subject area(s) and {topics.length} topic(s).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          TAB 2: 📋 STANDARDIZED EXAM PRESETS
         ====================================================================== */}
      {activeTab === 'EXAM_PRESETS' && (
        <div className="space-y-6">
          <div className="bg-base-200/50 border-base-300 rounded-box border p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                <Flame className="text-error size-5 fill-error" />
                Standardized Exam Blueprints
              </h3>
              <p className="text-base-content/70 text-xs">
                Authoritative mock examinations modeled after official competitive exam patterns.
              </p>
            </div>
            <span className="badge badge-sm badge-outline border-base-300">
              1-Click Deterministic Generation
            </span>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {presetAvailability.map((item) => {
              const { preset, isSatisfiable, totalAvailable, totalRequired, percentage } = item;

              return (
                <div
                  key={preset.id}
                  className="bg-base-100 border-base-300 rounded-box flex flex-col justify-between border p-6 shadow-sm hover:border-primary/40 transition-all space-y-4"
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="badge badge-primary badge-sm font-bold uppercase font-mono">
                        {preset.category.replace('_', ' ')}
                      </span>
                      <span className="text-xs font-mono font-semibold text-base-content/70 flex items-center gap-1">
                        <Clock className="size-3.5" />
                        {preset.totalDurationMinutes} mins
                      </span>
                    </div>

                    <div>
                      <h4 className="text-lg font-bold">{preset.title}</h4>
                      <p className="text-xs text-base-content/70 mt-1 leading-relaxed">
                        {preset.description}
                      </p>
                    </div>

                    {/* Section Badges */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {preset.sections.map((s) => (
                        <span key={s.id} className="badge badge-ghost badge-sm text-xs font-medium">
                          {s.title} ({s.questionCount} Qs)
                        </span>
                      ))}
                    </div>

                    {/* Inventory Availability Progress Bar */}
                    <div className="space-y-1.5 pt-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-base-content/70">Question Bank Availability:</span>
                        <span className="font-mono font-bold">
                          {totalAvailable} / {totalRequired} ({percentage}%)
                        </span>
                      </div>
                      <progress
                        className={`progress w-full h-2 ${
                          isSatisfiable ? 'progress-success' : percentage > 50 ? 'progress-warning' : 'progress-error'
                        }`}
                        value={percentage}
                        max={100}
                      />
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => handleLaunchPreset(preset.id)}
                      disabled={actionLoading || totalAvailable === 0}
                      className="btn btn-primary btn-sm w-full gap-2 shadow-xs font-bold"
                    >
                      <Play className="size-3.5 fill-current" />
                      {actionLoading ? 'Generating Mock...' : isSatisfiable ? 'Generate & Launch Mock Exam' : 'Launch Mock (with Available Questions)'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ======================================================================
          TAB 3: 🔁 MISTAKE VAULT DRILL
         ====================================================================== */}
      {activeTab === 'MISTAKE_VAULT' && (
        <div className="bg-base-100 border-base-300 rounded-box border p-8 shadow-sm max-w-3xl mx-auto space-y-6 text-center">
          <div className="size-16 rounded-2xl bg-error/10 text-error flex items-center justify-center mx-auto shadow-inner">
            <RotateCcw className="size-8" />
          </div>

          <div>
            <h2 className="text-2xl font-bold">Mistake Vault & Error Correction</h2>
            <p className="text-base-content/70 text-sm mt-1 max-w-md mx-auto">
              Retake questions you previously answered incorrectly across past examination sessions.
            </p>
          </div>

          <div className="bg-base-200/50 rounded-2xl border border-base-300 p-6 grid grid-cols-2 gap-4 max-w-md mx-auto">
            <div>
              <div className="text-3xl font-black font-mono text-error">{mistakeCount}</div>
              <div className="text-xs uppercase font-semibold text-base-content/70 mt-1">Missed Questions</div>
            </div>
            <div>
              <div className="text-3xl font-black font-mono text-primary">Untimed</div>
              <div className="text-xs uppercase font-semibold text-base-content/70 mt-1">Learning Mode</div>
            </div>
          </div>

          {mistakeCount > 0 ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleLaunchMistakeVault}
                disabled={actionLoading}
                className="btn btn-primary gap-2 font-bold px-8 shadow-sm"
              >
                <Play className="size-4 fill-current" />
                {actionLoading ? 'Building Drill...' : `Launch Mistake Vault Drill (${Math.min(20, mistakeCount)} Qs)`}
              </button>
              <p className="text-xs text-base-content/60">
                Presents solutions and derivations immediately after submitting each question.
              </p>
            </div>
          ) : (
            <div className="text-xs text-base-content/60">
              No incorrect questions recorded yet! Take a practice drill or mock exam to populate your Mistake Vault.
            </div>
          )}
        </div>
      )}

      {/* ======================================================================
          TAB 4: 🛠 ADVANCED CUSTOM DESIGNER (TWO-WAY BIDIRECTIONAL SYNC)
         ====================================================================== */}
      {activeTab === 'CUSTOM_DESIGNER' && (
        <div className="space-y-4">
          {/* Synchronized Studio Header Toolbar */}
          <div className="bg-base-200/60 border-base-300 rounded-box border p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-2">
              <div className="text-xs font-bold uppercase tracking-wider text-base-content/70 flex items-center gap-1.5">
                <Columns2 className="size-3.5 text-primary" />
                Designer Mode:
              </div>

              {/* View Switch */}
              <div className="join shadow-2xs">
                <button
                  type="button"
                  onClick={() => setDesignerViewMode('SPLIT')}
                  className={`join-item btn btn-xs gap-1 ${
                    designerViewMode === 'SPLIT' ? 'btn-primary' : 'btn-outline border-base-300'
                  }`}
                  title="Side-by-side visual and live code editor"
                >
                  <Split className="size-3" />
                  Split View
                </button>
                <button
                  type="button"
                  onClick={() => setDesignerViewMode('VISUAL_ONLY')}
                  className={`join-item btn btn-xs gap-1 ${
                    designerViewMode === 'VISUAL_ONLY' ? 'btn-primary' : 'btn-outline border-base-300'
                  }`}
                  title="Visual forms only"
                >
                  <Layers className="size-3" />
                  Visual UI
                </button>
                <button
                  type="button"
                  onClick={() => setDesignerViewMode('CODE_ONLY')}
                  className={`join-item btn btn-xs gap-1 ${
                    designerViewMode === 'CODE_ONLY' ? 'btn-primary' : 'btn-outline border-base-300'
                  }`}
                  title="Code editor only"
                >
                  <FileCode2 className="size-3" />
                  Code Only
                </button>
              </div>

              {/* Format Switch */}
              <div className="join shadow-2xs ml-2">
                <button
                  type="button"
                  onClick={() => setCodeFormat('MARKDOWN')}
                  className={`join-item btn btn-xs ${
                    codeFormat === 'MARKDOWN' ? 'btn-secondary text-secondary-content' : 'btn-outline border-base-300'
                  }`}
                >
                  Markdown v2
                </button>
                <button
                  type="button"
                  onClick={() => setCodeFormat('JSON')}
                  className={`join-item btn btn-xs ${
                    codeFormat === 'JSON' ? 'btn-secondary text-secondary-content' : 'btn-outline border-base-300'
                  }`}
                >
                  JSON
                </button>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAiModal(true)}
                className="btn btn-xs btn-outline border-base-300 gap-1 text-primary font-bold shadow-2xs"
                title="Generate questions using any LLM"
              >
                <Bot className="size-3.5" />
                AI Prompt Guide
              </button>

              <button
                type="button"
                onClick={handlePasteCode}
                className="btn btn-xs btn-outline border-base-300 gap-1"
                title="Paste Markdown or JSON code from clipboard"
              >
                <Upload className="size-3" />
                Paste Code
              </button>

              <button
                type="button"
                onClick={handleCopyCode}
                className="btn btn-xs btn-outline border-base-300 gap-1"
                title="Copy current code to clipboard"
              >
                <Copy className="size-3" />
                Copy Code
              </button>

              <button
                type="button"
                onClick={() => handleSaveCustomTest(false)}
                className="btn btn-xs btn-outline border-base-300 gap-1 font-semibold"
              >
                <FileCheck2 className="size-3" />
                Save
              </button>

              <button
                type="button"
                onClick={() => handleSaveCustomTest(true)}
                className="btn btn-xs btn-primary gap-1 font-bold shadow-xs"
              >
                <Play className="size-3 fill-current" />
                Launch CBT
              </button>
            </div>
          </div>

          {/* Sync Diagnostics Banner if any */}
          {codeError ? (
            <div className="alert alert-warning py-2 text-xs flex items-center justify-between rounded-xl">
              <div className="flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                <span>{codeError}</span>
              </div>
              <span className="text-[10px] font-mono text-base-content/60">
                Live parsing paused until syntax is resolved
              </span>
            </div>
          ) : (
            <div className="text-[11px] text-base-content/60 flex items-center justify-between px-1">
              <span className="flex items-center gap-1.5 text-success font-semibold">
                <span className="size-1.5 rounded-full bg-success inline-block animate-pulse" />
                Live Two-Way Sync Active
              </span>
              <span>
                Total Sections: <b className="text-base-content">{sections.length}</b> • Selected Questions:{' '}
                <b className="text-base-content">{sections.reduce((acc, s) => acc + s.selectedQuestionIds.length, 0)}</b>
              </span>
            </div>
          )}

          {/* Main Dual-View Grid */}
          <div
            className={`grid gap-6 ${
              designerViewMode === 'SPLIT'
                ? 'grid-cols-1 lg:grid-cols-12'
                : 'grid-cols-1'
            }`}
          >
            {/* ================================================================
                LEFT PANEL: VISUAL UI CONTROLS
               ================================================================ */}
            {(designerViewMode === 'SPLIT' || designerViewMode === 'VISUAL_ONLY') && (
              <div
                className={`space-y-6 ${
                  designerViewMode === 'SPLIT' ? 'lg:col-span-7' : 'w-full'
                }`}
              >
                {/* 1. Test Metadata */}
                <div className="bg-base-100 border-base-300 rounded-box space-y-4 border p-6 shadow-sm">
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <DraftingCompass className="size-4 text-primary" />
                    1. Test Configuration
                  </h3>

                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-base-content/70 uppercase">Test Title *</label>
                      <input
                        type="text"
                        placeholder="e.g. Physics Mechanics Mock Exam"
                        value={customTitle}
                        onChange={(e) => setCustomTitle(e.target.value)}
                        className="input input-bordered mt-1 w-full text-sm font-semibold"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-base-content/70 uppercase">Description</label>
                        <textarea
                          placeholder="Short description of topics covered..."
                          rows={2}
                          value={customDescription}
                          onChange={(e) => setCustomDescription(e.target.value)}
                          className="textarea textarea-bordered mt-1 w-full text-xs"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-base-content/70 uppercase">Candidate Instructions</label>
                        <textarea
                          placeholder="Instructions displayed before candidate begins..."
                          rows={2}
                          value={customInstructions}
                          onChange={(e) => setCustomInstructions(e.target.value)}
                          className="textarea textarea-bordered mt-1 w-full text-xs"
                        />
                      </div>
                    </div>

                    {/* Mode, Timer, Marks */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      <div>
                        <label className="text-xs font-semibold text-base-content/70 uppercase">Mode</label>
                        <select
                          value={customMode}
                          onChange={(e) => setCustomMode(e.target.value as TestMode)}
                          className="select select-bordered select-sm mt-1 w-full text-xs"
                        >
                          <option value="EXAM">Exam Mode</option>
                          <option value="PRACTICE">Practice Mode</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-base-content/70 uppercase">Duration (mins)</label>
                        <input
                          type="number"
                          min="0"
                          value={customDurationMinutes}
                          onChange={(e) => setCustomDurationMinutes(Number(e.target.value))}
                          className="input input-bordered input-sm mt-1 w-full text-xs font-mono font-bold"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-base-content/70 uppercase">Marks (+ / -)</label>
                        <div className="flex items-center gap-1.5 mt-1">
                          <input
                            type="number"
                            value={customDefaultMarks}
                            onChange={(e) => setCustomDefaultMarks(Number(e.target.value))}
                            className="input input-bordered input-sm w-1/2 text-success font-bold text-xs"
                          />
                          <input
                            type="number"
                            value={customNegativeMarks}
                            onChange={(e) => setCustomNegativeMarks(Number(e.target.value))}
                            className="input input-bordered input-sm w-1/2 text-error font-bold text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <div>
                        <label className="text-xs font-semibold text-base-content/70 uppercase mr-2">Navigation:</label>
                        <select
                          value={customNavMode}
                          onChange={(e) => setCustomNavMode(e.target.value as NavigationMode)}
                          className="select select-bordered select-xs text-xs font-medium"
                        >
                          <option value="FREE">Free Navigation</option>
                          <option value="SEQUENTIAL">Sequential Only</option>
                        </select>
                      </div>

                      <label className="label cursor-pointer justify-start gap-2 p-0">
                        <input
                          type="checkbox"
                          checked={customAllowPartialCredit}
                          onChange={(e) => setCustomAllowPartialCredit(e.target.checked)}
                          className="checkbox checkbox-primary checkbox-xs"
                        />
                        <span className="label-text text-xs">Allow partial credit</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* 2. Sections Management & Bulk Question Selector */}
                <div className="bg-base-100 border-base-300 rounded-box border p-6 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold flex items-center gap-2">
                      <FolderPlus className="size-4 text-primary" />
                      2. Examination Sections
                    </h3>
                    <button
                      type="button"
                      onClick={handleAddSection}
                      className="btn btn-outline border-base-300 btn-xs gap-1 font-semibold"
                    >
                      <FolderPlus className="size-3.5" />
                      Add Section
                    </button>
                  </div>

                  {/* Section Tabs */}
                  <div className="tabs tabs-boxed bg-base-200/60 p-1 flex flex-wrap gap-1">
                    {sections.map((sec, idx) => (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => setActiveSectionIndex(idx)}
                        className={`tab tab-sm font-semibold gap-1.5 ${
                          activeSectionIndex === idx ? 'tab-active bg-primary text-primary-content shadow-xs' : ''
                        }`}
                      >
                        <span>{sec.title}</span>
                        <span className="badge badge-neutral badge-xs">
                          {sec.selectedQuestionIds.length}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Section Title Editor */}
                  <div className="flex items-center gap-3 pt-1">
                    <input
                      type="text"
                      value={activeSection.title}
                      onChange={(e) => {
                        const copy = [...sections];
                        copy[activeSectionIndex].title = e.target.value;
                        setSections(copy);
                      }}
                      className="input input-bordered input-sm flex-1 font-bold text-sm"
                    />
                    {sections.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSection(activeSectionIndex)}
                        className="btn btn-ghost btn-sm text-error btn-square"
                        title="Delete Section"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>

                  {/* Bulk Question Actions */}
                  <div className="bg-base-200/50 rounded-xl border border-base-300 p-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-base-content/70">
                      <span className="font-semibold text-base-content">{activeSection.selectedQuestionIds.length}</span> question(s) in this section
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleBulkAddFiltered}
                        className="btn btn-xs btn-outline border-base-300 gap-1 text-primary font-bold"
                        title="Add all currently filtered questions below into this section"
                      >
                        <Layers className="size-3.5" />
                        Add Filtered ({filteredQuestionsForPicker.length})
                      </button>
                      <button
                        type="button"
                        onClick={handleBulkClearSection}
                        className="btn btn-xs btn-ghost text-error"
                      >
                        Clear Section
                      </button>
                    </div>
                  </div>

                  {/* Search and Filters */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="relative sm:col-span-1">
                      <Search className="text-base-content/40 absolute top-2.5 left-2.5 size-3.5" />
                      <input
                        type="text"
                        placeholder="Search questions..."
                        value={pickerSearch}
                        onChange={(e) => setPickerSearch(e.target.value)}
                        className="input input-bordered input-sm pl-8 w-full text-xs"
                      />
                    </div>
                    <select
                      value={pickerSubject}
                      onChange={(e) => setPickerSubject(e.target.value)}
                      className="select select-bordered select-sm text-xs"
                    >
                      <option value="ALL">All Subjects</option>
                      {subjects.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <select
                      value={pickerDifficulty}
                      onChange={(e) => setPickerDifficulty(e.target.value)}
                      className="select select-bordered select-sm text-xs"
                    >
                      <option value="ALL">All Difficulties</option>
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>

                  {/* Question Checkboxes */}
                  <div className="max-h-[380px] overflow-y-auto space-y-2 pr-1">
                    {filteredQuestionsForPicker.map((q) => {
                      const isChecked = activeSection.selectedQuestionIds.includes(q.id);

                      return (
                        <label
                          key={q.id}
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-all ${
                            isChecked
                              ? 'border-primary/60 bg-primary/10 shadow-2xs'
                              : 'border-base-300 bg-base-200/30 hover:border-base-content/30'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleQuestionSelection(q.id)}
                            className="checkbox checkbox-primary checkbox-sm mt-0.5"
                          />
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="badge badge-neutral badge-xs font-mono">{q.id}</span>
                              <span className="badge badge-ghost badge-xs">{q.subject}</span>
                              <span className="badge badge-outline badge-xs">{q.type}</span>
                              <span className="text-xs text-base-content/60 font-semibold ml-auto">+{q.marks}</span>
                            </div>
                            <div className="line-clamp-2 text-xs font-medium text-base-content/90">{q.body}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* ================================================================
                RIGHT PANEL: LIVE SYNCHRONIZED CODE EDITOR
               ================================================================ */}
            {(designerViewMode === 'SPLIT' || designerViewMode === 'CODE_ONLY') && (
              <div
                className={`flex flex-col space-y-3 ${
                  designerViewMode === 'SPLIT' ? 'lg:col-span-5' : 'w-full'
                }`}
              >
                <div className="bg-base-100 border-base-300 rounded-box border p-4 shadow-sm flex flex-col h-[750px]">
                  <div className="flex items-center justify-between pb-3 border-b border-base-300">
                    <div className="flex items-center gap-2">
                      <FileCode2 className="size-4 text-secondary" />
                      <span className="font-bold text-xs uppercase tracking-wider">
                        Live {codeFormat === 'MARKDOWN' ? 'Markdown v2' : 'JSON'} Source
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-base-content/50">
                        {codeText.split('\n').length} lines
                      </span>
                    </div>
                  </div>

                  {/* Code Editor Textarea */}
                  <div className="relative flex-1 pt-3">
                    <textarea
                      value={codeText}
                      onChange={(e) => handleCodeTextChange(e.target.value)}
                      placeholder={
                        codeFormat === 'MARKDOWN'
                          ? '---\ntitle: My Test\n...\n# Section: Physics\n...\n=== question ==='
                          : '{\n  "title": "My Test",\n  "sections": [...] \n}'
                      }
                      className="font-mono text-xs leading-relaxed w-full h-full p-4 rounded-xl bg-base-200/50 border border-base-300 focus:outline-primary resize-none selectable-content"
                      spellCheck={false}
                    />
                  </div>

                  {/* Bottom Helper Bar */}
                  <div className="pt-3 border-t border-base-300 text-xs text-base-content/70 flex items-center justify-between">
                    <span>💡 Edit or paste code above to update visual UI</span>
                    <button
                      type="button"
                      onClick={() => setShowAiModal(true)}
                      className="btn btn-ghost btn-xs text-primary gap-1 font-semibold"
                    >
                      <Bot className="size-3.5" />
                      Generate with AI
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================================
          TAB 5: 📚 SAVED TEST BLUEPRINTS GALLERY
         ====================================================================== */}
      {activeTab === 'SAVED_TESTS' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold">Saved Examination Blueprints</h3>
              <p className="text-xs text-base-content/70">
                Launch any saved mock examination or review test parameters.
              </p>
            </div>
          </div>

          {existingTests.length === 0 ? (
            <div className="bg-base-200/40 border-base-300 rounded-box border p-12 text-center">
              <BookOpen className="text-base-content/30 mx-auto size-12" />
              <h4 className="mt-4 text-lg font-bold">No custom tests saved yet</h4>
              <p className="text-base-content/60 mt-1 text-sm">
                Create a quick drill, launch an exam preset, or design a custom blueprint.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {existingTests.map((t) => (
                <div
                  key={t.id}
                  className="bg-base-100 border-base-300 rounded-box flex flex-col justify-between border p-5 shadow-sm hover:border-primary/40 transition-all space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="badge badge-primary badge-sm font-semibold">{t.mode}</span>
                      <span className="text-xs font-mono text-base-content/60">
                        {t.timing.totalDurationSeconds > 0
                          ? `${Math.floor(t.timing.totalDurationSeconds / 60)} mins`
                          : 'Untimed'}
                      </span>
                    </div>

                    <h4 className="font-bold text-base line-clamp-1">{t.title}</h4>
                    <p className="text-xs text-base-content/70 line-clamp-2">{t.description}</p>

                    <div className="flex flex-wrap gap-1 pt-1">
                      {t.sections.map((s) => (
                        <span key={s.id} className="badge badge-ghost badge-xs">
                          {s.title}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => handleLaunchSavedTest(t.id)}
                      className="btn btn-primary btn-sm flex-1 gap-1.5 shadow-xs font-bold"
                    >
                      <Play className="size-3.5 fill-current" />
                      Start CBT
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteSavedTest(e, t.id)}
                      className="btn btn-ghost btn-sm text-error btn-square"
                      title="Delete Blueprint"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI Format Suffix Modal */}
      {showAiModal && (
        <AiPromptModal
          isOpen={showAiModal}
          onClose={() => setShowAiModal(false)}
        />
      )}
    </div>
  );
}