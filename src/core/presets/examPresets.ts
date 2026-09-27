/**
 * Standard Exam Presets for takemock.
 * Ready-to-generate authoritative examination templates (JEE Main, NEET, GATE, Topic Drills).
 * Adheres strictly to docs/master_architecture_prompt_v2.md Sections 0, 8, 10, 13.
 */

import type { DifficultyLevel, QuestionType } from '@/types/question';
import type { NavigationMode, TestDefinition, TestMode } from '@/types/test';

export interface ExamPresetDefinition {
  id: string;
  title: string;
  description: string;
  category: 'COMPETITIVE_EXAM' | 'SPEED_DRILL' | 'ADAPTIVE_PRACTICE';
  defaultMode: TestMode;
  totalDurationMinutes: number;
  navigation: NavigationMode;
  defaultMarks: number;
  negativeMarks: number;
  tags: string[];
  sections: Array<{
    id: string;
    title: string;
    subject: string;
    topic?: string;
    questionCount: number;
    difficulty?: DifficultyLevel;
    type?: QuestionType;
  }>;
}

export const EXAM_PRESETS: ExamPresetDefinition[] = [
  {
    id: 'preset-jee-main',
    title: 'JEE Main Full-Length Mock Exam',
    description:
      'Standard 3-hour NTA CBT simulation covering Physics, Chemistry, and Mathematics (25 questions each, +4/-1 marking).',
    category: 'COMPETITIVE_EXAM',
    defaultMode: 'EXAM',
    totalDurationMinutes: 180,
    navigation: 'FREE',
    defaultMarks: 4,
    negativeMarks: 1,
    tags: ['jee', 'engineering', 'full-mock'],
    sections: [
      {
        id: 'sec_physics',
        title: 'Section A: Physics',
        subject: 'Physics',
        questionCount: 25,
      },
      {
        id: 'sec_chemistry',
        title: 'Section B: Chemistry',
        subject: 'Chemistry',
        questionCount: 25,
      },
      {
        id: 'sec_math',
        title: 'Section C: Mathematics',
        subject: 'Mathematics',
        questionCount: 25,
      },
    ],
  },
  {
    id: 'preset-neet-full',
    title: 'NEET UG Medical Entrance Simulation',
    description:
      'Comprehensive 200-minute medical mock test featuring Physics, Chemistry, Botany, and Zoology with NEET standard scoring.',
    category: 'COMPETITIVE_EXAM',
    defaultMode: 'EXAM',
    totalDurationMinutes: 200,
    navigation: 'FREE',
    defaultMarks: 4,
    negativeMarks: 1,
    tags: ['neet', 'medical', 'biology'],
    sections: [
      {
        id: 'sec_physics',
        title: 'Section 1: Physics',
        subject: 'Physics',
        questionCount: 45,
      },
      {
        id: 'sec_chemistry',
        title: 'Section 2: Chemistry',
        subject: 'Chemistry',
        questionCount: 45,
      },
      {
        id: 'sec_biology',
        title: 'Section 3: Biology',
        subject: 'Biology',
        questionCount: 90,
      },
    ],
  },
  {
    id: 'preset-gate-cs',
    title: 'GATE CS & IT Comprehensive Assessment',
    description:
      'Graduate Aptitude Test in Computer Science: General Aptitude plus Core CS (Algorithms, OS, Data Structures, Theory).',
    category: 'COMPETITIVE_EXAM',
    defaultMode: 'EXAM',
    totalDurationMinutes: 180,
    navigation: 'FREE',
    defaultMarks: 2,
    negativeMarks: 0.66,
    tags: ['gate', 'computer-science', 'algorithms'],
    sections: [
      {
        id: 'sec_aptitude',
        title: 'Section 1: General Aptitude',
        subject: 'General Aptitude',
        questionCount: 10,
      },
      {
        id: 'sec_cs_core',
        title: 'Section 2: Computer Science & IT',
        subject: 'Computer Science',
        questionCount: 55,
      },
    ],
  },
  {
    id: 'preset-speed-drill',
    title: '30-Minute High-Yield Speed Drill',
    description:
      'Rapid-fire 15-question mixed problem set designed for speed training, mental calculation, and error reduction.',
    category: 'SPEED_DRILL',
    defaultMode: 'PRACTICE',
    totalDurationMinutes: 30,
    navigation: 'FREE',
    defaultMarks: 4,
    negativeMarks: 1,
    tags: ['speed-drill', 'daily-practice', 'rapid-fire'],
    sections: [
      {
        id: 'sec_speed_drill',
        title: 'Speed Drill',
        subject: 'All',
        questionCount: 15,
      },
    ],
  },
];

/**
 * Builds a concrete TestDefinition from an ExamPresetDefinition.
 */
export function buildTestDefinitionFromPreset(
  preset: ExamPresetDefinition,
  customTitle?: string,
): TestDefinition {
  return {
    id: `test_${preset.id}_${Date.now()}`,
    title: customTitle || preset.title,
    description: preset.description,
    mode: preset.defaultMode,
    schemaVersion: '2.0',
    version: 1,
    sections: preset.sections.map((sec, idx) => ({
      id: sec.id,
      title: sec.title,
      order: idx,
      selection: {
        mode: 'RULE_BASED',
        constraints: [
          {
            subject: sec.subject !== 'All' ? sec.subject : undefined,
            topic: sec.topic,
            difficulty: sec.difficulty,
            type: sec.type,
            count: sec.questionCount,
          },
        ],
      },
    })),
    timing: {
      mode: preset.totalDurationMinutes > 0 ? 'GLOBAL' : 'NONE',
      totalDurationSeconds: preset.totalDurationMinutes * 60,
      allowPause: preset.defaultMode === 'PRACTICE',
      autoSubmitOnExpiry: true,
      warnThresholdSeconds: 300,
    },
    scoring: {
      defaultMarks: preset.defaultMarks,
      defaultNegativeMarks: preset.negativeMarks,
      allowPartialCredit: true,
    },
    navigation: preset.navigation,
    randomization: {
      shuffleQuestions: true,
      shuffleOptions: true,
      seed: Math.floor(Math.random() * 2147483647),
    },
    feedback: {
      showImmediateSolution: preset.defaultMode === 'PRACTICE',
      showHint: preset.defaultMode === 'PRACTICE',
      allowCheckAnswer: preset.defaultMode === 'PRACTICE',
      showDetailedSolutionsAfterSubmit: true,
    },
    tags: preset.tags,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
