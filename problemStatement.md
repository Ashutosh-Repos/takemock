# Photo-to-CBT Question Reconstruction Engine
## Master Engineering Problem Statement & Real-World Specification

---

# Part I: Foundation & Core Philosophy

## 1. Background & Purpose

The consuming platform is a high-stakes examination and Computer-Based Testing (CBT) system enabling educators, institutions, coaching centers, and candidates to create exam papers, generate mock tests, simulate authentic CBT environments, and evaluate student performance.

In the real world, the vast majority of high-quality educational question material exists in offline, unstructured, physical, or semi-digital formats:
- Standard reference textbooks and question banks (e.g., Made Easy, Ace Academy, Arihant, Disha, MTG, Pearson)
- Previous-Year Question (PYQ) compendiums spanning decades of competitive examinations
- Coaching institute modules, daily practice problem sheets (DPPs), and weekly test papers
- Photocopied test booklets and cyclostyled question sets
- Scanned PDF documents of varying vintage and optical degradation
- Smartphone photographs taken by students and teachers under uncontrolled physical conditions
- Handwritten question sets, solution sheets, and annotated answer keys
- Printed question papers containing handwritten pencil/pen markings, student tick marks, and teacher corrections

Manually transcribing, typesetting, cropping diagrams, converting equations into LaTeX, typing option sets, and linking answer keys into a CBT platform takes hours per test paper and introduces severe human error.

**The mission of this engine is to automate this reconstruction end-to-end.**

The engine ingests raw images or document pages, deciphers their layout, typography, and semantic structure, resolves cross-page and cross-section relationships, extracts visual diagrams and mathematical formulas, associates answers and explanations from corresponding sources, audits for contradictions, and outputs a pristine, validated, machine-readable JSON representation ready for immediate CBT execution.

---

## 2. The Fundamental Problem: Beyond OCR

> **Core Axiom:** This is **not an OCR problem**. It is an **evidence-driven document understanding, structural inference, and topological graph reconstruction problem**.

Traditional Optical Character Recognition (OCR) answers a narrow question:
> *"What characters are visible at physical coordinate $(x, y)$?"*

In competitive exam documents, answering that question alone fails catastrophically:
1. **Layout Trap:** Characters in column 2 get interleaved with column 1, scrambling sentences and options.
2. **Typography Trap:** Superscripts ($2^2$), subscripts ($A_i$), chemical valencies, and fraction bars get flattened into gibberish (`22`, `Ai`).
3. **Boundary Trap:** A question spanning across a page break or column break is severed into two truncated, nonsensical questions.
4. **Visual Oblivion:** Circuit diagrams, geometry figures, code snippets, and graphs are ignored or converted to junk ASCII.
5. **Topological Disconnect:** An answer key table on page 40 (`17. C`) has no physical link to Question 17 on page 12, especially when Question 14 was omitted or misnumbered, causing an off-by-one cascade that ruins the entire test paper.

The true problem statement is:

> **"Given an arbitrary collection of photographed or scanned document pages containing examination questions, answer keys, and worked solutions in either decoupled or integrated arrangements, reliably reconstruct the complete logical sequence of MCQ, MSQ, and NAT questions; recover their hierarchical boundaries, option sets, mathematical and visual content, and question-level metadata; topologically associate each question with its authoritative answer and worked explanation across pages and columns; identify and expose all ambiguities, conflicts, and physical degradations; and produce a verified, CBT-ready structured data artifact without hallucinating missing source content."**

---

## 3. Supported Question Types & Boundaries

The engine restricts automated CBT reconstruction to exactly three universal competitive exam question archetypes:

### 3.1 MCQ (Multiple Choice Question — Single Correct)
- Exactly one option among the candidate set is logically and authoritatively correct.
- Typically contains 4 options (`A, B, C, D` or `1, 2, 3, 4`), but can contain 3, 5, or more in specialized examinations.
- Scoring model: $+M$ for correct, $-W$ penalty for incorrect, $0$ for unattempted.

### 3.2 MSQ (Multiple Select Question — One or More Correct)
- One, two, three, or all candidate options may be correct simultaneously.
- Standard in advanced competitive exams (e.g., GATE, JEE Advanced).
- Crucial structural challenge: An MSQ frequently looks visually identical to an MCQ (both have a statement and four options `(A), (B), (C), (D)`). The engine cannot rely on option count to determine type; it must search for explicit section rules (`[MSQ]`, `"One or more than one option is correct"`), answer key cardinality (`Ans: A, C`), or solution conclusions.
- Scoring model: Full marks if and only if all correct options are selected and no incorrect option is selected; no negative marking in most exams.

### 3.3 NAT (Numerical Answer Type)
- No options provided. Candidate enters a real number or integer directly into a virtual keypad.
- Standard in technical exams (e.g., GATE, JEE Main Section B).
- Requires precise interval/tolerance extraction:
  - Exact integer (e.g., `6`)
  - Floating-point value with tolerance interval (e.g., `12.4` to `12.6`, or `3.75 ± 0.05`)
  - Target Unit Specification (e.g., *"answer in kW"*, *"round off to 2 decimal places"*).
- Scoring model: Marks awarded if the entered number falls within $[V_{\min}, V_{\max}]$; usually no negative marks.

### 3.4 Unsupported Formats & The Rejection Invariant
Any question format outside MCQ, MSQ, or NAT—such as:
- Descriptive / subjective essay questions
- Fill-in-the-blanks requiring arbitrary natural language text strings
- Viva voce or oral questions
- Proof derivations without a terminal numeric or multiple-choice target

**Must NEVER be silently coerced or flattened into an MCQ or NAT.**
The engine must classify them as `UNSUPPORTED_QUESTION_TYPE`, preserve their raw extracted content for manual human review, and prevent them from corrupting the CBT pipeline.

---

## 4. Input Ingestion Modalities

The engine supports two distinct structural ingestion workflows.

```text
┌────────────────────────────────────────────────────────┐
│                   INGESTION MODES                      │
└────────────────────────────────────────────────────────┘
                           │
         ┌─────────────────┴─────────────────┐
         ▼                                   ▼
  [MODE 1: DECOUPLED GROUPS]          [MODE 2: INTEGRATED STREAM]
  questions[]: Pages 1..30            Ordered stream of pages 1..N
  answers[]:   Pages 31..33           where Questions, Answers, and
  solutions[]: Pages 34..75           Solutions occur organically
         │                                   │
         └─────────────────┬─────────────────┘
                           ▼
          [TOPOLOGICAL GRAPH RECONSTRUCTION]
                           ▼
          [CANONICAL CBT QUESTION ARTIFACT]
```

### 4.1 Mode 1 — Decoupled Content Groups
The caller provides three separate arrays of images:
```text
questions: ImagePage[]  // Pages containing question statements and options
answers:   ImagePage[]  // Pages containing answer key grids, tables, or lists
solutions: ImagePage[]  // Pages containing step-by-step worked solutions
```
- Page counts across groups are entirely asymmetric (e.g., 30 pages of questions, 2 pages of answer tables, 45 pages of detailed solutions).
- The groups may be photographed by different cameras, at different orientations, or at different times.
- The engine must reconstruct a global bipartite/tripartite matching graph across the three decoupled sets.

### 4.2 Mode 2 — Integrated Content Stream
The caller provides a single ordered collection of pages where questions, answers, and solutions appear in chronological publication layout:
- Pattern A: Question $\rightarrow$ Answer $\rightarrow$ Solution (immediate sequence)
- Pattern B: Question $\rightarrow$ Long multi-page worked solution $\rightarrow$ Next question
- Pattern C: Questions on Left Column $\rightarrow$ Hints/Solutions on Right Column
- Pattern D: Batch of 10 questions $\rightarrow$ Batch of 10 answers/solutions $\rightarrow$ Next section
- Pattern E: Questions on front of page $\rightarrow$ Solutions on reverse of page

