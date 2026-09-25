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
import { parseJsonQuestions, type JsonParseResult } from '../parser/jsonConverter';
import { parseMarkdownQuestions, type ParseResult } from '../parser/markdownParser';
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

    return collection.filter((q) => {
      if (filters.subject && filters.subject !== 'ALL' && q.subject.toLowerCase() !== filters.subject.toLowerCase()) return false;
      if (filters.topic && filters.topic !== 'ALL' && q.topic.toLowerCase() !== filters.topic.toLowerCase()) return false;
      if (filters.difficulty && filters.difficulty !== 'ALL' && q.difficulty !== filters.difficulty) return false;
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
    }).toArray();
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

    const filtered = await collection.filter((q) => {
      if (filters?.subject && filters.subject !== 'ALL' && q.subject.toLowerCase() !== filters.subject.toLowerCase()) return false;
      if (filters?.topic && filters.topic !== 'ALL' && q.topic.toLowerCase() !== filters.topic.toLowerCase()) return false;
      if (filters?.difficulty && filters.difficulty !== 'ALL' && q.difficulty !== filters.difficulty) return false;
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
    }).toArray();

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
   * Get single question by ID.
   */
  async getQuestionById(id: string): Promise<QuestionModel | undefined> {
    return db.questions.get(id);
  },

  /**
   * Saves or updates a question.
   * Invariant 6: Content modification increments version and records immutable snapshot in questionVersions.
   */
  async saveQuestion(question: QuestionModel): Promise<{ question: QuestionModel; diagnostics: ValidationDiagnostic[] }> {
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
        const existing = await db.questions.get(q.id);
        const version = existing ? (existing.version || 1) + 1 : q.version || 1;
        const toSave: QuestionModel = {
          ...q,
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
    }
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
        const report = validateSectionConstraints(sec, allQuestions, { alreadySelectedIds: alreadySelected });
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

      const percentage = totalReq > 0 ? Math.min(100, Math.round((totalAvail / totalReq) * 100)) : 100;

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
      throw new Error('No incorrect questions found in your past attempts! Take an exam first or use Quick Drill.');
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
  async recordEvent(attemptId: string, event: Omit<AttemptEvent, 'id' | 'timestamp'>): Promise<void> {
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

    if (attempt.status === 'SUBMITTED' || attempt.status === 'SCORED' || attempt.status === 'AUTO_SUBMITTED') {
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
};
