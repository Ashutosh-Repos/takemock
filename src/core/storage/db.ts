/**
 * Offline-First IndexedDB Database for takemock using Dexie.
 * Adheres strictly to docs/master_architecture_prompt_v2.md Section 40.
 */

import Dexie, { type EntityTable } from 'dexie';
import type { AttemptState, TestSnapshot } from '@/types/attempt';
import type { QuestionModel } from '@/types/question';
import type { TestDefinition } from '@/types/test';

export interface QuestionVersionRecord {
  id: string; // `${questionId}_v${version}`
  questionId: string;
  version: number;
  data: QuestionModel;
  createdAt: string;
}

export class TakemockDatabase extends Dexie {
  questions!: EntityTable<QuestionModel, 'id'>;
  questionVersions!: EntityTable<QuestionVersionRecord, 'id'>;
  testDefinitions!: EntityTable<TestDefinition, 'id'>;
  testSnapshots!: EntityTable<TestSnapshot, 'snapshotId'>;
  attempts!: EntityTable<AttemptState, 'id'>;

  constructor() {
    super('takemock_db');

    this.version(1).stores({
      questions: 'id, schemaVersion, type, subject, topic, difficulty, version, *tags, updatedAt',
      questionVersions: 'id, questionId, version, createdAt',
      testDefinitions: 'id, title, mode, version, createdAt, updatedAt',
      testSnapshots: 'snapshotId, testId, createdAt',
      attempts: 'id, testId, status, startedAt, completedAt',
    });
  }
}

export const db = new TakemockDatabase();