### 4.3 Unified Invariant Target
Both modes are purely physical transmission variations. The internal representation and final CBT export schema are **strictly identical**:
```text
CBTQuestion
├── Stable Engine UUID
├── Source Context & Numbering (Set, Section, Sub-section, Q#)
├── Classification (MCQ | MSQ | NAT)
├── Stimulus / Parent Passage (if shared / linked)
├── Statement (Rich Blocks: Text, LaTeX Math, Visual Assets)
├── Options[] (for MCQ/MSQ: ID, Rich Content Blocks)
├── Canonical Answer (Option IDs or Numerical Tolerance Range [Min, Max])
├── Target Unit & Decimal Precision (for NAT)
├── Worked Explanation / Solution (Rich Blocks)
├── Visual Assets (Normalized Bounding Boxes, Source Crops, Captions)
├── Source Provenance (Page indices, physical bounding regions)
├── Component-Level Confidence Scores
└── Audit & Review Issues List
```

---

## 5. Non-Goals & System Boundaries

To maintain rigorous architectural focus and deterministic reliability, the engine explicitly excludes the following concerns:
1. **CBT Frontend UI Execution:** The engine does not render candidate test timers, virtual calculators, or student response interfaces. It outputs the authoritative data contract that powers those UIs.
2. **Candidate Auth & Proctoring:** User authentication, camera proctoring, lockdown browsers, and cheating detection are downstream platform responsibilities.
3. **Arbitrary Handwriting Transcription at Zero Contrast:** The engine does not guarantee recovery of illegible pencil scribbles or fully faded, water-damaged manuscripts.
4. **Autonomous Guesswork of Missing Evidence:** If an answer key page is omitted by the user, the engine **must not** generate an unverified answer and label it as source fact. Any model-derived reasoning must be explicitly flagged with `origin: "GENERATED"`.
5. **Universal Book Layout Hardcoding:** The engine must contain zero hardcoded assumptions about specific publishers (e.g., no `"if publisher == MadeEasy then column_width = 320px"`).

---

# Part II: Physical & Visual Acquisition Complexities ("The Wild Input Reality")

