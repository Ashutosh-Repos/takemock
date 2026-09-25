/**
 * Initial Question Bank and Test Blueprint Seed Data for takemock.
 * Provides rich, rigorous questions across all 10 canonical question types with KaTeX math.
 */

import type { QuestionModel } from '@/types/question';
import type { TestDefinition } from '@/types/test';
import { db } from './db';

export const SEED_QUESTIONS: QuestionModel[] = [
  // 1. Single Choice with Math (Physics)
  {
    schemaVersion: '2.0',
    id: 'phy-kin-001',
    version: 1,
    type: 'single_choice',
    subject: 'Physics',
    topic: 'Kinematics',
    difficulty: 'medium',
    marks: 4,
    negativeMarks: 1,
    tags: ['kinematics', 'projectile', 'jee'],
    estimatedTimeSeconds: 120,
    body: `A projectile is launched from ground level with initial speed $u$ at an angle $\\theta$ to the horizontal. If the maximum height attained equals its horizontal range $R$, what is the value of $\\tan(\\theta)$?`,
    options: [
      { id: 'opt_0', text: '$\\tan(\\theta) = 1$', isCorrect: false },
      { id: 'opt_1', text: '$\\tan(\\theta) = 2$', isCorrect: false },
      { id: 'opt_2', text: '$\\tan(\\theta) = 4$', isCorrect: true },
      { id: 'opt_3', text: '$\\tan(\\theta) = 0.5$', isCorrect: false },
    ],
    solution: `The maximum height is given by:
$$H = \\frac{u^2 \\sin^2(\\theta)}{2g}$$
The horizontal range is:
$$R = \\frac{u^2 \\sin(2\\theta)}{g} = \\frac{2u^2 \\sin(\\theta)\\cos(\\theta)}{g}$$
Given $H = R$:
$$\\frac{u^2 \\sin^2(\\theta)}{2g} = \\frac{2u^2 \\sin(\\theta)\\cos(\\theta)}{g}$$
Cancelling $\\frac{u^2\\sin(\\theta)}{g}$ on both sides:
$$\\frac{\\sin(\\theta)}{2} = 2\\cos(\\theta) \\implies \\tan(\\theta) = 4$$`,
  },

  // 2. Multiple Choice with Partial Credit (Computer Science)
  {
    schemaVersion: '2.0',
    id: 'cs-algo-002',
    version: 1,
    type: 'multiple_choice',
    subject: 'Computer Science',
    topic: 'Algorithms',
    difficulty: 'medium',
    marks: 4,
    negativeMarks: 1,
    allowPartialCredit: true,
    tags: ['algorithms', 'sorting', 'divide-and-conquer'],
    estimatedTimeSeconds: 90,
    body: `Which of the following sorting algorithms have an average-case asymptotic time complexity of $\\mathcal{O}(n \\log n)$?`,
    options: [
      { id: 'opt_0', text: 'Merge Sort', isCorrect: true },
      { id: 'opt_1', text: 'Quick Sort', isCorrect: true },
      { id: 'opt_2', text: 'Bubble Sort', isCorrect: false },
      { id: 'opt_3', text: 'Heap Sort', isCorrect: true },
    ],
    solution: `Merge Sort, Quick Sort, and Heap Sort all have an average-case time complexity of $\\mathcal{O}(n \\log n)$.
Bubble Sort has an average-case time complexity of $\\mathcal{O}(n^2)$.
Therefore, the correct options are Merge Sort, Quick Sort, and Heap Sort.`,
  },

  // 3. True / False (Mathematics)
  {
    schemaVersion: '2.0',
    id: 'math-calc-003',
    version: 1,
    type: 'true_false',
    subject: 'Mathematics',
    topic: 'Calculus',
    difficulty: 'easy',
    marks: 2,
    negativeMarks: 0.5,
    tags: ['calculus', 'continuity', 'differentiability'],
    body: `If a real-valued function $f(x)$ is continuous at $x = c$, it is guaranteed to be differentiable at $x = c$.`,
    options: [
      { id: 'opt_0', text: 'True', isCorrect: false },
      { id: 'opt_1', text: 'False', isCorrect: true },
    ],
    solution: `Continuity is a necessary condition for differentiability, but not a sufficient condition.
A classic counterexample is $f(x) = |x|$ at $x = 0$, which is continuous everywhere but not differentiable at $x = 0$ due to the sharp corner (left derivative is $-1$, right derivative is $+1$).`,
  },

  // 4. Numerical with KaTeX and absolute tolerance (Physics)
  {
    schemaVersion: '2.0',
    id: 'phy-optics-004',
    version: 1,
    type: 'numerical',
    subject: 'Physics',
    topic: 'Optics',
    difficulty: 'medium',
    marks: 4,
    negativeMarks: 0,
    correctValue: 15,
    toleranceAbsolute: 0.2,
    unit: 'cm',
    tags: ['optics', 'lens-formula', 'focal-length'],
    body: `A convex lens has a focal length of $f = 10\\text{ cm}$. An object is placed at a distance of $u = -30\\text{ cm}$ in front of the lens. Calculate the image distance $v$ (in $\\text{cm}$) formed by the lens.`,
    solution: `Using the thin lens formula:
$$\\frac{1}{f} = \\frac{1}{v} - \\frac{1}{u}$$
Given $f = +10\\text{ cm}$ and $u = -30\\text{ cm}$:
$$\\frac{1}{10} = \\frac{1}{v} - \\left(-\\frac{1}{30}\\right) = \\frac{1}{v} + \\frac{1}{30}$$
$$\\frac{1}{v} = \\frac{1}{10} - \\frac{1}{30} = \\frac{3 - 1}{30} = \\frac{2}{30} = \\frac{1}{15}$$
Therefore, $v = 15\\text{ cm}$.`,
  },

  // 5. Integer (Mathematics)
  {
    schemaVersion: '2.0',
    id: 'math-graph-005',
    version: 1,
    type: 'integer',
    subject: 'Mathematics',
    topic: 'Graph Theory',
    difficulty: 'easy',
    marks: 3,
    negativeMarks: 0,
    correctValue: 21,
    tags: ['discrete-math', 'graph-theory', 'combinatorics'],
    body: `How many edges are present in a complete undirected graph $K_7$ with $7$ vertices?`,
    solution: `In a complete graph $K_n$, an edge exists between every pair of distinct vertices.
The number of edges is:
$$E = \\binom{n}{2} = \\frac{n(n - 1)}{2}$$
For $n = 7$:
$$E = \\frac{7 \\times 6}{2} = 21$$`,
  },

  // 6. Fill in the Blank (Computer Science)
  {
    schemaVersion: '2.0',
    id: 'cs-os-006',
    version: 1,
    type: 'fill_blank',
    subject: 'Computer Science',
    topic: 'Operating Systems',
    difficulty: 'easy',
    marks: 2,
    negativeMarks: 0,
    acceptedAnswers: ['semaphore', 'semaphores'],
    caseSensitive: false,
    tags: ['os', 'concurrency', 'synchronization'],
    body: `A synchronization primitive introduced by Edsger Dijkstra consisting of an integer value manipulated via wait ($P$) and signal ($V$) atomic operations is known as a ______.`,
    solution: `A **semaphore** is an abstract data type used to control access to common resources in concurrent programming. Its core operations $P$ (wait/decrement) and $V$ (signal/increment) ensure mutual exclusion and thread synchronization.`,
  },

  // 7. Match the Following (Computer Science)
  {
    schemaVersion: '2.0',
    id: 'cs-ds-007',
    version: 1,
    type: 'match',
    subject: 'Computer Science',
    topic: 'Data Structures',
    difficulty: 'medium',
    marks: 4,
    negativeMarks: 1,
    tags: ['data-structures', 'complexity'],
    body: `Match each data structure operation with its worst-case asymptotic time complexity:`,
    matches: [
      { left: 'Hash Table Search', right: 'O(n)' },
      { left: 'Binary Search Tree Search', right: 'O(n)' },
      { left: 'Red-Black Tree Search', right: 'O(log n)' },
      { left: 'Array Element Access by Index', right: 'O(1)' },
    ],
    solution: `- Hash Table Search worst case: $\\mathcal{O}(n)$ (all keys collide into same bucket).
- BST Search worst case: $\\mathcal{O}(n)$ (degenerate skewed tree).
- Red-Black Tree Search: $\\mathcal{O}(\\log n)$ (strictly height-balanced).
- Array access by index: $\\mathcal{O}(1)$ (direct memory address calculation).`,
  },

  // 8. Assertion–Reason (Physics)
  {
    schemaVersion: '2.0',
    id: 'phy-thermo-008',
    version: 1,
    type: 'assertion_reason',
    subject: 'Physics',
    topic: 'Thermodynamics',
    difficulty: 'medium',
    marks: 4,
    negativeMarks: 1,
    correctCode: 'A',
    tags: ['thermodynamics', 'carnot-engine'],
    body: `**Assertion (A):** The efficiency of a reversible Carnot heat engine operating between two given temperatures $T_H$ and $T_C$ cannot be exceeded by any other heat engine operating between the same two temperatures.

**Reason (R):** According to the Second Law of Thermodynamics, no heat engine can have an efficiency greater than a reversible engine operating between identical thermal reservoirs.`,
    options: [
      { id: 'A', text: 'Both (A) and (R) are true and (R) is the correct explanation of (A)', isCorrect: true },
      { id: 'B', text: 'Both (A) and (R) are true but (R) is not the correct explanation of (A)', isCorrect: false },
      { id: 'C', text: '(A) is true but (R) is false', isCorrect: false },
      { id: 'D', text: '(A) is false but (R) is true', isCorrect: false },
      { id: 'E', text: 'Both (A) and (R) are false', isCorrect: false },
    ],
    solution: `Carnot's theorem is a direct consequence of the Second Law of Thermodynamics (Clausius and Kelvin-Planck formulations).
It establishes that no engine operating between two heat reservoirs can be more efficient than a Carnot engine operating between the same reservoirs.
Both Assertion and Reason are true, and the Reason correctly explains the Assertion.`,
  },

  // 9. Passage / Shared Stimulus (Physics)
  {
    schemaVersion: '2.0',
    id: 'phy-em-passage-009',
    version: 1,
    type: 'passage',
    questionGroupId: 'passage-em-wave',
    subject: 'Physics',
    topic: 'Electromagnetism',
    difficulty: 'hard',
    marks: 4,
    negativeMarks: 1,
    tags: ['electromagnetism', 'poynting-vector', 'passage'],
    body: `### Passage: Electromagnetic Energy Transport

In classical electrodynamics, an electromagnetic plane wave propagating in vacuum along the $+z$-axis has electric and magnetic field components given by:
$$\\vec{E}(z, t) = E_0 \\cos(kz - \\omega t) \\,\\hat{i}$$
$$\\vec{B}(z, t) = B_0 \\cos(kz - \\omega t) \\,\\hat{j}$$
where $E_0 = c B_0$ and $c = \\frac{1}{\\sqrt{\\mu_0 \\varepsilon_0}}$. The rate of energy flow per unit area is quantified by the Poynting vector:
$$\\vec{S} = \\frac{1}{\\mu_0} (\\vec{E} \\times \\vec{B})$$

**Question:** What is the direction of the Poynting vector $\\vec{S}$?`,
    options: [
      { id: 'opt_0', text: '$+\\hat{k}$ (along $+z$ direction)', isCorrect: true },
      { id: 'opt_1', text: '$-\\hat{k}$ (along $-z$ direction)', isCorrect: false },
      { id: 'opt_2', text: '$+\\hat{i}$ (along $+x$ direction)', isCorrect: false },
      { id: 'opt_3', text: '$+\\hat{j}$ (along $+y$ direction)', isCorrect: false },
    ],
    solution: `The Poynting vector is given by:
$$\\vec{S} = \\frac{1}{\\mu_0} (\\vec{E} \\times \\vec{B})$$
Since $\\vec{E}$ is along $\\hat{i}$ and $\\vec{B}$ is along $\\hat{j}$:
$$\\hat{i} \\times \\hat{j} = \\hat{k}$$
Thus, $\\vec{S}$ points strictly along the $+z$ direction ($+\\hat{k}$), which is the direction of wave propagation.`,
  },

  // 10. Image Based (Mathematics / Geometry)
  {
    schemaVersion: '2.0',
    id: 'math-geom-010',
    version: 1,
    type: 'image_based',
    subject: 'Mathematics',
    topic: 'Linear Algebra',
    difficulty: 'medium',
    marks: 4,
    negativeMarks: 1,
    imageUrl: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=600&auto=format&fit=crop&q=80',
    imageAlt: 'Geometric vector transformation diagram',
    tags: ['linear-algebra', 'eigenvalues', 'matrices'],
    body: `Consider a $2 \\times 2$ real symmetric matrix $A = \\begin{pmatrix} 2 & 1 \\\\ 1 & 2 \\end{pmatrix}$ representing a linear transformation on $\\mathbb{R}^2$.
What are the eigenvalues $\\lambda_1, \\lambda_2$ of matrix $A$?`,
    options: [
      { id: 'opt_0', text: '$\\lambda_1 = 3, \\,\\lambda_2 = 1$', isCorrect: true },
      { id: 'opt_1', text: '$\\lambda_1 = 4, \\,\\lambda_2 = 0$', isCorrect: false },
      { id: 'opt_2', text: '$\\lambda_1 = 2, \\,\\lambda_2 = 2$', isCorrect: false },
      { id: 'opt_3', text: '$\\lambda_1 = 5, \\,\\lambda_2 = -1$', isCorrect: false },
    ],
    solution: `The characteristic equation is $\\det(A - \\lambda I) = 0$:
$$\\det \\begin{pmatrix} 2 - \\lambda & 1 \\\\ 1 & 2 - \\lambda \\end{pmatrix} = 0$$
$$(2 - \\lambda)^2 - 1 = 0$$
$$4 - 4\\lambda + \\lambda^2 - 1 = 0 \\implies \\lambda^2 - 4\\lambda + 3 = 0$$
$$(\\lambda - 3)(\\lambda - 1) = 0$$
Hence, the eigenvalues are $\\lambda_1 = 3$ and $\\lambda_2 = 1$.`,
  },
];

