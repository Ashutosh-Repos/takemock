/**
 * Selection Engine for takemock.
 * Deterministic, constraint-based question selection pipeline respecting:
 * - Deterministic Mulberry32 PRNG seed reproducibility (Invariant 6)
 * - Explicit constraint satisfaction and diagnostic failure reporting (Invariant 7)
 * - Atomic passage and group contiguous integrity (Invariant 8)
 * - Cross-section deduplication and history-aware filtering (unseen / mistake vault)
 *
 * Adheres strictly to docs/master_architecture_prompt_v2.md Sections 10 & 11.
 */

import type { QuestionModel } from '@/types/question';
import type { SelectionConstraint, TestDefinition, TestSectionDefinition } from '@/types/test';

/**
 * Fast, deterministic 32-bit Mulberry32 PRNG.
 * Produces identical pseudo-random numbers given the same seed across all platforms.
 */
export function createPRNG(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministically shuffles an array in O(n) time using Fisher-Yates and provided PRNG.
 */
export function shuffleWithPRNG<T>(array: T[], prng: () => number): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Detailed error thrown when selection constraints cannot be satisfied.
 * Guaranteeing Invariant 7 (never silently produce an incorrect test).
 */
export class SelectionConstraintError extends Error {
  public readonly sectionId: string;
  public readonly constraint: SelectionConstraint;
  public readonly requestedCount: number;
  public readonly availableCount: number;

  constructor(
    sectionId: string,
    constraint: SelectionConstraint,
    requestedCount: number,
    availableCount: number
  ) {
    super(
      `SelectionConstraintError: Section "${sectionId}" requires ${requestedCount} questions matching (${JSON.stringify(
        constraint
      )}), but only ${availableCount} matching candidate questions were found in the question bank.`
    );
    this.name = 'SelectionConstraintError';
    this.sectionId = sectionId;
    this.constraint = constraint;
    this.requestedCount = requestedCount;
    this.availableCount = availableCount;
  }
}

/**
 * An atomic selectable unit (either an isolated single question or a passage group).
 */
export interface SelectionUnit {
  id: string;
  groupId?: string;
  questions: QuestionModel[];
  size: number;
}

/**
 * Execution context passed to the selection pipeline.
 */
export interface SelectionContext {
  prng: () => number;
  shuffleQuestions: boolean;
  globalSelectedIds?: Set<string>; // Avoids duplicate questions across multiple sections
  excludeQuestionIds?: Set<string>; // For history-aware filtering (e.g. recently seen)
  includeOnlyQuestionIds?: Set<string>; // For targeted practice (e.g. mistake vault)
}

/**
 * Diagnostic validation report for section constraints.
 */
export interface ConstraintDiagnostic {
  constraint: SelectionConstraint;
  requested: number;
  available: number;
  satisfied: boolean;
  matchingIds: string[];
}

export interface SectionValidationReport {
  sectionId: string;
  sectionTitle: string;
  isSatisfiable: boolean;
  totalRequested: number;
  totalAvailable: number;
  diagnostics: ConstraintDiagnostic[];
}

/**
 * Evaluates whether a question matches a given selection constraint.
 */
export function matchesConstraint(q: QuestionModel, constraint: SelectionConstraint): boolean {
  if (constraint.subject && q.subject.trim().toLowerCase() !== constraint.subject.trim().toLowerCase()) {
    return false;
  }
  if (constraint.topic && q.topic.trim().toLowerCase() !== constraint.topic.trim().toLowerCase()) {
    return false;
  }
  if (constraint.difficulty && q.difficulty !== constraint.difficulty) {
    return false;
  }
  if (constraint.type && q.type !== constraint.type) {
    return false;
  }
  if (constraint.tags && constraint.tags.length > 0) {
    const qTags = (q.tags || []).map((t) => t.trim().toLowerCase());
    const hasAll = constraint.tags.every((t) => qTags.includes(t.trim().toLowerCase()));
    if (!hasAll) return false;
  }
  return true;
}

/**
 * Pre-flight diagnostic check for test sections against the question bank.
 * Allows UI and test builders to verify satisfaction before attempting launch.
 */
export function validateSectionConstraints(
  section: TestSectionDefinition,
  allQuestions: QuestionModel[],
  options?: {
    excludeQuestionIds?: Set<string>;
    includeOnlyQuestionIds?: Set<string>;
    alreadySelectedIds?: Set<string>;
  }
): SectionValidationReport {
  const config = section.selection;
  const alreadySelected = options?.alreadySelectedIds || new Set<string>();

  // 1. Static validation
  if (config.mode === 'STATIC' && config.staticQuestionIds) {
    const qMap = new Map(allQuestions.map((q) => [q.id, q]));
    const missing: string[] = [];
    for (const ref of config.staticQuestionIds) {
      if (!qMap.has(ref.id)) {
        missing.push(ref.id);
      }
    }
    return {
      sectionId: section.id,
      sectionTitle: section.title,
      isSatisfiable: missing.length === 0,
      totalRequested: config.staticQuestionIds.length,
      totalAvailable: config.staticQuestionIds.length - missing.length,
      diagnostics: [
        {
          constraint: { count: config.staticQuestionIds.length },
          requested: config.staticQuestionIds.length,
          available: config.staticQuestionIds.length - missing.length,
          satisfied: missing.length === 0,
          matchingIds: config.staticQuestionIds.filter((r) => qMap.has(r.id)).map((r) => r.id),
        },
      ],
    };
  }

  // 2. Rule-based validation
  const diagnostics: ConstraintDiagnostic[] = [];
  let isAllSatisfiable = true;
  let totalReq = 0;
  let totalAvail = 0;

  const usedInSim = new Set<string>(alreadySelected);

  for (const c of config.constraints || []) {
    totalReq += c.count;

    const matched = allQuestions.filter((q) => {
      if (usedInSim.has(q.id)) return false;
      if (options?.excludeQuestionIds?.has(q.id)) return false;
      if (options?.includeOnlyQuestionIds && !options.includeOnlyQuestionIds.has(q.id)) return false;
      return matchesConstraint(q, c);
    });

    const satisfied = matched.length >= c.count;
    if (!satisfied) {
      isAllSatisfiable = false;
    }

    // Mark matched in simulation to account for overlap between constraints
    for (const m of matched.slice(0, c.count)) {
      usedInSim.add(m.id);
    }

    totalAvail += matched.length;
    diagnostics.push({
      constraint: c,
      requested: c.count,
      available: matched.length,
      satisfied,
      matchingIds: matched.map((q) => q.id),
    });
  }

  return {
    sectionId: section.id,
    sectionTitle: section.title,
    isSatisfiable: isAllSatisfiable,
    totalRequested: totalReq,
    totalAvailable: totalAvail,
    diagnostics,
  };
}

/**
 * Selects questions for a single section respecting context, groups, and constraints.
 */
export function selectQuestionsForSection(
  section: TestSectionDefinition,
  allQuestions: QuestionModel[],
  context: SelectionContext
): QuestionModel[] {
  const config = section.selection;
  const globalSelected = context.globalSelectedIds || new Set<string>();

  // Lookup maps
  const qMap = new Map<string, QuestionModel>();
  const groupMap = new Map<string, QuestionModel[]>();

  for (const q of allQuestions) {
    qMap.set(q.id, q);
    if (q.questionGroupId) {
      let g = groupMap.get(q.questionGroupId);
      if (!g) {
        g = [];
        groupMap.set(q.questionGroupId, g);
      }
      g.push(q);
    }
  }

  // 1. Static selection
  if (config.mode === 'STATIC' && config.staticQuestionIds) {
    const selected: QuestionModel[] = [];

    for (const ref of config.staticQuestionIds) {
      const q = qMap.get(ref.id);
      if (q) {
        selected.push(q);
        globalSelected.add(q.id);
      } else {
        throw new Error(`Static question ID "${ref.id}" not found in question bank`);
      }
    }

    if (context.shuffleQuestions) {
      return groupAwareShuffle(selected, context.prng);
    }
    return selected;
  }

  // 2. Rule-based constraint selection
  if (config.mode === 'RULE_BASED' && config.constraints) {
    const sectionSelectedQuestions: QuestionModel[] = [];

    for (const constraint of config.constraints) {
      // Find candidate questions matching constraint
      const candidates = allQuestions.filter((q) => {
        if (globalSelected.has(q.id)) return false;
        if (context.excludeQuestionIds?.has(q.id)) return false;
        if (context.includeOnlyQuestionIds && !context.includeOnlyQuestionIds.has(q.id)) return false;
        return matchesConstraint(q, constraint);
      });

      if (candidates.length < constraint.count) {
        throw new SelectionConstraintError(section.id, constraint, constraint.count, candidates.length);
      }

      // Partition candidates into atomic selection units
      const units: SelectionUnit[] = [];
      const seenGroupIds = new Set<string>();

      for (const q of candidates) {
        if (q.questionGroupId) {
          if (!seenGroupIds.has(q.questionGroupId)) {
            seenGroupIds.add(q.questionGroupId);
            // Sibling questions must all belong to this group
            const siblings = groupMap.get(q.questionGroupId) || [q];
            units.push({
              id: q.questionGroupId,
              groupId: q.questionGroupId,
              questions: siblings,
              size: siblings.length,
            });
          }
        } else {
          units.push({
            id: q.id,
            questions: [q],
            size: 1,
          });
        }
      }

      // Shuffle available candidate units deterministically
      const shuffledUnits = shuffleWithPRNG(units, context.prng);

      let collected = 0;
      for (const unit of shuffledUnits) {
        if (collected >= constraint.count) break;

        // Ensure this unit hasn't already been consumed
        const unselectedQuestions = unit.questions.filter((q) => !globalSelected.has(q.id));
        if (unselectedQuestions.length === 0) continue;

        // If taking this unit would significantly overflow, check if single questions can fit exact quota
        if (collected + unselectedQuestions.length > constraint.count && unit.groupId) {
          // Look ahead to see if single questions exist that can reach exact quota
          const singleCandidates = shuffledUnits
            .filter((u) => !u.groupId && !globalSelected.has(u.id))
            .flatMap((u) => u.questions);

          if (singleCandidates.length >= constraint.count - collected) {
            continue; // Skip large group to allow exact fit
          }
        }

        // Add atomic unit
        for (const q of unselectedQuestions) {
          globalSelected.add(q.id);
          sectionSelectedQuestions.push(q);
          collected++;
        }
      }

      if (collected < constraint.count) {
        throw new SelectionConstraintError(section.id, constraint, constraint.count, collected);
      }
    }

    if (context.shuffleQuestions) {
      return groupAwareShuffle(sectionSelectedQuestions, context.prng);
    }
    return sectionSelectedQuestions;
  }

  return [];
}

/**
 * Shuffles questions while ensuring questions with the same questionGroupId
 * remain strictly contiguous in sequence (Invariant 8).
 */
export function groupAwareShuffle(questions: QuestionModel[], prng: () => number): QuestionModel[] {
  // 1. Group contiguous or identical groupIds into atomic clusters
  const clusters: Array<QuestionModel[]> = [];
  const groupClusterMap = new Map<string, QuestionModel[]>();

  for (const q of questions) {
    if (q.questionGroupId) {
      let cluster = groupClusterMap.get(q.questionGroupId);
      if (!cluster) {
        cluster = [];
        groupClusterMap.set(q.questionGroupId, cluster);
        clusters.push(cluster);
      }
      cluster.push(q);
    } else {
      clusters.push([q]);
    }
  }

  // 2. Shuffle clusters deterministically
  const shuffledClusters = shuffleWithPRNG(clusters, prng);

  // 3. Flatten back to flat question array
  return shuffledClusters.flat();
}

/**
 * Selects questions for an entire multi-section test definition deterministically.
 * Guarantees zero duplicate questions across sections unless explicitly intended.
 */
export function selectQuestionsForEntireTest(
  testDef: TestDefinition,
  allQuestions: QuestionModel[],
  seed?: number,
  options?: {
    excludeQuestionIds?: Set<string>;
    includeOnlyQuestionIds?: Set<string>;
  }
): {
  sectionQuestions: Record<string, QuestionModel[]>;
  seed: number;
} {
  const chosenSeed = seed !== undefined ? seed : Math.floor(Math.random() * 2147483647);
  const prng = createPRNG(chosenSeed);
  const globalSelectedIds = new Set<string>();

  const result: Record<string, QuestionModel[]> = {};

  for (const section of testDef.sections) {
    const questions = selectQuestionsForSection(section, allQuestions, {
      prng,
      shuffleQuestions: testDef.randomization.shuffleQuestions,
      globalSelectedIds,
      excludeQuestionIds: options?.excludeQuestionIds,
      includeOnlyQuestionIds: options?.includeOnlyQuestionIds,
    });
    result[section.id] = questions;
  }

  return {
    sectionQuestions: result,
    seed: chosenSeed,
  };
}