When documents are captured in the wild via smartphones or budget flatbed scanners, physical distortions break standard layout engines. The engine must actively detect, model, and mitigate the following physical pathologies:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   PHYSICAL ACQUISITION PATHOLOGY                       │
├────────────────────────────┬───────────────────────────────────────────┤
│ Distortion Type            │ Concrete Manifestation & Failure Mode     │
├────────────────────────────┼───────────────────────────────────────────┤
│ Two-Page Spread Capture    │ Single photo contains Left & Right page;  │
│                            │ gutter curvature at center severs text.   │
├────────────────────────────┼───────────────────────────────────────────┤
│ Keystoning & Non-Planar    │ Perspective trapezoid; text lines curve;  │
│ Paper Warping              │ bounding boxes become non-orthogonal.     │
├────────────────────────────┼───────────────────────────────────────────┤
│ Bleed-Through / Ghosting   │ Thin low-GSM paper shows ink from reverse │
│                            │ page; vision models hallucinate ghost Qs. │
├────────────────────────────┼───────────────────────────────────────────┤
│ Harsh Scan App Filters     │ Faint fraction bars, minus signs, and     │
│ (CamScanner Artifacts)     │ square root tails are whited out.         │
├────────────────────────────┼───────────────────────────────────────────┤
│ Peripheral Occlusions      │ User thumbs, pens, or paper clips cover   │
│                            │ question numbers or option letters.       │
├────────────────────────────┼───────────────────────────────────────────┤
│ Watermarks & Stamps        │ Heavy diagonal coaching branding stamps   │
│                            │ crosscut math equations and diagrams.     │
├────────────────────────────┼───────────────────────────────────────────┤
│ Chroming / Header Bleed    │ Running headers and footers get merged    │
│                            │ into question text or option bodies.      │
└────────────────────────────┴───────────────────────────────────────────┘
```

### 6. Two-Page Book Spreads & Gutter Curvature
Users frequently photograph open books, capturing both the Left page (even) and Right page (odd) in a single image.
- **The Spine / Gutter Problem:** The center binding creates a dark, curved shadow where text lines compress non-linearly into the spine.
- **Reading Order Hazard:** Naive reading order will read line 1 of Page Left, jump across the gutter to line 1 of Page Right, creating gibberish text.
- **Engine Requirement:** Automatic detection of dual-page spreads, identification of the central gutter boundary, non-linear cylindrical dewarping along the spine curve, and splitting into two discrete logical page canvases with correct page numbering.

### 7. Keystoning, Orientation & Perspective Distortion
- Mobile photos are taken at oblique angles, causing trapezoidal distortion (keystoning).
- Pages may arrive rotated $90^\circ, 180^\circ,$ or $270^\circ$, or tilted at arbitrary skew angles (e.g., $4.7^\circ$).
- **Engine Requirement:** Pre-flight orientation detection via text line angles and orientation classifiers, four-corner quad detection of the document page boundary, homographic perspective rectification, and automated deskewing prior to structural analysis.

### 8. Bleed-Through, Ghosting & Low-GSM Paper
Indian and Asian competitive exam practice books are notoriously printed on thin, low-cost paper (45–60 GSM).
- Text, circuit diagrams, and answer tables printed on the reverse side of the sheet bleed through and are visible in photographs.
- Standard OCR and multimodal vision models often transcribe this "ghost text", inventing phantom equations or options that do not belong to the current page.
- **Engine Requirement:** Multi-scale background contrast normalization, high-frequency text-edge separation, and semantic validation that rejects low-contrast, inverted, or out-of-focus background text.

### 9. CamScanner & Harsh Binarization Artifacts
Many users run mobile scanning apps (CamScanner, Adobe Scan) with "Magic Color" or harsh thresholding enabled.
- **The Lost Minus Sign / Faint Stroke Catastrophe:** Crucial mathematical strokes—such as minus signs ($-$), fraction bars ($\frac{a}{b}$), decimal points ($0.5 \rightarrow 05$), square root overbars ($\sqrt{x}$), vector arrows ($\vec{v}$), and prime symbols ($f'(x)$)—are faint and get completely erased by aggressive thresholding.
- **Engine Requirement:** Dual-stream processing: retain original color/grayscale image for feature inspection and visual verification, avoiding irreversible pure binary thresholding.

### 10. Peripheral Occlusions (Fingers, Pens, Paperclips)
Users hold curved pages flat with their thumbs or place pens/rulers across pages.
- A thumb occluding the margin can hide the option label `(C)` or question number `24.`, turning a 4-option MCQ into a 3-option fragment or merging Q24 into Q23.
- **Engine Requirement:** Detection of foreign occlusions (skin tone masks, geometric object boundaries) near page margins; generation of an explicit `OCCLUSION_DETECTED` warning when text lines terminate abruptly at an occlusion boundary.

### 11. Watermarks, Rubber Stamps & Institute Branding
Coaching institutes and test paper pirates heavily stamp study materials with diagonal watermarks (e.g., *"ALLEN CAREER INSTITUTE"*, *"MADE EASY CS 2024"*, *"CONFIDENTIAL"*, phone numbers, Telegram channel handles) directly over printed questions.
- Naive OCR transcribes the watermark words right into the middle of a math equation or sentence.
- **Engine Requirement:** Frequency-based and color-plane watermark decoupling; recognition of recurring global text watermarks across pages to prevent their injection into question content.

### 12. Running Headers, Section Banners, Footers & Promotional Chaff
Document pages are bordered by non-question content:
- Running headers: `Chapter 2: Relational Database Management Systems | 45`
- Running footers: `GATE Wallah Topic-Wise PYQs | www.physicswallah.live`
- Section banners: `SECTION - B : TECHNICAL COMPREHENSION`
- Promotional chaff: `Scan QR code for Video Solution`, `Download App for Detailed Analysis`
- **Engine Requirement:** Semantic classification of page layout zones. Header, footer, and promotional regions must be detected and stripped from question bodies while harvesting metadata (e.g., Chapter name, Subject, Marks).

---

# Part III: Document Geometry & Structural Parsing

## 13. Multi-Column Geometry & Variable Splits

Most exam books utilize multi-column layouts to maximize printed density. However, layouts are rarely uniform:
```text
┌────────────────────────────────────────────────────────┐
│ [Header] CHAPTER 4: THEORY OF COMPUTATION              │
├────────────────────────────────────────────────────────┤
│ [Single Column Banner] Common Data for Questions 1-3   │
│ In a DFA with alphabet {0, 1}, the transition table... │
├──────────────────────────┬─────────────────────────────┤
│ Column 1 (Width: 48%)    │ Column 2 (Width: 48%)       │
│ Q1. Which state is...    │ Q2. If the initial state... │
│ (A) q0         (B) q1    │ (A) L1         (B) L2       │
│ (C) q2         (D) q3    │ (C) L3         (D) L4       │
│                          │                             │
│ Q3. The minimal DFA has: │ [Wide Diagram spanning both]│
│ (A) 3 states             │        ┌───────────┐        │
│ (B) 4 states             │        │  FIGURE 1 │        │
│ (C) 5 states             │        └───────────┘        │
├──────────────────────────┴─────────────────────────────┤
│ [Footer] Page 84 | Ace Engineering Publications        │
└────────────────────────────────────────────────────────┘
```
- **Asymmetric & Dynamic Columns:** Page top may be single-column (passage), middle may be 2-column, bottom may feature a 3-column option table.
- **Spanning Elements:** Diagrams, wide equations, or tables frequently span across both columns.
- **Engine Requirement:** The engine must construct a topological layout graph using whitespace Voronoi / Delaunay tessellation and projection profiles, detecting column separator rules and bounding spanning elements before serializing reading order.

---

## 14. Logical Reading-Order Traversal

Reading order is defined by semantic flow, not physical $Y$-coordinates.
- In a two-column page, reading top-to-bottom across the whole page ($Y_1 \rightarrow Y_2$) interleaves Column 1 with Column 2:
  $$\text{Incorrect: } \text{Col1\_Line1} \rightarrow \text{Col2\_Line1} \rightarrow \text{Col1\_Line2} \rightarrow \text{Col2\_Line2}$$
- **Engine Requirement:** Strict column-first traversal: exhaust Column 1's vertical stream until a column break or spanning anchor, then traverse Column 2, respecting cross-column spanning blocks.

---

## 15. Cross-Page & Cross-Column Continuations

A single question may begin near the bottom of Column 1, continue onto the top of Column 2, or start at the bottom of Page 15 and terminate on Page 16.
Continuations can sever:
1. **The Question Statement:** Sentence cuts off mid-phrase (`"... then the value of the"`) $\rightarrow$ continues on next page (`"integral is equal to:"`).
2. **The Option Set:** Statement and Options (A) and (B) appear on Page 20; Options (C) and (D) appear on Page 21.
3. **The Worked Solution:** Multi-step mathematical proof spans across 3 successive pages.
4. **A Large Table or Diagram:** A table split horizontally across a page break.

```text
PAGE 20 (Bottom of Col 2)             PAGE 21 (Top of Col 1)
┌───────────────────────────────┐     ┌───────────────────────────────┐
│ Q42. A balanced 3-phase star- │     │ (C) 415 V                     │
│ connected load takes 10 kW at │     │ (D) 230 V                     │
│ 0.8 power factor lagging. The │     │                               │
│ line voltage is:              │     │ Q43. In a synchronous machine,│
│ (A) 400 V                     │     │ the armature reaction is...   │
│ (B) 440 V                     │     │                               │
└───────────────────────────────┘     └───────────────────────────────┘
```

- **Heuristic Rule Failure:** If the engine treats every page break as a question boundary, Q42 becomes an invalid 2-option question on Page 20, and `(C)` & `(D)` on Page 21 become orphan text or get erroneously prepended to Q43.
- **Engine Requirement:** The engine must maintain an active **Syntactic & Structural Continuation Detector**:
  - Incomplete terminal punctuation (no period, question mark, or colon at bottom of page).
  - Unbalanced brackets, open matrices, or unfinished LaTeX blocks (`\begin{matrix}` without `\end{matrix}`).
  - Missing option cardinality (options `A, B` seen, waiting for `C, D`).
  - Next page beginning with orphan option tags (`(C)`) or lowercase continuation sentences before any new question number appears.

---

# Part IV: Question Taxonomy & Semantic Structure

## 16. Hierarchical Context & Non-Unique Numbering

Question numbers in competitive exam books are **never globally unique**.
A single test book or PDF compendium frequently contains:
```text
Set A: Q1 to Q65
Set B: Q1 to Q65
Chapter 1 (Data Structures): Q1 to Q30
Chapter 2 (Algorithms):      Q1 to Q45
Section I (General Aptitude): Q1 to Q10
Section II (Core Computer Science): Q1 to Q55
```
Furthermore, many questions have sub-part numbering: `1(a), 1(b), 2(i), 2(ii)`.

- **Engine Requirement:** The engine must construct a 4-tier hierarchical coordinate for every question:
  $$\text{Coordinate} = \langle \text{DocumentUUID}, \text{Set/PaperID}, \text{Section/ChapterID}, \text{LocalNumberString} \rangle$$
  The engine must preserve the printed number string (`"14(b)"` or `"Q. 17"`) for human display, while assigning a deterministic, globally unique UUID (`urn:uuid:...`) for internal CBT data binding.

---

## 17. Option Geometry & Layout Variations

Options are not always arranged as four clean, vertical, full-width blocks. Real exam layouts adopt diverse spatial arrangements to conserve paper:

```text
[Type 1: Vertical Stack]        [Type 2: Inline Horizontal]
(A) Linear                      (A) 2.5    (B) 5.0    (C) 7.5    (D) 10.0
(B) Logarithmic
(C) Quadratic                   [Type 3: 2x2 Matrix Grid]
(D) Exponential                 (A) P-1, Q-2        (B) P-3, Q-4
                                (C) P-4, Q-1        (D) P-2, Q-3