export const SEED_TESTS: TestDefinition[] = [
  {
    id: 'test-jee-full-mock',
    title: 'Engineering & Physics CBT Practice Exam',
    description: 'Comprehensive CBT mock covering Kinematics, Optics, Thermodynamics, and Calculus with authentic JEE Main marking scheme (+4, -1).',
    instructions: '1. Total duration is 60 minutes.\n2. Each question carries 4 marks with a negative marking of 1 mark for incorrect answers in MCQ.\n3. Numerical questions carry 4 marks with 0 negative marking.\n4. You can navigate between sections freely.',
    mode: 'EXAM',
    schemaVersion: '2.0',
    version: 1,
    sections: [
      {
        id: 'sec_physics',
        title: 'Section A: Physics',
        order: 0,
        instructions: 'Answer all physics questions. Numerical questions require numeric answers within specified tolerance.',
        selection: {
          mode: 'STATIC',
          staticQuestionIds: [
            { id: 'phy-kin-001' },
            { id: 'phy-optics-004' },
            { id: 'phy-thermo-008' },
            { id: 'phy-em-passage-009' },
          ],
        },
      },
      {
        id: 'sec_mathematics',
        title: 'Section B: Mathematics',
        order: 1,
        instructions: 'Answer all mathematics problems. Maintain precision.',
        selection: {
          mode: 'STATIC',
          staticQuestionIds: [
            { id: 'math-calc-003' },
            { id: 'math-graph-005' },
            { id: 'math-geom-010' },
          ],
        },
      },
    ],
    timing: {
      mode: 'GLOBAL',
      totalDurationSeconds: 3600, // 60 mins
      allowPause: true,
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
      shuffleQuestions: false,
      shuffleOptions: false,
    },
    feedback: {
      showImmediateSolution: false,
      showHint: false,
      allowCheckAnswer: false,
      showDetailedSolutionsAfterSubmit: true,
    },
    tags: ['jee', 'physics', 'mathematics', 'mock'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },

  {
    id: 'test-cs-drill',
    title: 'Computer Science & Algorithms Rapid Practice',
    description: 'Instant-feedback practice drill covering Algorithms, OS, and Data Structures. Immediate solution checking enabled.',
    instructions: 'Practice mode: you can check your answer immediately after each question, view hints and full step-by-step derivations.',
    mode: 'PRACTICE',
    schemaVersion: '2.0',
    version: 1,
    sections: [
      {
        id: 'sec_cs',
        title: 'Core Computer Science',
        order: 0,
        selection: {
          mode: 'STATIC',
          staticQuestionIds: [
            { id: 'cs-algo-002' },
            { id: 'cs-os-006' },
            { id: 'cs-ds-007' },
          ],
        },
      },
    ],
    timing: {
      mode: 'NONE', // Untimed practice
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
      shuffleQuestions: false,
      shuffleOptions: false,
    },
    feedback: {
      showImmediateSolution: true,
      showHint: true,
      allowCheckAnswer: true,
      showDetailedSolutionsAfterSubmit: true,
    },
    tags: ['cs', 'algorithms', 'os', 'practice'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

/**
 * Initializes the database with seed data if the database is currently empty.
 */
export async function initializeDatabaseSeed(): Promise<void> {
  const count = await db.questions.count();
  if (count === 0) {
    console.log('[takemock] Seeding initial Question Bank and Tests...');
    await db.transaction('rw', [db.questions, db.questionVersions, db.testDefinitions], async () => {
      // 1. Seed questions
      for (const q of SEED_QUESTIONS) {
        await db.questions.put(q);
        await db.questionVersions.put({
          id: `${q.id}_v${q.version || 1}`,
          questionId: q.id,
          version: q.version || 1,
          data: q,
          createdAt: new Date().toISOString(),
        });
      }

      // 2. Seed test definitions
      for (const t of SEED_TESTS) {
        await db.testDefinitions.put(t);
      }
    });
    console.log('[takemock] Seed completed successfully.');
  }
}
