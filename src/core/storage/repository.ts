/**
 * Central Storage Repository for takemock.
 * Encapsulates all Dexie operations, versioning, snapshot generation, and attempt lifecycle.
 * Adheres strictly to docs/master_architecture_prompt_v2.md Sections 21-28.
 */

import type { AttemptEvent, AttemptState, TestSnapshot } from '@/types/attempt';
import type { QuestionModel, ValidationDiagnostic } from '@/types/question';
import type { TestDefinition } from '@/types/test';
import { questionRegistry } from '../engine/registry';
import { evaluateAttempt } from '../engine/scoringEngine';
import {
  selectQuestionsForEntireTest,
  validateSectionConstraints,
} from '../engine/selectionEngine';
import {
  EXAM_PRESETS,
  buildTestDefinitionFromPreset,
  type ExamPresetDefinition,
} from '../presets/examPresets';
import { detectContentFormat } from '../parser/llmSanitizer';
import { parseJsonQuestions, type JsonParseResult } from '../parser/jsonConverter';
import { parseMarkdownQuestions, type ParseResult } from '../parser/markdownParser';
import { parseFullTestJson, parseFullTestMarkdown } from '../parser/testSerializer';
import { db } from './db';

export interface QuestionFilters {
  subject?: string;
  topic?: string;
  difficulty?: string;
  type?: string;
  search?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const assessmentRepository = {
  /**
   * Fetch all questions with optional filtering.
   */
  async getQuestions(filters?: QuestionFilters): Promise<QuestionModel[]> {
    let collection = db.questions.toCollection();

    if (filters?.subject && filters.subject !== 'ALL') {
      collection = db.questions.where('subject').equalsIgnoreCase(filters.subject);
    } else if (filters?.difficulty && filters.difficulty !== 'ALL') {
      collection = db.questions.where('difficulty').equals(filters.difficulty);
    } else if (filters?.type && filters.type !== 'ALL') {
      collection = db.questions.where('type').equals(filters.type);
    }

    if (!filters) return collection.toArray();

    return collection
      .filter((q) => {
        if (
          filters.subject &&
          filters.subject !== 'ALL' &&
          q.subject.toLowerCase() !== filters.subject.toLowerCase()
        )
          return false;
        if (
          filters.topic &&
          filters.topic !== 'ALL' &&
          q.topic.toLowerCase() !== filters.topic.toLowerCase()
        )
          return false;
        if (
          filters.difficulty &&
          filters.difficulty !== 'ALL' &&
          q.difficulty !== filters.difficulty
        )
          return false;
        if (filters.type && filters.type !== 'ALL' && q.type !== filters.type) return false;
        if (filters.search && filters.search.trim()) {
          const query = filters.search.toLowerCase().trim();
          const matchesQuery =
            q.id.toLowerCase().includes(query) ||
            q.body.toLowerCase().includes(query) ||
            q.subject.toLowerCase().includes(query) ||
            q.topic.toLowerCase().includes(query) ||
            q.tags?.some((t) => t.toLowerCase().includes(query));
          if (!matchesQuery) return false;
        }
        return true;
      })
      .toArray();
  },

  /**
   * High-performance Paginated & Indexed query (Section 38: Low time & space complexity).
   */
  async getQuestionsPaged(params?: {
    filters?: QuestionFilters;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<QuestionModel>> {
    const page = Math.max(1, params?.page || 1);
    const pageSize = Math.max(1, Math.min(100, params?.pageSize || 10));
    const filters = params?.filters;

    let collection = db.questions.toCollection();

    if (filters?.subject && filters.subject !== 'ALL') {
      collection = db.questions.where('subject').equalsIgnoreCase(filters.subject);
    } else if (filters?.difficulty && filters.difficulty !== 'ALL') {
      collection = db.questions.where('difficulty').equals(filters.difficulty);
    } else if (filters?.type && filters.type !== 'ALL') {
      collection = db.questions.where('type').equals(filters.type);
    }

    const filtered = await collection
      .filter((q) => {
        if (
          filters?.subject &&
          filters.subject !== 'ALL' &&
          q.subject.toLowerCase() !== filters.subject.toLowerCase()
        )
          return false;
        if (
          filters?.topic &&
          filters.topic !== 'ALL' &&
          q.topic.toLowerCase() !== filters.topic.toLowerCase()
        )
          return false;
        if (
          filters?.difficulty &&
          filters.difficulty !== 'ALL' &&
          q.difficulty !== filters.difficulty
        )
          return false;
        if (filters?.type && filters.type !== 'ALL' && q.type !== filters.type) return false;
        if (filters?.search && filters.search.trim()) {
          const query = filters.search.toLowerCase().trim();
          const matches =
            q.id.toLowerCase().includes(query) ||
            q.body.toLowerCase().includes(query) ||
            q.subject.toLowerCase().includes(query) ||
            q.topic.toLowerCase().includes(query) ||
            q.tags?.some((t) => t.toLowerCase().includes(query));
          if (!matches) return false;
        }
        return true;
      })
      .toArray();

    const totalCount = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const offset = (page - 1) * pageSize;
    const items = filtered.slice(offset, offset + pageSize);

    return {
      items,
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  },

  /**
   * Indexed O(Distinct) query for subjects directly using B-Tree index.
   */
  async getDistinctSubjects(): Promise<string[]> {
    const keys = await db.questions.orderBy('subject').uniqueKeys();
    return keys.map(String).filter(Boolean);
  },

  /**
   * Distinct topics (optionally scoped to a subject).
   */
  async getDistinctTopics(subject?: string): Promise<string[]> {
    if (subject && subject !== 'ALL') {
      const qs = await db.questions.where('subject').equalsIgnoreCase(subject).toArray();
      const set = new Set(qs.map((q) => q.topic).filter(Boolean));
      return Array.from(set).sort();
    }
    const keys = await db.questions.orderBy('topic').uniqueKeys();
    return keys.map(String).filter(Boolean);
  },

  /**
   * Dynamic freeform tags across all user questions (optionally scoped to a subject).
   * Sorted by frequency descending so the most relevant concepts appear first.
   */
  async getDistinctTags(subject?: string): Promise<string[]> {
    const questions =
      subject && subject !== 'ALL'
        ? await db.questions.where('subject').equalsIgnoreCase(subject).toArray()
        : await db.questions.toArray();

    const tagCount = new Map<string, number>();
    for (const q of questions) {
      if (Array.isArray(q.tags)) {
        for (const t of q.tags) {
          const clean = t?.trim();
          if (clean) {
            tagCount.set(clean, (tagCount.get(clean) || 0) + 1);
          }
        }
      }
    }
    return Array.from(tagCount.keys()).sort((a, b) => {
      const diff = (tagCount.get(b) || 0) - (tagCount.get(a) || 0);
      return diff !== 0 ? diff : a.localeCompare(b);
    });
  },

  /**
   * Get single question by ID.
   */
  async getQuestionById(id: string): Promise<QuestionModel | undefined> {
    return db.questions.get(id);
  },

  /**
   * Saves or updates a question.
   * Invariant 6: Content modification increments version and records immutable snapshot in questionVersions.
   */
  async saveQuestion(
    question: QuestionModel,
  ): Promise<{ question: QuestionModel; diagnostics: ValidationDiagnostic[] }> {
    const diagnostics = questionRegistry.validate(question);
    const hasErrors = diagnostics.some((d) => d.level === 'ERROR');
    if (hasErrors) {
      throw new Error(`Cannot save question: Validation failed with errors.`);
    }

    const normalized = questionRegistry.normalize(question);
    const existing = await db.questions.get(normalized.id);

    const newVersion = existing ? (existing.version || 1) + 1 : normalized.version || 1;
    const toSave: QuestionModel = {
      ...normalized,
      version: newVersion,
      updatedAt: new Date().toISOString(),
    };

    await db.transaction('rw', [db.questions, db.questionVersions], async () => {
      await db.questions.put(toSave);
      await db.questionVersions.put({
        id: `${toSave.id}_v${newVersion}`,
        questionId: toSave.id,
        version: newVersion,
        data: toSave,
        createdAt: new Date().toISOString(),
      });
    });

    return { question: toSave, diagnostics };
  },

  /**
   * Bulk saves or updates multiple questions in the repository.
   */
  async saveQuestions(questions: QuestionModel[]): Promise<void> {
    for (const q of questions) {
      await this.saveQuestion(q);
    }
  },

  /**
   * Stages question import from Markdown without directly writing to database (Section 28).
   */
  stageMarkdownImport(rawMarkdown: string): ParseResult {
    return parseMarkdownQuestions(rawMarkdown);
  },

  /**
   * Stages question import from JSON without directly writing to database (Section 28).
   */
  stageJsonImport(rawJson: string): JsonParseResult {
    return parseJsonQuestions(rawJson);
  },

  /**
   * Commits staged questions to the database after user confirmation.
   */
  async commitQuestions(questions: QuestionModel[]): Promise<number> {
    if (questions.length === 0) return 0;

    await db.transaction('rw', [db.questions, db.questionVersions], async () => {
      for (const q of questions) {
        let questionId = q.id;
        const existing = await db.questions.get(questionId);
        // If an existing question has the same ID but completely different text (e.g. generic id collision like q_1), disambiguate
        if (
          existing &&
          existing.body !== q.body &&
          (questionId.startsWith('q_') || /^\d+$/.test(questionId))
        ) {
          questionId = `q_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
        }

        const finalExisting = questionId === q.id ? existing : await db.questions.get(questionId);
        const version = finalExisting ? (finalExisting.version || 1) + 1 : q.version || 1;
        const toSave: QuestionModel = {
          ...q,
          id: questionId,
          version,
          updatedAt: new Date().toISOString(),
        };

        await db.questions.put(toSave);
        await db.questionVersions.put({
          id: `${toSave.id}_v${version}`,
          questionId: toSave.id,
          version,
          data: toSave,
          createdAt: new Date().toISOString(),
        });
      }
    });

    return questions.length;
  },

  /**
   * Imports Markdown questions directly, committing all valid questions and reporting diagnostics.
   */
  async importQuestionsFromMarkdown(rawMarkdown: string): Promise<ParseResult> {
    const parseResult = this.stageMarkdownImport(rawMarkdown);
    const errorQIds = new Set<string>();
    for (const d of parseResult.diagnostics) {
      if (d.diagnostics.some((item) => item.level === 'ERROR')) {
        if (d.questionId) errorQIds.add(d.questionId);
      }
    }
    const validQuestions = parseResult.questions.filter((q) => !errorQIds.has(q.id));
    if (validQuestions.length > 0) {
      await this.commitQuestions(validQuestions);
    }
    return parseResult;
  },

  /**
   * Imports JSON questions directly, committing all valid questions and reporting diagnostics.
   */
  async importQuestionsFromJson(rawJson: string): Promise<JsonParseResult> {
    const parseResult = this.stageJsonImport(rawJson);
    const errorQIds = new Set<string>();
    for (const d of parseResult.diagnostics) {
      if (d.diagnostics.some((item) => item.level === 'ERROR')) {
        if (d.questionId) errorQIds.add(d.questionId);
      }
    }
    const validQuestions = parseResult.questions.filter((q) => !errorQIds.has(q.id));
    if (validQuestions.length > 0) {
      await this.commitQuestions(validQuestions);
    }
    return parseResult;
  },

  /**
   * Get all Test Definitions.
   */
  async getTests(): Promise<TestDefinition[]> {
    return db.testDefinitions.toArray();
  },

  /**
   * Get single test definition.
   */
  async getTestById(id: string): Promise<TestDefinition | undefined> {
    return db.testDefinitions.get(id);
  },

  /**
   * Save or update Test Definition.
   */
  async saveTest(test: TestDefinition): Promise<void> {
    await db.testDefinitions.put({
      ...test,
      updatedAt: new Date().toISOString(),
    });
  },

  /**
   * Delete Test Definition.
   */
  async deleteTest(testId: string): Promise<void> {
    await db.testDefinitions.delete(testId);
  },

  /**
   * Creates an immutable TestSnapshot from a TestDefinition.
   * Invariant 1: Historical attempts remain reproducible.
   * Invariant 8: Passage/group contiguous integrity preserved.
   */
  async createSnapshotForTest(
    test: TestDefinition,
    explicitSeed?: number,
    options?: {
      excludeQuestionIds?: Set<string>;
      includeOnlyQuestionIds?: Set<string>;
    },
  ): Promise<TestSnapshot> {
    const allQuestions = await db.questions.toArray();
    const seed = explicitSeed ?? (test.randomization.seed || Math.floor(Date.now() % 1000000));

    // Use atomic, cross-section deduplicated selection engine
    const { sectionQuestions } = selectQuestionsForEntireTest(test, allQuestions, seed, options);

    const snapshotSections = test.sections.map((sec) => ({
      id: sec.id,
      title: sec.title,
      order: sec.order,
      durationSeconds: sec.durationSeconds,
      cutoffScore: sec.cutoffScore,
      questions: sectionQuestions[sec.id] || [],
    }));

    const snapshot: TestSnapshot = {
      snapshotId: `snap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      testId: test.id,
      testVersion: test.version,
      testTitle: test.title,
      mode: test.mode,
      sections: snapshotSections,
      timing: test.timing,
      scoring: test.scoring,
      navigation: test.navigation,
      feedback: test.feedback,
      seedUsed: seed,
      createdAt: new Date().toISOString(),
    };

    await db.testSnapshots.put(snapshot);
    return snapshot;
  },

  /**
   * 1-Click Quick Practice Drill Generator.
   * Instantly creates and launches a customized drill for a subject, topic, and difficulty.
   */
  async generateQuickDrill(options: {
    subject?: string;
    topic?: string;
    difficulty?: 'easy' | 'medium' | 'hard';
    type?: any;
    count: number;
    durationMinutes: number;
    mode: 'PRACTICE' | 'EXAM';
  }): Promise<AttemptState> {
    const title = options.topic
      ? `${options.subject || 'All Subjects'} - ${options.topic} Drill`
      : options.subject && options.subject !== 'ALL'
        ? `${options.subject} Speed Drill`
        : 'General Knowledge Quick Drill';

    const testDef: TestDefinition = {
      id: `drill_${Date.now()}`,
      title,
      description: `${options.count} questions • ${
        options.durationMinutes > 0 ? `${options.durationMinutes} mins` : 'Untimed'
      } • ${options.mode}`,
      mode: options.mode,
      schemaVersion: '2.0',
      version: 1,
      sections: [
        {
          id: 'sec_drill',
          title: 'Drill Section',
          order: 0,
          selection: {
            mode: 'RULE_BASED',
            constraints: [
              {
                subject: options.subject !== 'ALL' ? options.subject : undefined,
                topic: options.topic,
                difficulty: options.difficulty,
                count: options.count,
              },
            ],
          },
        },
      ],
      timing: {
        mode: options.durationMinutes > 0 ? 'GLOBAL' : 'NONE',
        totalDurationSeconds: options.durationMinutes * 60,
        allowPause: options.mode === 'PRACTICE',
        autoSubmitOnExpiry: true,
        warnThresholdSeconds: 300,
      },
      scoring: {
        defaultMarks: 4,
        defaultNegativeMarks: 1,
        allowPartialCredit: true,
      },
      navigation: 'FREE',
      randomization: {
        shuffleQuestions: true,
        shuffleOptions: true,
        seed: Math.floor(Math.random() * 2147483647),
      },
      feedback: {
        showImmediateSolution: options.mode === 'PRACTICE',
        showHint: options.mode === 'PRACTICE',
        allowCheckAnswer: options.mode === 'PRACTICE',
        showDetailedSolutionsAfterSubmit: true,
      },
      tags: ['quick-drill', options.subject || 'mixed'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.saveTest(testDef);
    return this.startAttempt(testDef.id);
  },

  /**
   * 1-Click Standard Exam Preset Generator (JEE Main, NEET, GATE, etc.).
   */
  async generatePresetExam(presetId: string, customTitle?: string): Promise<AttemptState> {
    const preset = EXAM_PRESETS.find((p) => p.id === presetId);
    if (!preset) {
      throw new Error(`Exam preset "${presetId}" not found`);
    }

    const testDef = buildTestDefinitionFromPreset(preset, customTitle);
    await this.saveTest(testDef);
    return this.startAttempt(testDef.id);
  },

  /**
   * Evaluates availability of all exam presets against the active question bank.
   */
  async getPresetAvailability(): Promise<
    Array<{
      preset: ExamPresetDefinition;
      isSatisfiable: boolean;
      totalAvailable: number;
      totalRequired: number;
      percentage: number;
    }>
  > {
    const allQuestions = await db.questions.toArray();

    return EXAM_PRESETS.map((preset) => {
      const testDef = buildTestDefinitionFromPreset(preset);
      let totalReq = 0;
      let totalAvail = 0;
      let allSat = true;

      const alreadySelected = new Set<string>();

      for (const sec of testDef.sections) {
        const report = validateSectionConstraints(sec, allQuestions, {
          alreadySelectedIds: alreadySelected,
        });
        totalReq += report.totalRequested;
        totalAvail += report.totalAvailable;
        if (!report.isSatisfiable) {
          allSat = false;
        }
        for (const diag of report.diagnostics) {
          for (const id of diag.matchingIds.slice(0, diag.requested)) {
            alreadySelected.add(id);
          }
        }
      }

      const percentage =
        totalReq > 0 ? Math.min(100, Math.round((totalAvail / totalReq) * 100)) : 100;

      return {
        preset,
        isSatisfiable: allSat,
        totalAvailable: totalAvail,
        totalRequired: totalReq,
        percentage,
      };
    });
  },

  /**
   * History-Driven "Mistake Vault" Practice Generator.
   * Auto-pulls questions previously answered incorrectly across past attempts.
   */
  async generateMistakeDrill(maxCount = 20): Promise<AttemptState> {
    const attempts = await db.attempts.toArray();
    const incorrectIds = new Set<string>();

    for (const att of attempts) {
      if (att.scoreResult?.questionScores) {
        for (const [qId, qScore] of Object.entries(att.scoreResult.questionScores)) {
          if (qScore.status === 'INCORRECT') {
            incorrectIds.add(qId);
          }
        }
      }
    }

    if (incorrectIds.size === 0) {
      throw new Error(
        'No incorrect questions found in your past attempts! Take an exam first or use Quick Drill.',
      );
    }

    const selectedIds = Array.from(incorrectIds).slice(0, maxCount);

    const testDef: TestDefinition = {
      id: `mistake_vault_${Date.now()}`,
      title: 'Mistake Vault — Targeted Correction Drill',
      description: `Targeted revision set containing ${selectedIds.length} question(s) you previously missed.`,
      mode: 'PRACTICE',
      schemaVersion: '2.0',
      version: 1,
      sections: [
        {
          id: 'sec_mistakes',
          title: 'Review Missed Questions',
          order: 0,
          selection: {
            mode: 'STATIC',
            staticQuestionIds: selectedIds.map((id) => ({ id })),
          },
        },
      ],
      timing: {
        mode: 'NONE',
        totalDurationSeconds: 0,
        allowPause: true,
        autoSubmitOnExpiry: false,
      },
      scoring: {
        defaultMarks: 4,
        defaultNegativeMarks: 0,
        allowPartialCredit: true,
      },
      navigation: 'FREE',
      randomization: {
        shuffleQuestions: true,
        shuffleOptions: false,
      },
      feedback: {
        showImmediateSolution: true,
        showHint: true,
        allowCheckAnswer: true,
        showDetailedSolutionsAfterSubmit: true,
      },
      tags: ['mistake-vault', 'revision'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.saveTest(testDef);
    return this.startAttempt(testDef.id);
  },

  /**
   * Whole-Paper / Package Importer.
   * Accepts a complete package containing both Test Definition and Question Models.
   */
  async importWholeTestPackage(packageData: {
    test: TestDefinition;
    questions: QuestionModel[];
  }): Promise<TestDefinition> {
    if (packageData.questions && packageData.questions.length > 0) {
      await this.commitQuestions(packageData.questions);
    }
    await this.saveTest(packageData.test);
    return packageData.test;
  },

  /**
   * Start a new test attempt.
   */
  async startAttempt(testId: string): Promise<AttemptState> {
    const test = await db.testDefinitions.get(testId);
    if (!test) {
      throw new Error(`Test with ID "${testId}" not found`);
    }

    const snapshot = await this.createSnapshotForTest(test);
    const initialSection = snapshot.sections[0];
    const initialQuestion = initialSection?.questions[0];

    const initialVisitStatuses: Record<string, any> = {};
    for (const sec of snapshot.sections) {
      for (const q of sec.questions) {
        initialVisitStatuses[q.id] = 'NOT_VISITED';
      }
    }

    if (initialQuestion) {
      initialVisitStatuses[initialQuestion.id] = 'SKIPPED'; // active / visited
    }

    const startEvent: AttemptEvent = {
      id: `evt_${Date.now()}_start`,
      type: 'ATTEMPT_STARTED',
      timestamp: new Date().toISOString(),
      sectionId: initialSection?.id,
      questionId: initialQuestion?.id,
    };

    const attempt: AttemptState = {
      id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      testId: test.id,
      snapshot,
      status: 'IN_PROGRESS',
      currentSectionId: initialSection?.id || '',
      currentQuestionId: initialQuestion?.id || '',
      responses: {},
      answerHistory: {},
      visitStatuses: initialVisitStatuses,
      timings: {},
      events: [startEvent],
      sectionElapsedSeconds: {},
      totalElapsedSeconds: 0,
      remainingSeconds: test.timing.totalDurationSeconds,
      startedAt: new Date().toISOString(),
    };

    await db.attempts.put(attempt);
    return attempt;
  },

  /**
   * Fetch attempt by ID.
   */
  async getAttemptById(attemptId: string): Promise<AttemptState | undefined> {
    return db.attempts.get(attemptId);
  },

  /**
   * Save active attempt state during the test.
   */
  async updateAttempt(attempt: AttemptState): Promise<void> {
    await db.attempts.put(attempt);
  },

  /**
   * Appends a domain audit event to the attempt.
   */
  async recordEvent(
    attemptId: string,
    event: Omit<AttemptEvent, 'id' | 'timestamp'>,
  ): Promise<void> {
    const att = await db.attempts.get(attemptId);
    if (!att) return;

    const fullEvent: AttemptEvent = {
      ...event,
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
    };

    const updatedEvents = [...(att.events || []), fullEvent];
    await db.attempts.update(attemptId, { events: updatedEvents });
  },

  /**
   * Submits and scores an attempt.
   * Invariant 4: Duplicate submission cannot double-score.
   */
  async submitAttempt(attemptId: string, isAutoSubmit: boolean = false): Promise<AttemptState> {
    const attempt = await db.attempts.get(attemptId);
    if (!attempt) {
      throw new Error(`Attempt with ID "${attemptId}" not found`);
    }

    if (
      attempt.status === 'SUBMITTED' ||
      attempt.status === 'SCORED' ||
      attempt.status === 'AUTO_SUBMITTED'
    ) {
      return attempt; // Idempotent return
    }

    // Pure evaluation
    const scoreResult = evaluateAttempt(attempt.snapshot, attempt.responses, attempt.timings);

    const submitEvent: AttemptEvent = {
      id: `evt_${Date.now()}_submit`,
      type: isAutoSubmit ? 'ATTEMPT_AUTO_SUBMITTED' : 'ATTEMPT_SUBMITTED',
      timestamp: new Date().toISOString(),
    };

    const finishedAttempt: AttemptState = {
      ...attempt,
      status: isAutoSubmit ? 'AUTO_SUBMITTED' : 'SCORED',
      scoreResult,
      completedAt: new Date().toISOString(),
      events: [...(attempt.events || []), submitEvent],
    };

    await db.attempts.put(finishedAttempt);
    return finishedAttempt;
  },

  /**
   * Get all past attempts.
   */
  async getAttempts(): Promise<AttemptState[]> {
    return db.attempts.reverse().toArray();
  },

  /**
   * Deletes an attempt record by ID.
   */
  async deleteAttempt(attemptId: string): Promise<void> {
    await db.attempts.delete(attemptId);
  },

  /**
   * Aggregates historical performance metrics for a specific paper or test blueprint.
   */
  async getPaperAnalytics(testId: string): Promise<{
    attemptsCount: number;
    latestAttemptId?: string;
    latestScore?: number;
    bestScore?: number;
    lastAttemptedAt?: string;
  }> {
    const attempts = await db.attempts.where('testId').equals(testId).toArray();
    const completed = attempts.filter(
      (a) => (a.status === 'SCORED' || a.status === 'AUTO_SUBMITTED') && !!a.scoreResult,
    );
    if (completed.length === 0) {
      return { attemptsCount: 0 };
    }
    completed.sort(
      (a, b) =>
        new Date(b.completedAt || b.startedAt).getTime() -
        new Date(a.completedAt || a.startedAt).getTime(),
    );
    const latestScore = completed[0].scoreResult?.percentage;
    const bestScore = Math.max(...completed.map((c) => c.scoreResult?.percentage || 0));
    return {
      attemptsCount: completed.length,
      latestAttemptId: completed[0].id,
      latestScore: latestScore !== undefined ? Number(latestScore.toFixed(1)) : undefined,
      bestScore: bestScore !== undefined ? Number(bestScore.toFixed(1)) : undefined,
      lastAttemptedAt: completed[0].completedAt || completed[0].startedAt,
    };
  },

  /**
   * Aggregates mistake debt, time-sink questions, and revision bookmarks across historical attempts.
   */
  async getMistakeAnalytics(): Promise<{
    unresolvedQuestions: QuestionModel[];
    timeSinkQuestions: QuestionModel[];
    bookmarkedQuestions: QuestionModel[];
    resolvedCount: number;
  }> {
    const attempts = await db.attempts.toArray();
    const allQuestions = await db.questions.toArray();
    const questionMap = new Map(allQuestions.map((q) => [q.id, q]));

    // Sort chronological ascending to track progress
    const sortedAttempts = [...attempts].sort(
      (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
    );

    const questionHistory = new Map<string, { lastStatus: string; isTimeSink: boolean }>();
    const bookmarkedSet = new Set<string>();

    for (const att of sortedAttempts) {
      if (att.visitStatuses) {
        for (const [qId, vStatus] of Object.entries(att.visitStatuses)) {
          if (vStatus === 'MARKED_FOR_REVIEW' || vStatus === 'ANSWERED_AND_MARKED') {
            bookmarkedSet.add(qId);
          }
        }
      }
      if (att.scoreResult?.questionScores) {
        for (const [qId, qScore] of Object.entries(att.scoreResult.questionScores)) {
          const isSink = (qScore.timeSpentSeconds || 0) > 150 && qScore.status === 'INCORRECT';
          questionHistory.set(qId, {
            lastStatus: qScore.status,
            isTimeSink: isSink,
          });
        }
      }
    }

    const unresolved: QuestionModel[] = [];
    const timeSinks: QuestionModel[] = [];
    const bookmarked: QuestionModel[] = [];
    let resolvedCount = 0;

    for (const [qId, info] of questionHistory.entries()) {
      const q = questionMap.get(qId);
      if (!q) continue;

      if (info.lastStatus === 'INCORRECT' || info.lastStatus === 'PARTIAL') {
        unresolved.push(q);
        if (info.isTimeSink) {
          timeSinks.push(q);
        }
      } else if (info.lastStatus === 'CORRECT') {
        resolvedCount++;
      }
    }

    for (const bId of bookmarkedSet) {
      const q = questionMap.get(bId);
      if (q) bookmarked.push(q);
    }

    return {
      unresolvedQuestions: unresolved,
      timeSinkQuestions: timeSinks,
      bookmarkedQuestions: bookmarked,
      resolvedCount,
    };
  },

  /**
   * Comprehensive Zero-Hardcoded Performance Analytics Engine.
   * Dynamically aggregates subject, topic, question type, difficulty, and timeline trends
   * across all completed attempts in IndexedDB without any rigid syllabi.
   */
  async getComprehensiveAnalytics() {
    const attempts = await db.attempts.toArray();
    const completed = attempts
      .filter((a) => (a.status === 'SCORED' || a.status === 'AUTO_SUBMITTED') && !!a.scoreResult)
      .sort(
        (a, b) =>
          new Date(b.completedAt || b.startedAt).getTime() -
          new Date(a.completedAt || a.startedAt).getTime(),
      );

    let totalQuestionsAttempted = 0;
    let totalQuestionsCorrect = 0;
    let totalTimeSpentSeconds = 0;

    const subjectMap = new Map<
      string,
      {
        total: number;
        correct: number;
        incorrect: number;
        unanswered: number;
        totalTime: number;
        topicMap: Map<string, { total: number; correct: number; incorrect: number }>;
      }
    >();

    const difficultyMap = {
      easy: { total: 0, correct: 0 },
      medium: { total: 0, correct: 0 },
      hard: { total: 0, correct: 0 },
    };

    const typeMap = new Map<string, { total: number; correct: number }>();

    for (const att of completed) {
      totalTimeSpentSeconds += att.scoreResult?.totalTimeSpentSeconds || 0;
      const questionScores = att.scoreResult?.questionScores || {};

      // Retrieve all questions from snapshot
      const questionsInAttempt = (att.snapshot?.sections || []).flatMap(
        (sec) => sec.questions || [],
      );

      for (const q of questionsInAttempt) {
        const qScore = questionScores[q.id];
        if (!qScore) continue;

        const isAnswered = qScore.status !== 'UNATTEMPTED';
        const isCorrect = qScore.status === 'CORRECT';
        const isIncorrect = qScore.status === 'INCORRECT' || qScore.status === 'PARTIAL';
        const timeSpent = qScore.timeSpentSeconds || 0;

        if (isAnswered) {
          totalQuestionsAttempted++;
          if (isCorrect) totalQuestionsCorrect++;
        }

        // Subject & Topic dynamic grouping
        const subjName = (q.subject || 'General').trim();
        const topicName = (q.topic || 'General').trim();

        if (!subjectMap.has(subjName)) {
          subjectMap.set(subjName, {
            total: 0,
            correct: 0,
            incorrect: 0,
            unanswered: 0,
            totalTime: 0,
            topicMap: new Map(),
          });
        }
        const sEntry = subjectMap.get(subjName)!;
        sEntry.total++;
        sEntry.totalTime += timeSpent;
        if (isCorrect) sEntry.correct++;
        else if (isIncorrect) sEntry.incorrect++;
        else sEntry.unanswered++;

        if (!sEntry.topicMap.has(topicName)) {
          sEntry.topicMap.set(topicName, { total: 0, correct: 0, incorrect: 0 });
        }
        const tEntry = sEntry.topicMap.get(topicName)!;
        tEntry.total++;
        if (isCorrect) tEntry.correct++;
        else if (isIncorrect) tEntry.incorrect++;

        // Difficulty dynamic grouping
        const diff = (q.difficulty || 'medium').toLowerCase() as 'easy' | 'medium' | 'hard';
        if (difficultyMap[diff]) {
          difficultyMap[diff].total++;
          if (isCorrect) difficultyMap[diff].correct++;
        }

        // Type dynamic grouping
        const qType = q.type || 'single_choice';
        if (!typeMap.has(qType)) {
          typeMap.set(qType, { total: 0, correct: 0 });
        }
        const typEntry = typeMap.get(qType)!;
        typEntry.total++;
        if (isCorrect) typEntry.correct++;
      }
    }

    const overallAccuracy =
      totalQuestionsAttempted > 0
        ? Number(((totalQuestionsCorrect / totalQuestionsAttempted) * 100).toFixed(1))
        : 0;

    const overallScorePercentage =
      completed.length > 0
        ? Number(
            (
              completed.reduce((sum, a) => sum + (a.scoreResult?.percentage || 0), 0) /
              completed.length
            ).toFixed(1),
          )
        : 0;

    const averageTimePerQuestionSeconds =
      totalQuestionsAttempted > 0 ? Math.round(totalTimeSpentSeconds / totalQuestionsAttempted) : 0;

    // Convert subject Map to structured sorted array
    const subjectBreakdown = Array.from(subjectMap.entries()).map(([subj, data]) => {
      const attempted = data.correct + data.incorrect;
      const accuracy = attempted > 0 ? Number(((data.correct / attempted) * 100).toFixed(1)) : 0;

      const topics = Array.from(data.topicMap.entries()).map(([top, tData]) => {
        const tAttempted = tData.correct + tData.incorrect;
        const tAcc = tAttempted > 0 ? Number(((tData.correct / tAttempted) * 100).toFixed(1)) : 0;
        return {
          topic: top,
          total: tData.total,
          correct: tData.correct,
          incorrect: tData.incorrect,
          accuracy: tAcc,
        };
      });

      topics.sort((a, b) => b.total - a.total);

      return {
        subject: subj,
        total: data.total,
        attempted,
        correct: data.correct,
        incorrect: data.incorrect,
        unanswered: data.unanswered,
        accuracy,
        totalTimeSeconds: data.totalTime,
        topics,
      };
    });

    subjectBreakdown.sort((a, b) => b.total - a.total);

    const calcAccuracy = (corr: number, tot: number) =>
      tot > 0 ? Number(((corr / tot) * 100).toFixed(1)) : 0;

    const difficultyBreakdown = {
      easy: {
        total: difficultyMap.easy.total,
        correct: difficultyMap.easy.correct,
        accuracy: calcAccuracy(difficultyMap.easy.correct, difficultyMap.easy.total),
      },
      medium: {
        total: difficultyMap.medium.total,
        correct: difficultyMap.medium.correct,
        accuracy: calcAccuracy(difficultyMap.medium.correct, difficultyMap.medium.total),
      },
      hard: {
        total: difficultyMap.hard.total,
        correct: difficultyMap.hard.correct,
        accuracy: calcAccuracy(difficultyMap.hard.correct, difficultyMap.hard.total),
      },
    };

    const typeBreakdown: Record<string, { total: number; correct: number; accuracy: number }> = {};
    for (const [tName, tVal] of typeMap.entries()) {
      typeBreakdown[tName] = {
        total: tVal.total,
        correct: tVal.correct,
        accuracy: calcAccuracy(tVal.correct, tVal.total),
      };
    }

    const recentScoreTrends = completed.map((att) => ({
      attemptId: att.id,
      testId: att.testId,
      testTitle: att.snapshot?.testTitle || 'Mock Examination',
      date: att.completedAt || att.startedAt,
      scorePercentage: Number((att.scoreResult?.percentage || 0).toFixed(1)),
      accuracy: Number((att.scoreResult?.accuracy || 0).toFixed(1)),
      totalMarks: Number((att.scoreResult?.totalMarksAwarded || 0).toFixed(1)),
      maxMarks: att.scoreResult?.totalMaxMarks || 0,
      timeSpentSeconds: att.scoreResult?.totalTimeSpentSeconds || 0,
    }));

    return {
      totalAttempts: attempts.length,
      completedAttempts: completed.length,
      totalQuestionsAttempted,
      totalQuestionsCorrect,
      overallAccuracy,
      overallScorePercentage,
      totalTimeSpentSeconds,
      averageTimePerQuestionSeconds,
      subjectBreakdown,
      difficultyBreakdown,
      typeBreakdown,
      recentScoreTrends,
    };
  },

  /**
   * Unified Ingestion Engine:
   * Accepts raw markdown or JSON from LLMs or files, auto-detects Full Paper vs Question Pack,
   * commits all valid questions to IndexedDB, and constructs paper definitions if detected.
   */
  async ingestFromText(
    rawText: string,
    forcedFormat?: 'AUTO' | 'FULL_PAPER' | 'QUESTION_PACK',
  ): Promise<{
    formatDetected: 'FULL_PAPER' | 'QUESTION_PACK';
    paperCreated?: TestDefinition;
    questionsCount: number;
    errorCount: number;
    message: string;
  }> {
    const trimmed = rawText.trim();
    if (!trimmed) {
      throw new Error('Input text is empty.');
    }

    const detected = detectContentFormat(trimmed);
    const isFullPaper =
      forcedFormat === 'FULL_PAPER' ||
      (forcedFormat !== 'QUESTION_PACK' &&
        (detected === 'MARKDOWN_FULL_TEST' || detected === 'JSON_FULL_TEST'));

    if (isFullPaper) {
      // 1. Full Paper Ingestion
      const isJson = detected === 'JSON_FULL_TEST' || trimmed.startsWith('{');
      const parsed = isJson ? parseFullTestJson(trimmed) : parseFullTestMarkdown(trimmed);

      if (parsed.allQuestions.length === 0) {
        throw new Error('No valid questions found in this paper.');
      }

      // Commit all parsed questions into database
      await this.commitQuestions(parsed.allQuestions);

      // Create TestDefinition
      const testDef: TestDefinition = {
        id: `paper_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: parsed.title || 'Imported Examination Paper',
        description:
          parsed.description ||
          `Imported paper with ${parsed.allQuestions.length} questions across ${parsed.sections.length} section(s).`,
        instructions: parsed.instructions,
        mode: parsed.mode || 'EXAM',
        schemaVersion: '2.0',
        version: 1,
        sections: parsed.sections.map((sec, idx) => ({
          id: sec.id || `sec_${idx + 1}`,
          title: sec.title || `Section ${idx + 1}`,
          order: idx,
          selection: {
            mode: 'STATIC',
            staticQuestionIds: sec.questions.map((q) => ({ id: q.id })),
          },
        })),
        timing: {
          mode: parsed.timingMode || 'GLOBAL',
          totalDurationSeconds: (parsed.durationMinutes || 60) * 60,
          allowPause: true,
          autoSubmitOnExpiry: true,
        },
        scoring: {
          defaultMarks: parsed.defaultMarks || 4,
          defaultNegativeMarks: parsed.negativeMarks || 1,
          allowPartialCredit: parsed.allowPartialCredit ?? true,
        },
        navigation: parsed.navigation || 'FREE',
        randomization: {
          shuffleQuestions: false,
          shuffleOptions: false,
        },
        feedback: {
          showImmediateSolution: parsed.mode === 'PRACTICE',
          showHint: parsed.mode === 'PRACTICE',
          allowCheckAnswer: parsed.mode === 'PRACTICE',
          showDetailedSolutionsAfterSubmit: true,
        },
        tags: ['imported-paper'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await this.saveTest(testDef);

      return {
        formatDetected: 'FULL_PAPER',
        paperCreated: testDef,
        questionsCount: parsed.allQuestions.length,
        errorCount: parsed.errors.length,
        message: `Successfully created paper "${testDef.title}" with ${parsed.allQuestions.length} question(s)!`,
      };
    } else {
      // 2. Question Pack Ingestion
      const isJson = detected === 'JSON_QUESTIONS' || trimmed.startsWith('[');
      const res = isJson
        ? await this.importQuestionsFromJson(trimmed)
        : await this.importQuestionsFromMarkdown(trimmed);

      const errorQIds = new Set<string>();
      for (const d of res.diagnostics) {
        if (d.diagnostics.some((item) => item.level === 'ERROR')) {
          if (d.questionId) errorQIds.add(d.questionId);
        }
      }
      const validCount = res.questions.filter((q) => !errorQIds.has(q.id)).length;

      return {
        formatDetected: 'QUESTION_PACK',
        questionsCount: validCount,
        errorCount: errorQIds.size,
        message: `Imported ${validCount} question(s) into your Question Bank!`,
      };
    }
  },

  /**
   * Directly creates and saves a new TestDefinition (paper) from an array of QuestionModels.
   */
  async createPaperFromQuestions(
    title: string,
    questions: QuestionModel[],
    options?: {
      description?: string;
      durationMinutes?: number;
      mode?: 'EXAM' | 'PRACTICE';
      defaultMarks?: number;
      negativeMarks?: number;
      instructions?: string;
      tags?: string[];
    },
  ): Promise<TestDefinition> {
    if (questions.length === 0) {
      throw new Error('Cannot create a paper with 0 questions.');
    }

    await this.commitQuestions(questions);

    const testDef: TestDefinition = {
      id: `paper_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: title.trim() || 'Untitled Practice Paper',
      description:
        options?.description ||
        `Custom paper containing ${questions.length} question(s). Created ${new Date().toLocaleDateString()}.`,
      instructions: options?.instructions,
      mode: options?.mode || 'EXAM',
      schemaVersion: '2.0',
      version: 1,
      sections: [
        {
          id: 'sec_1',
          title: 'Section 1: General',
          order: 0,
          selection: {
            mode: 'STATIC',
            staticQuestionIds: questions.map((q) => ({ id: q.id })),
          },
        },
      ],
      timing: {
        mode: options?.durationMinutes && options.durationMinutes > 0 ? 'GLOBAL' : 'NONE',
        totalDurationSeconds: (options?.durationMinutes || questions.length * 2) * 60,
        allowPause: true,
        autoSubmitOnExpiry: true,
      },
      scoring: {
        defaultMarks: options?.defaultMarks || 4,
        defaultNegativeMarks: options?.negativeMarks !== undefined ? options.negativeMarks : 1,
        allowPartialCredit: true,
      },
      navigation: 'FREE',
      randomization: {
        shuffleQuestions: false,
        shuffleOptions: false,
      },
      feedback: {
        showImmediateSolution: options?.mode === 'PRACTICE',
        showHint: options?.mode === 'PRACTICE',
        allowCheckAnswer: options?.mode === 'PRACTICE',
        showDetailedSolutionsAfterSubmit: true,
      },
      tags: options?.tags || ['custom-paper'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.saveTest(testDef);
    return testDef;
  },
};