```

- **Inline Horizontal Collision:** In Type 2, all 4 options exist on a single line separated by whitespace. Naive regex or line-based parsers extract the entire line as Option (A).
- **Label Variations:** Options may be labeled as `(A), (B), (C), (D)`, `(a), (b), (c), (d)`, `(1), (2), (3), (4)`, `[A], [B], [C], [D]`, or `(i), (ii), (iii), (iv)`.
- **Engine Requirement:** Spatial horizontal bounding-box clustering to dissect inline and 2x2 option grids into independent, isolated option objects with normalized option keys (`A`, `B`, `C`, `D`).

---

## 18. Parent-Child, Common Data & Linked Questions

In advanced exams (GATE, JEE, GRE, MCAT), questions frequently depend on a shared stimulus:
```text
┌────────────────────────────────────────────────────────┐
│ Statement for Linked Answer Questions 52 and 53:       │
│ A 4-pole, 50 Hz, 3-phase induction motor has a rotor   │
│ resistance of 0.04 Ω and standstill reactance of 0.2 Ω.│
├────────────────────────────────────────────────────────┤
│ 52. The slip at maximum torque is:                     │
│ (A) 0.1          (B) 0.2          (C) 0.3      (D) 0.4 │
├────────────────────────────────────────────────────────┤
│ 53. The starting torque as a percentage of maximum     │
│ torque is:                                             │
│ (A) 25%          (B) 38.4%        (C) 50%      (D) 72% │
└────────────────────────────────────────────────────────┘
```
- **The CBT Delivery Reality:** In a CBT system, Question 52 and Question 53 must either:
  1. Both display the common stimulus passage in their viewer, or
  2. Be bundled under a parent `StimulusBlock` so the CBT engine presents them in a split-screen or grouped layout.
- **Dependent Solution Association:** If the solution for Q53 begins with: *"Using the slip calculated in Q52 ($s = 0.2$)..."*, the engine must understand that Q53's solution semantically references Q52.
- **Engine Requirement:** Support for first-class `ParentStimulus` blocks in the schema, with child questions maintaining explicit foreign keys (`stimulusId`) to their common stimulus.

---

## 19. Complex Statement Structures (Matching, Assertion, Sub-Statements)

Many questions test multi-variable reasoning through composite structures:

### 19.1 Match the Following (List-I / List-II)
Contains two parallel columns of entities and options that express permutations:
$$\text{List-I: } [P, Q, R, S] \quad \longleftrightarrow \quad \text{List-II: } [1, 2, 3, 4]$$
$$\text{Options: } (A)\ P-2, Q-3, R-1, S-4 \quad (B)\ P-3, Q-2, R-4, S-1 \dots$$
- **Engine Requirement:** Tabular structure preservation in the question statement so that List-I and List-II render side-by-side in CBT, rather than collapsing into an illegible run-on string.

### 19.2 Assertion & Reason / Multiple True Statements
```text
Consider the following statements:
I. Every regular language is context-free.
II. The intersection of two context-free languages is always context-free.
III. Halting problem of Turing machine is decidable.
Which of the statements given above is/are correct?
(A) I only       (B) I and II       (C) II and III       (D) I, II and III
```
- **Engine Requirement:** Parsing sub-statements ($I, II, III$ or $P, Q, R$) as structured items within the question statement, distinguishing them from the outer options $(A), (B), (C), (D)$.

---

## 20. NAT (Numerical Answer Type) Precision Engineering

NAT questions are uniquely vulnerable to grading bugs if extraction is superficial. A CBT system requires exact numerical validation rules:

```text
┌────────────────────────────────────────────────────────┐
│                   NAT DATA PROFILE                     │
├────────────────────┬───────────────────────────────────┤
│ Numeric Target     │ Value or Interval: [Vmin, Vmax]   │
├────────────────────┼───────────────────────────────────┤
│ Integer Constraint │ boolean (true if answer is integer│
├────────────────────┼───────────────────────────────────┤
│ Target Unit        │ String (e.g., "kW", "m/s", "%")   │
├────────────────────┼───────────────────────────────────┤
│ Decimal Precision  │ Integer (e.g., 2 decimal places)  │
└────────────────────┴───────────────────────────────────┘
```

1. **Tolerance Intervals vs Exact Values:**
   - Textbooks often express NAT answers as intervals: `12.4 to 12.6`, `[6.0, 6.0]`, `3.14 ± 0.02`.
   - Reason: Compensating for candidates using $\pi = 3.14$ vs $\pi = \frac{22}{7}$ or $g = 9.8$ vs $9.81$.
   - The engine must parse these into `minValue: 12.4` and `maxValue: 12.6`.
2. **The Target Unit Trap:**
   - Question: *"The power consumed by the heater is _______ kW."*
   - Solution calculates: $P = 4500\text{ W} = 4.5\text{ kW}$.
   - If the candidate types `4500` into the CBT box, they are marked wrong because the prompt specified `kW`.
   - **Engine Requirement:** Explicit extraction of `targetUnit: "kW"` and verification that the answer key reflects the requested unit.
3. **Rounding Directives:**
   - Extraction of precision constraints: `"round off to two decimal places"`, `"answer in integer"`.

---

## 21. Bilingual & Dual-Language Document Disambiguation

In official state and central examinations (e.g., UPSC, SSC, state PSCs, JEE/NEET bilingual booklets), papers are printed concurrently in two languages (e.g., English and Hindi).

```text
┌────────────────────────────────────────────────────────┐
│ Column 1 (English)         │ Column 2 (Hindi)          │
│ 15. The SI unit of electric│ 15. विद्युत आवेश का SI    │
│ charge is:                 │ मात्रक है:                │
│ (A) Ampere                 │ (A) एम्पीयर               │
│ (B) Coulomb                │ (B) कूलॉम                 │
│ (C) Volt                   │ (C) वोल्ट                 │
│ (D) Ohm                    │ (D) ओम                    │
└──────────────────────────┴─────────────────────────────┘
```

- **The Duplication Hazard:** A naive engine interprets this as Question 15 and Question 16, or duplicates Question 15 twice with different IDs, creating a 200-question exam from a 100-question paper and scrambling answer associations.
- **Engine Requirement:**
  - Detection of dual-language parallel streams using multilingual NLP classifiers.
  - Linking both language representations into a single `CBTQuestion` with `localizedContent: { en: {...}, hi: {...} }`, allowing candidate language toggle in the CBT interface.

---

## 22. Exam Metadata & Marking Scheme Extraction

Question headers often carry critical metadata tags:
- `[GATE-2022 : 2 Marks]` $\rightarrow$ `exam: "GATE"`, `year: 2022`, `marks: 2.0`, `negativeMarks: 0.66`
- `[JEE Advanced 2021 Paper-1 : +4, -2]` $\rightarrow$ `marks: 4.0`, `negativeMarks: 2.0`
- `[Topic: DBMS, Normalization]` $\rightarrow$ `subject: "DBMS"`, `topic: "Normalization"`
- **Engine Requirement:** Structured entity extraction from header tags, populating scoring parameters directly into the question model.

---

# Part V: Mathematical, Chemical & Visual Representation

## 23. High-Fidelity Mathematical Notation

Competitive exams in Engineering, Physics, and Mathematics rely heavily on mathematical typography. Lossy plain text is unacceptable:
- Plain text: `integral from 0 to inf of x^2 e^-x dx = 2`
- Engine LaTeX: `\int_{0}^{\infty} x^2 e^{-x} \, dx = 2`

```text
┌────────────────────────────────────────────────────────┐
│               MATHEMATICAL RECONSTRUCTION              │
├────────────────────┬───────────────────────────────────┤
│ Domain             │ LaTeX / KaTeX Representation      │
├────────────────────┼───────────────────────────────────┤
│ Linear Algebra     │ \begin{bmatrix} a & b \\ c & d    │
│                    │ \end{bmatrix}^{-1}                │
├────────────────────┼───────────────────────────────────┤
│ Calculus           │ \lim_{x \to 0} \frac{\sin x}{x}=1 │
├────────────────────┼───────────────────────────────────┤
│ Set & Logic        │ \forall x \in \mathbb{R},\;       │
│                    │ \exists y \text{ s.t. } y > x     │
├────────────────────┼───────────────────────────────────┤
│ Physics Formulations│ \oint \vec{B} \cdot d\vec{A} = 0 │
└────────────────────┴───────────────────────────────────┘
```

- **KaTeX / MathJax Compatibility:** All mathematical expressions must compile cleanly under standard web MathJax/KaTeX renderers without non-standard packages.
- **Inline vs Display Math:** Distinguish between inline math (`$...$`) embedded within sentences and block/display equations (`$$...$$`).
- **Visual Fallback Snapping:** If mathematical recognition confidence falls below threshold (e.g., highly complex multi-line tensor derivations or handwritten scribbles), the engine must automatically generate an image crop fallback for that equation block, ensuring zero unreadable LaTeX reaches the student.

---

## 24. Chemical Formulas, Reactions & Organic Structures

Chemistry exams (NEET, JEE) present unique challenges:
1. **Inorganic Reactions & Equilibrium:**
   $$\text{N}_2\text{(g)} + 3\text{H}_2\text{(g)} \rightleftharpoons 2\text{NH}_3\text{(g)}, \quad \Delta H = -92.4\text{ kJ/mol}$$
   Must preserve stoichiometric coefficients, state symbols, reversible equilibrium arrows ($\rightleftharpoons$), and charges ($\text{SO}_4^{2-}$).
2. **Organic Skeletal Structures:**
   Benzene rings, stereochemical wedge-and-dash bonds, chair conformations, and arrow-pushing mechanisms cannot be represented reliably in plain LaTeX.
   - **Engine Requirement:** Treat organic chemical structures as first-class visual diagram assets.

---

## 25. Code Snippets & Monospace Algorithmic Blocks

Computer Science exams (GATE CS, coding tests) feature source code:
```c
int fun(int n) {
    int count = 0;
    for (int i = n; i > 0; i /= 2)
        for (int j = 0; j < i; j++)
            count++;
    return count;
}
```
- **The Formatting Hazard:** Standard OCR strips whitespace indentation and turns `int` into `mt` or `<` into `c`.
- **Engine Requirement:** Detection of code blocks, preservation of exact indentation and monospace whitespace, and outputting as structured `{ type: "code", language: "c", code: "..." }` blocks.

---

## 26. Visual Content as First-Class Question Data

Diagrams are not supplementary illustrations; in many questions, the diagram **is the question**:
- Electrical circuit schematics (resistors, inductors, op-amps)
- Mechanical free-body diagrams and Mohr's circles
- Coordinate geometry, conic sections, and vector spaces
- Venn diagrams, state transition graphs, and flowchart algorithms
- Spatial reasoning: Mirror images, water images, paper folding, embedded figures

```text
┌────────────────────────────────────────────────────────┐
│                   VISUAL ASSET LIFECYCLE               │
└────────────────────────────────────────────────────────┘
                           │
       1. Identify Diagram Region & Caption in Page
                           │
       2. Decouple Caption Text ("Fig 4.2: Circuit...")
                           │
       3. Extract High-Resolution Crop at Source DPI
                           │
       4. Normalize Bounding Box Coordinates [ymin, xmin, ymax, xmax]
                           │
       5. Store Asset with Global UUID (e.g., asset_9a7b2c...)
                           │
       6. Embed Asset Reference in Question/Option/Solution Schema
```

- **Option-Level Visual Assets:** When options are themselves figures (Option A = Diagram 1, Option B = Diagram 2), the engine must segment and attach the individual image assets directly to the respective `Option` objects.
- **Shared Visual Assets:** When a single diagram governs Questions 10, 11, and 12, the engine must extract the asset once, assign a stable `assetId`, and reference it across all three questions.
- **Asset Crop Quality:** Crops must be taken from the raw high-resolution source image (e.g., 4096x2304), **not** downscaled neural-model inputs, ensuring crisp readability on retina CBT displays.

---

# Part VI: Answer & Solution Intelligence

## 27. Answer Key Topologies & Multi-Answer Formats

Answer keys in competitive exam books occur in widely disparate formats across publishers:

```text
[Format 1: Dense Columnar Grid]
Q.No  Ans  | Q.No  Ans  | Q.No  Ans
 1     B   |  11    D   |  21   3.14
 2    A,C  |  12    A   |  22   42 to 45

[Format 2: Dense Sequential String]
1. (c)  2. (a)  3. (b,d)  4. (a)  5. (6 to 6)  6. (d)  7. (b)

[Format 3: Matrix Match Key]
17. A-p,s; B-q,r; C-p; D-q,s
```

- **Engine Requirement:** Unified parsing engine capable of normalizing all key topologies into standardized structured target answers:
  - MCQ: `["B"]`
  - MSQ: `["A", "C"]`
  - NAT: `{ "minValue": 42.0, "maxValue": 45.0, "displayString": "42 to 45" }`
  - Matrix: `{ "A": ["p", "s"], "B": ["q", "r"], ... }`

---

## 28. Official Key Anomalies & Errata (Bonus, Dropped, MTA)

In real competitive exams, questions frequently contain typographical errors or ambiguities, leading the official examining body to issue modified keys:
- `MTA` or `Bonus`: Marks to All (question had invalid options or missing data).
- `Dropped` / `Cancelled`: Question excluded from scoring.
- `A or C`: Two distinct options accepted as correct.
- `6.0 to 6.2 OR 18.0 to 18.2`: Dual acceptable numeric ranges due to interpretation ambiguity.
- **Engine Requirement:** The engine must support `specialResolutionStatus: "BONUS" | "CANCELLED" | "MULTI_ACCEPTED"` so that the CBT scoring engine grades candidates correctly.

---

## 29. Solution & Explanation Extraction

Solutions are structurally distinct from questions:
- They contain long, multi-page derivations, mathematical proofs, alternative solving methods (`Method 1`, `Method 2`), and explanatory diagrams.
- Often conclude with explicit answer confirmation sentences:
  > *"Hence, option (B) is the correct choice."*
  > *"From equation (4), $V = 12.5\text{ V}$. Thus the correct answer is 12.5."*
- **Engine Requirement:** Group the complete explanation block, preserve internal worked diagrams and derivations, and verify that the conclusion matches the recorded answer key.

---

## 30. The "Off-by-One Key Shift" Catastrophe & Topological Alignment

This is the **single most dangerous failure mode** in document intelligence for exam reconstruction.

### 30.1 The Disaster Scenario
Suppose a question booklet contains 50 questions. Question 14 is printed across a messy page fold and fails to be detected by the question parser.
- Extracted questions: $[Q_1, Q_2, \dots, Q_{13}, Q_{15}, \dots, Q_{50}]$ (Total: 49 questions).
- Extracted answer key table: 50 answers $[A_1, A_2, \dots, A_{50}]$.
- **The Naive Index-Alignment Failure:** If the engine simply aligns the $i$-th extracted question with the $i$-th answer key row:
  - $Q_1 \dots Q_{13}$ get correct answers $A_1 \dots A_{13}$.
  - $Q_{15}$ gets answer $A_{14}$!
  - $Q_{16}$ gets answer $A_{15}$!
  - **Every single subsequent question ($Q_{15} \dots Q_{50}$) is assigned the wrong answer.**
  - The CBT mock test is ruined, grading students incorrectly on 36 questions without raising a single runtime exception.

```text
┌────────────────────────────────────────────────────────┐
│           THE OFF-BY-ONE CASCADE CATASTROPHE           │
└────────────────────────────────────────────────────────┘
  Question Stream:  [Q12] [Q13] ──X [Q14 MISSED] X── [Q15] [Q16] ...
                      │     │                           │     │
  Naive Shift:        ▼     ▼                           ▼     ▼
  Answer Key Stream:[A12] [A13] ────────────────────> [A14] [A15] ...
                                                      WRONG! WRONG!
```

### 30.2 The Topological Invariant Check
The engine must strictly enforce **Topological Anchor Matching**:
1. **Explicit Label Matching:** An answer from key row labeled `"15"` must **only** bind to a question with source number `"15"`. Positional array indexing is strictly prohibited.
2. **Cardinality & Domain Validation:**
   - If Question 15 has 4 options `(A, B, C, D)` and Answer Key 15 says `"E"`, raise a fatal mismatch.
   - If Question 15 is identified as NAT (no options) and Answer Key 15 says `"B"`, raise a question-type mismatch.
   - If Question 15 is an MCQ and Answer Key 15 says `"A, C"`, re-evaluate whether Q15 is an MSQ or if a key mismatch occurred.
3. **Sequence Gap Detection:**
   - If the extracted question sequence jumps from $Q_{13}$ to $Q_{15}$, the engine must flag a `SEQUENCE_GAP_DETECTED` warning, mark $Q_{14}$ as missing, and ensure $A_{14}$ is parked in an unassigned pool rather than sliding into $Q_{15}$.

---

## 31. Intra-Source Contradictions (Answer Key vs Solution)

In real textbooks and coaching papers, typographical errata are common:
- Answer Key table on page 50 says: **Q28 $\rightarrow$ A**
- Worked Solution on page 62 concludes: *"Therefore, the correct option is (C)."*
- **Engine Requirement:** The engine must cross-check the Answer Key entry against the terminal conclusion of the Worked Solution. If they disagree:
  - Set question status to `REVIEW_REQUIRED`.
  - Log an explicit `DISCREPANCY_DETECTED: KEY_VS_SOLUTION_MISMATCH`.
  - Preserve both pieces of evidence in the output JSON for human adjudication.

---

## 32. Zero-Hallucination & Provenance Invariants

1. **Missing Remains Missing:** If an answer key or solution is missing from the source document, the engine **must never** invent an answer or hallucinate an explanation. The field must be populated as `null`, with `resolutionStatus: "UNRESOLVED_IN_SOURCE"`.
2. **Explicit Origin Flagging:** If a future auxiliary engine module executes an automated solver or LLM generator to supply a missing answer or explanation, it must be branded with:
   ```json
   "origin": "GENERATED"
   ```
   as opposed to:
   ```json
   "origin": "SOURCE"
   ```
3. **Bounding-Box Provenance:** Every statement, option, answer, and diagram must carry its exact physical source provenance: `{ pageIndex: 12, boundingBox: [ymin, xmin, ymax, xmax] }`.

---

# Part VII: Handwriting, Annotations & Conflicting Evidence

## 33. Handwritten Annotations & Role Ambiguity

Test papers photographed by students frequently contain handwritten markings:
- Checkmarks ($\checkmark$) or crosses ($\times$) beside option letters
- Underlined phrases in question statements
- Handwritten answers in margins: `Q17 -> B`
- Crossed-out printed answers with handwritten corrections: printed `(A)` crossed out, handwritten `(C)` written in pen.

```text
┌────────────────────────────────────────────────────────┐
│             HANDWRITING SEMANTIC AMBIGUITY             │
└────────────────────────────────────────────────────────┘
                           │
                 [Handwritten Checkmark ✓]
                           │
       ┌───────────────────┼───────────────────┐
       ▼                   ▼                   ▼
[Student's Attempt]  [Official Key]   [Teacher Correction]
  (Often Incorrect!)   (Authoritative)  (Authoritative)
```

- **The Student Scribble Trap:** If an engine naively interprets a student's pencil checkmark next to Option (B) as the authoritative answer, it will bake a student's mistake into the CBT answer key!
- **Engine Requirement:**
  - Classify handwriting by modality: distinguish between a fully handwritten manuscript (where handwriting is authoritative) and printed papers with marginal annotations.
  - In printed papers, handwritten markings must be treated as low-confidence secondary evidence, subordinate to the printed answer key table.
  - If a handwritten correction directly contradicts a printed key, trigger `REVIEW_REQUIRED` with `HANDWRITTEN_CONFLICT`.

---

# Part VIII: Confidence, Ambiguity & Review Taxonomy

## 34. The Principle of Preserved Uncertainty

> **Guiding Principle:** An automated engine that produces 100 questions with 5 silent, confident errors is a failure. An engine that produces 95 verified questions and flags the remaining 5 with precise, pinpointed review warnings is a **production success**.

Uncertainty must never be hidden. The engine must expose granular, component-level confidence scores rather than a single coarse document-level percentage.

---

## 35. Component-Level Confidence Scoring

Every question must report independent confidence metrics across its structural sub-components:

```text
┌────────────────────────────────────────────────────────┐
│              COMPONENT-LEVEL CONFIDENCE                │
├────────────────────┬───────────┬───────────────────────┤
│ Component          │ Score     │ Assessment Criteria   │
├────────────────────┼───────────┼───────────────────────┤
│ Statement          │ 0.98 HIGH │ Clean text, no broken │
│                    │           │ math, valid syntax.   │
├────────────────────┼───────────┼───────────────────────┤
│ Options            │ 0.95 HIGH │ Expected count (4/4), │
│                    │           │ clean bounds, labels. │
├────────────────────┼───────────┼───────────────────────┤
│ Answer Key         │ 0.40 LOW  │ Key number smudged;   │
│                    │           │ conflict with sol.    │
├────────────────────┼───────────┼───────────────────────┤
│ Solution           │ 0.92 HIGH │ Clean multi-step text.│
├────────────────────┼───────────┼───────────────────────┤
│ Visual Assets      │ 0.99 HIGH │ Sharp diagram crop,   │
│                    │           │ no occlusions.        │
├────────────────────┼───────────┼───────────────────────┤
│ OVERALL STATUS     │ REVIEW_REQUIRED (Answer Flagged)  │
└────────────────────┴───────────────────────────────────┘
```

This allows the consuming CBT application to present a human reviewer with a targeted workflow: *"Jump directly to Question 17's answer key verification"*, rather than forcing a manual review of all 100 questions.

---

## 36. Standardized Review Issue & Failure Taxonomy

All anomalies must be categorized under standardized machine-readable issue codes:

```typescript
type IssueSeverity = "FATAL" | "REVIEW_REQUIRED" | "WARNING" | "INFO";

enum IssueCode {
  // Page & Layout Issues
  PAGE_SEQUENCE_GAP = "PAGE_SEQUENCE_GAP",
  SPREAD_SPLIT_UNCERTAIN = "SPREAD_SPLIT_UNCERTAIN",
  OCCLUSION_NEAR_BOUNDARY = "OCCLUSION_NEAR_BOUNDARY",
  GHOST_TEXT_SUSPECTED = "GHOST_TEXT_SUSPECTED",
  
  // Question Boundary & Type Issues
  QUESTION_BOUNDARY_AMBIGUOUS = "QUESTION_BOUNDARY_AMBIGUOUS",
  UNSUPPORTED_QUESTION_TYPE = "UNSUPPORTED_QUESTION_TYPE",
  TYPE_CLASSIFICATION_UNCERTAIN = "TYPE_CLASSIFICATION_UNCERTAIN",
  TRUNCATED_CONTINUATION = "TRUNCATED_CONTINUATION",
  
  // Option Set Issues
  OPTION_COUNT_ANOMALY = "OPTION_COUNT_ANOMALY",          // e.g. only 3 options found
  OPTION_LABEL_COLLISION = "OPTION_LABEL_COLLISION",
  INLINE_OPTION_SPLIT_UNCERTAIN = "INLINE_OPTION_SPLIT_UNCERTAIN",
  
  // Answer & Topological Association Issues
  OFF_BY_ONE_SUSPECTED = "OFF_BY_ONE_SUSPECTED",
  KEY_VS_SOLUTION_DISCREPANCY = "KEY_VS_SOLUTION_DISCREPANCY",
  ANSWER_OUT_OF_OPTION_DOMAIN = "ANSWER_OUT_OF_OPTION_DOMAIN",  // Key says 'D' for a 3-option question
  ANSWER_MISSING_IN_SOURCE = "ANSWER_MISSING_IN_SOURCE",
  HANDWRITTEN_CONFLICT = "HANDWRITTEN_CONFLICT",
  
  // NAT Specific Issues
  NAT_TOLERANCE_UNSPECIFIED = "NAT_TOLERANCE_UNSPECIFIED",
  NAT_TARGET_UNIT_MISSING = "NAT_TARGET_UNIT_MISSING",
  
  // Mathematical & Media Issues
  LATEX_SYNTAX_MALFORMED = "LATEX_SYNTAX_MALFORMED",
  DIAGRAM_CROP_AMBIGUOUS = "DIAGRAM_CROP_AMBIGUOUS",
  SHARED_DIAGRAM_UNLINKED = "SHARED_DIAGRAM_UNLINKED",
  
  // Bilingual Issues
  BILINGUAL_PAIR_UNRESOLVED = "BILINGUAL_PAIR_UNRESOLVED"
}
```

---

# Part IX: Production Data Contract (Canonical JSON Schema)

The canonical output format of the engine is strict, strongly-typed JSON. Markdown or HTML representations may be rendered for human previews, but JSON is the authoritative system-of-record.

## 37. Complete TypeScript Data Contract

```typescript
/** Top-level response container returned by the reconstruction engine */
export interface CBTReconstructionResponse {
  /** Unique execution/session identifier */
  sessionId: string;
  /** Engine semantic version */
  engineVersion: string;
  /** ISO timestamp of processing completion */
  timestamp: string;
  /** Ingestion mode utilized */
  mode: "MODE_1_DECOUPLED" | "MODE_2_INTEGRATED";
  /** Overall document processing outcome */
  status: "SUCCESS" | "REVIEW_REQUIRED" | "FAILED" | "INCOMPLETE";
  /** Global metrics across the reconstructed document */
  summary: {
    totalPagesProcessed: number;
    totalQuestionsDetected: number;
    totalMCQ: number;
    totalMSQ: number;
    totalNAT: number;
    totalUnsupported: number;
    reviewRequiredCount: number;
  };
  /** Document-level shared stimuli (passages, common data) */
  stimuli: ParentStimulusBlock[];
  /** Reconstructed questions in logical reading order */
  questions: CBTQuestion[];
  /** Extracted media asset metadata */
  assets: MediaAssetRecord[];
  /** Document-level global issues */
  globalIssues: ProcessingIssue[];
}

/** Shared stimulus block governing multiple linked questions */
export interface ParentStimulusBlock {
  stimulusId: string;
  title?: string;
  content: RichContentBlock[];
  applicableQuestionNumbers: string[];
  provenance: SourceProvenance;
}

/** Comprehensive model for an individual reconstructed CBT question */
export interface CBTQuestion {
  /** Stable engine-generated UUID */
  id: string;
  /** Source hierarchical coordinates */
  sourceIdentity: {
    documentName?: string;
    setName?: string;
    sectionName?: string;
    printedQuestionNumber: string;
    rawHeaderTags?: string[];
  };
  /** Link to parent stimulus if part of a linked set */
  parentStimulusId?: string | null;
  /** Question classification */
  type: "MCQ" | "MSQ" | "NAT" | "UNSUPPORTED";
  /** Examination scoring directives */
  scoring: {
    marks: number;
    negativeMarks: number;
    isBonus: boolean;
    isCancelled: boolean;
  };
  /** Question statement content */
  statement: {
    blocks: RichContentBlock[];
  };
  /** Option set for MCQ / MSQ (empty for NAT) */
  options: CBTOption[];
  /** Authoritative correct answer */
  answer: CBTAnswer;
  /** Worked explanation / solution */
  solution?: {
    blocks: RichContentBlock[];
    provenance: SourceProvenance;
    confidence: number;
  } | null;
  /** Localized parallel versions if document is bilingual */
  localizedAlternative?: {
    language: string;
    statement: RichContentBlock[];
    options?: CBTOption[];
  };
  /** Granular component-level confidence scores (0.0 to 1.0) */
  confidence: {
    overall: number;
    statement: number;
    options: number;
    answer: number;
    solution: number;
    media: number;
  };
  /** Granular review issues identified for this question */
  issues: ProcessingIssue[];
  /** Physical source bounding regions */
  provenance: SourceProvenance;
}

/** Option item representation */
export interface CBTOption {
  /** Normalized option identifier ('A', 'B', 'C', 'D', etc.) */
  id: string;
  /** Raw printed label from source ('(A)', '1.', '[a]') */
  rawLabel: string;
  /** Rich option content (text, math, or visual asset) */
  content: RichContentBlock[];
  /** Provenance coordinates of the option */
  provenance: SourceProvenance;
}

/** Universal answer representation */
export interface CBTAnswer {
  /** Provenance origin: extracted from source vs generated */
  origin: "SOURCE" | "GENERATED" | "UNRESOLVED";
  /** For MCQ/MSQ: array of correct option IDs (e.g. ["B"] or ["A", "C"]) */
  selectedOptionIds?: string[];
  /** For NAT: numerical value and tolerance intervals */
  numericalAnswer?: {
    minValue: number;
    maxValue: number;
    exactValue?: number | null;
    isInteger: boolean;
    targetUnit?: string | null;
    toleranceRange?: string | null;
  };
  /** Raw unparsed answer string from source key */
  rawSourceString: string;
  /** Source location where answer was extracted */
  provenance: SourceProvenance;
  /** Confidence in answer association */
  confidence: number;
  /** Competing candidate hypotheses when source evidence contains contradictions */
  competingHypotheses?: AnswerHypothesis[];
}

/** Competing answer hypothesis from different source regions (e.g. Key Table vs Solution) */
export interface AnswerHypothesis {
  sourceOrigin: "PRINTED_KEY_TABLE" | "WORKED_SOLUTION_CONCLUSION" | "HANDWRITTEN_ANNOTATION";
  selectedOptionIds?: string[];
  numericalAnswer?: {
    minValue: number;
    maxValue: number;
  };
  rawText: string;
  confidence: number;
  provenance: SourceProvenance;
}

/** Polymorphic rich content block */
export type RichContentBlock =
  | TextBlock
  | MathBlock
  | ImageBlock
  | TableBlock
  | CodeBlock;

export interface TextBlock {
  type: "text";
  text: string;
}

export interface MathBlock {
  type: "math";
  /** Standard KaTeX/MathJax LaTeX string */
  latex: string;
  /** Display style vs inline style */
  displayMode: boolean;
  /** Fallback image asset reference if LaTeX is uncertain */
  fallbackAssetId?: string;
}

export interface ImageBlock {
  type: "image";
  assetId: string;
  caption?: string;
  altText?: string;
}

export interface TableBlock {
  type: "table";
  headers: string[];
  rows: string[][];
  caption?: string;
}

export interface CodeBlock {
  type: "code";
  language: string;
  code: string;
}

/** Normalized physical provenance reference */
export interface SourceProvenance {
  pageIndex: number;
  pageIdentifier?: string; // e.g. "Page 42"
  /** Normalized coordinates [ymin, xmin, ymax, xmax] in range 0.0 - 1.0 */
  boundingBox: [number, number, number, number];
  /** Sub-region or column index if applicable */
  columnIndex?: number;
}

/** Media asset catalogue record */
export interface MediaAssetRecord {
  assetId: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml";
  width: number;
  height: number;
  sourcePageIndex: number;
  sourceBoundingBox: [number, number, number, number];
  storageUri?: string;
}

/** Standardized issue reporting item */
export interface ProcessingIssue {
  code: IssueCode;
  severity: IssueSeverity;
  message: string;
  affectedComponent: "PAGE" | "STATEMENT" | "OPTIONS" | "ANSWER" | "SOLUTION" | "MEDIA";
  details?: Record<string, any>;
}
```

---

# Part X: System Pipeline & Algorithmic Strategy

A purely linear, single-pass pipeline is incapable of solving complex documents because layout decisions depend on semantic feedback, and semantic associations depend on layout boundaries.

The engine employs a **multi-stage, evidence-driven graph reconciliation architecture**:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   ENGINE ARCHITECTURE PIPELINE                         │
└────────────────────────────────────────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼───────────────────────────────────┐
│ STAGE 1: GEOMETRIC PRE-FLIGHT & PHYSICAL NORMALIZATION               │
│ - Quad boundary detection, homography rectification, deskew          │
│ - Spread detection & cylindrical gutter dewarping                    │
│ - Illumination & bleed-through normalization                         │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
┌──────────────────────────────────▼───────────────────────────────────┐
│ STAGE 2: MULTI-MODAL LAYOUT PARSING & TOKEN EXTRACTION               │
│ - Layout zone segmentation (Header, Footer, Column, Spanning Box)   │
│ - Entity segmentation (Question Stem, Option, Table, Figure, Key)    │
│ - LaTeX mathematical synthesis & visual asset slicing                │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
┌──────────────────────────────────▼───────────────────────────────────┐
│ STAGE 3: STRUCTURAL GRAPH CONSTRUCTION                               │
│ - Nodes: Question Roots, Option Leaves, Stems, Solutions, Key Items  │
│ - Edges: Physical Containment, Reading Flow, Semantic Continuation   │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
┌──────────────────────────────────▼───────────────────────────────────┐
│ STAGE 4: TOPOLOGICAL ALIGNMENT & CONSTRAINT SOLVER                   │
│ - Bipartite graph matching across Questions, Keys, and Solutions     │
│ - Anchor enforcement (explicit Q# binding, domain consistency)       │
│ - Anti-cascade shift prevention (isolate gaps, reject shifts)        │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
┌──────────────────────────────────▼───────────────────────────────────┐
│ STAGE 5: SEMANTIC VALIDATION & CONFLICT AUDITING                     │
│ - Key vs Solution contradiction auditing                             │
│ - Option domain verification & NAT unit extraction                   │
│ - Bilingual stream deduplication & parent stimulus grouping          │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
┌──────────────────────────────────▼───────────────────────────────────┐
│ STAGE 6: CBT NORMALIZATION & CANONICAL JSON EXPORT                   │
│ - Assign deterministic UUIDs                                         │
│ - Compute component-level confidence scores                          │
│ - Assemble standardized Review Issues & export canonical JSON        │
└──────────────────────────────────────────────────────────────────────┘
```

---

# Part XI: Real-World Test & Validation Matrix

The engine must be tested and benchmarked against real-world test sets exhibiting the full matrix of physical, typographic, and structural complexities:

| Category | Stress Test Case | Verification Condition |
| :--- | :--- | :--- |
| **Physical** | Double-page mobile photograph with curved gutter | Splits into 2 pages; zero text loss along spine curve. |
| **Physical** | Camera photo tilted at $15^\circ$ with thumb on left margin | Perspective rectified; thumb flagged as `OCCLUSION_DETECTED`. |
| **Physical** | Low-GSM paper with dark reverse-page bleed-through | Zero phantom questions created from ghost text. |
| **Physical** | Aggressive CamScanner image with faint square root lines | Math parser recovers complete LaTeX; visual fallback snapped. |
| **Geometry** | 2-column page with diagram spanning across both columns | Reading order traverses Col 1 $\rightarrow$ Spanning Diagram $\rightarrow$ Col 2. |
| **Geometry** | Question starting on Page 15 Col 2, ending on Page 16 Col 1 | Unified into a single `CBTQuestion`; no orphan option fragments. |
| **Typology** | GATE MSQ with 4 options looking identical to MCQ | Correctly classified as `MSQ` via section header and multi-key. |
| **Typology** | NAT question with integer tolerance: *"answer in integer"* | `isInteger: true`, `minValue: 6`, `maxValue: 6`. |
| **Typology** | NAT question with range: `12.4 to 12.6` and unit `kW` | Range captured; `targetUnit: "kW"` explicitly populated. |
| **Typology** | Parent passage governing Questions 21, 22, and 23 | Stored in `stimuli[]`; child questions reference `parentStimulusId`. |
| **Typology** | Bilingual English/Hindi parallel exam columns | Linked into single question with `localizedAlternative`; not duplicated. |
| **Options** | 4 options printed on a single horizontal line | Dissected into 4 discrete options `A, B, C, D` with valid bounds. |
| **Options** | Question with only 3 options printed | `OPTION_COUNT_ANOMALY` warning raised; not padded with dummy 'D'. |
| **Key Alignment**| Question 14 omitted from scan; Answer key has 1..50 | $Q_{15} \dots Q_{50}$ maintain correct answers; off-by-one prevented. |
| **Conflict** | Answer Key says `(A)`, Worked Solution proves `(C)` | Status `REVIEW_REQUIRED`; `KEY_VS_SOLUTION_DISCREPANCY` logged. |
| **Handwriting** | Printed MCQ with pencil tick on (B); official key says (D) | Authoritative key (D) preserved; pencil tick logged as annotation. |
| **Provenance** | Every question and diagram in export | Complete $[ymin, xmin, ymax, xmax]$ bounding boxes matching original images. |

---

# Part XII: Success Criteria & North Star

The engine is evaluated strictly by **structural correctness and trustworthy reconstruction**, never by raw OCR character count.

A reconstruction run is considered successful if and only if:
1. **Zero Silent Cascades:** An omission or recognition failure on one question never corrupts the answers or numbering of subsequent questions.
2. **Zero Fabricated Content:** Missing source answers, options, or explanations remain `null`; the engine never invents facts to fulfill schema constraints.
3. **Pristine Mathematical Fidelity:** Equations render cleanly in standard web KaTeX without visual truncation or syntax errors.
4. **First-Class Visual Integrity:** Every diagram, circuit, and graph is sliced at high resolution with exact bounding box coordinates and correct option/question bindings.
5. **Actionable Review Triage:** When human intervention is required, the reviewer is routed directly to the specific ambiguous field with all conflicting evidence displayed side-by-side.

---

# Part XIII: Final Architectural Definition

> **The Photo-to-CBT Reconstruction Engine is a standalone, evidence-driven document intelligence system that converts degraded physical examination materials into pristine, validated, CBT-ready structured data.**
>
> **It bridges the gap between the messy physical reality of printed and handwritten exam books and the rigorous, deterministic data contracts required by modern computer-based testing engines.**
>
> **Its foundational creed is: Structural Precision over Extraction Volume, Evidence over Heuristics, and Explicit Uncertainty over Silent Hallucination.**
