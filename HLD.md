# High-Level Design (HLD): Document Intelligence Engine (`documentIntelligenceEngine`)
### Core Backend Subsystem of the TakeMock Desktop Application

---

## 1. Executive Summary & System Vision

### 1.1 Product Context: The TakeMock Desktop App
**TakeMock** is a local, privacy-first desktop application engineered to empower students, educators, and test-takers to generate instant, interactive **Computer-Based Test (CBT) mock exams and question papers** directly from physical learning materials. 

Users simply feed or click photos of:
- Textbook pages and chapter exercises
- Previous Year Question (PYQ) booklets
- Printed coaching problem sheets and mock exam papers
- Graded answer sheets with teacher or student marks

While the larger TakeMock desktop app provides the full user journey (including photo feeding/capture UI, live progress indicators, test creation wizard, question bank manager, and the interactive CBT exam simulator), **the current engineering focus is strictly on the core backend component: the Document Intelligence Engine (`documentIntelligenceEngine`)**.

### 1.2 Core Objective of the Document Intelligence Engine
The **Document Intelligence Engine (DIE)** functions as a fully local, air-gapped, cross-platform backend engine (macOS, Windows, Linux) with a single dedicated contract:
> **Ingest arbitrary, uncontrolled, and non-planar photographic captures of academic assessments $\longrightarrow$ Compile them deterministically into structured, standardized machine-readable question units (supporting YAML Frontmatter v3.0, JSON CBT formats, and future custom test bank schemas).**

The engine is strictly an **extraction, layer isolation, structural reconstruction, and relational metadata inference engine**; it operates with zero external network dependencies, zero conversational filler, and zero structural hallucinations.

### 1.3 Non-Negotiable Architectural Invariants
1. **Zero WAN Network Footprint**: Completely air-gapped execution with 0 outbound network calls. All neural network weights, tokenizers, grammar state machines, and OpenCV algorithms are bundled locally.
2. **Strict Hardware Ceiling**: Absolute upper memory ceiling: **8.0 GB System RAM / Unified Memory**. Maximum working set during peak multi-page inference: **$\le 3.8\text{ GB}$** ($\le 4.1\text{ GB}$ hard safety boundary). Total on-disk footprint: **$\le 2.6\text{ GB}$** (against a 6.5 GB ceiling).
3. **High Operational Throughput**: Single page compilation $\le 7.5\text{ seconds}$ ($\le 12.0\text{ s}$ ceiling); 10-page assessment session $\le 70\text{ seconds}$ ($\le 90.0\text{ s}$ ceiling). Desktop UI maintains fluid 60 FPS.
4. **Zero-Loss Information Guarantee**: Acceleration techniques (proxy downsampling, Catmull-Rom resampling, RadixAttention, GBNF fast-forwarding, and two-pass memory reclamation) operate with mathematically zero loss of resolution, sub-pixel text sharpness, structural layer provenance, or schema compliance.
5. **Determinism over Hallucination**: Logit-level grammar constraints (`GBNF v3.0` / `llguidance`) eliminate conversational drift, malformed YAML, and syntax errors. Creased or torn occlusions inject standardized `[MISSING_SECTION]` tokens rather than speculating.
6. **Multi-Format Extensibility**: While the foundational format is strict YAML Frontmatter v3.0 with LaTeX equations and `=== question ===` delimiters, the engine's serialization stage is modular, enabling seamless transformation into TakeMock JSON CBT question banks and custom LMS formats.

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                      TakeMock: Document Intelligence Engine System Boundary                            │
│                                                                                                        │
│  [Adverse Optical Input]          [Hardened Ingestion & Rectification]        [Target Output Contract] │
│  - Textbook photos / PYQ books    - Adaptive Tile-Based Polarity Triage       - Strict YAML Schema 3.0 │
│  - Extreme non-planar curl        - Coupled Gradient-Photometric Splitter     - TakeMock JSON CBT bank │
│  - Fold self-occlusion            - Tri-Cue Ink Decomposer (Tremor/Sheen)     - Clean Inline/Block Math│
│  - Identical carbon-black ink     - Column-Barrier Reading Order DAG          - Verified Options State │
│  - Split questions across pages   - Section-Scoped Session Graph (SQLite) ──► - Full Provenance Audit  │
│  - Heterogeneous answers / keys ─►- Decoupled Two-Pass Memory Model           - Zero Conversational    │
│  - Upside-down marginalia keys    - Fast-Forwarding GBNF Decoder                Filler                 │
│  - Teacher grading vs. student    - Dynamic OS Resource Watchdog              - [MISSING_SECTION]      │
│  - Completely un-keyed tests      - Immediate Bitmap Memory Purge             - Normalized Edit ≤ 0.02 │
│                                                                                                        │
│  [Air-Gapped: Zero WAN]           [Peak Working RAM: ≤ 3.8 GB / 8.0 GB]       [Determinism: 100.0%]    │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. System Architecture & Subsystem Decomposition

The Document Intelligence Engine is architected as an **independent, UI-agnostic native headless library** (`libdocument_intelligence_engine`). It contains zero coupling to any specific frontend framework (such as Tauri, Electron, Webview, or Flutter), allowing TakeMock to use completely separate, native UI stacks on each operating system (e.g., SwiftUI on macOS, WinUI 3/WPF on Windows, and Qt/GTK on Linux).

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               TakeMock Headless Subsystem Architecture                                  │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. Host Desktop UI Layer (Completely Decoupled & OS-Specific)                                           │
│    • macOS: Native Swift / SwiftUI (via Swift Package / Bridging Header)                                │
│    • Windows: Native C# / WinUI 3 / WPF (via .NET P/Invoke)                                             │
│    • Linux: Native C++ / Qt6 / GTK4 (via C-ABI header)                                                  │
│    • Cross-Platform Alternative: Flutter (Dart FFI) / Tauri / Electron                                  │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. Universal Native C-ABI Interface Boundary (`extern "C"` + Non-Blocking Event Streaming)              │
│    • `die_engine_init()`, `die_session_create()`, `die_ingest_page()`, `die_reconcile_and_export()`     │
│    • Asynchronous progress callbacks: `(*DIEProgressCallback)(const char* event_json, void* user_data)`│
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. Native Rust Coordinator Core (Engine Orchestrator)                                                   │
│    • Rayon Multithreaded Worker Pool   • OS Resource Watchdog (RAM/TDR/Thermal) • Zero-Copy Arena Slab  │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. Optical Perception & Geometry Subsystem (C++ / OpenCV / ONNX Runtime)                                │
│    • SIMD Tile Triage (≤ 45ms)         • Catmull-Rom Bicubic Dewarping          • Tri-Cue Ink Splitter  │
│    • RT-DETR-DocLayNet Polygon Layout  • Zhang-Suen Intent Thinning             • Rotational Marginalia │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 5. Relational Session Graph Subsystem (Embedded SQLite in WAL Mode)                                     │
│    • Section-Scoped Compound Keys      • Cross-Page Continuation FSM            • Hierarchy of Truth    │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 6. Structured Neural Compilation Subsystem (Llama.cpp / GGUF Q4_K_M / llguidance)                      │
│    • Qwen2.5-VL-3B-Instruct (Vision)   • RadixAttention Persistent Prefix Cache • GBNF v3.0 Engine      │
│    • Fast-Forward KV Splicer (2.5x)    • Zero-Mask UTF-8 Fallback Rollback      • Sliding Window Guard  │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Subsystem Roles & Responsibilities

| Subsystem | Primary Technology | Functional Responsibility | Latency / Budget Target |
| :--- | :--- | :--- | :--- |
| **Host Desktop UI** | OS-Specific (SwiftUI, WinUI 3, Qt6, etc.) | Manages camera capture/photo feeding, scan progress bars, and the interactive CBT test simulator without UI thread stalls. | Decoupled; communicates via asynchronous native callbacks. |
| **Universal C-ABI Boundary** | C99 FFI (`extern "C"`), dynamic/static lib | Exposes thread-safe, zero-copy functions and event streaming to any programming language or GUI framework. | Near-zero overhead invocation ($\le 0.1\text{ ms}$). |
| **Rust Coordinator** | Native Rust (2024 Edition), `rayon`, `crossbeam` | Orchestrates memory budgets, controls pipeline stages, allocates zero-copy memory arenas, and coordinates OS health governors. | Oversees $\le 3.8\text{ GB}$ working RAM boundary. |
| **Optical Perception** | OpenCV 4.x, ONNX Runtime INT8, DocRes, RT-DETR | Executes 8x8 tile triage, manifold dewarping, non-destructive layer separation ($W_{\text{print}}$), layout bounding polygons, and intent classification. | $\le 1.25\text{ s}$ per page total CV execution. |
| **Session Graph** | Embedded `rusqlite` (WAL Mode, In-Memory or Temp DB) | Stores harvested question fragments, option blocks, and distributed answer keys. Resolves section scopes and cross-page joins. | $\le 15\text{ ms}$ total query latency across session. |
| **Neural Compilation** | `llama.cpp` (Metal, DirectML, CUDA, AVX-512), `llguidance` | Extracts LaTeX equations, transcribes question text, evaluates options, and compiles YAML/JSON formats using fast-forwarding GBNF. | $\le 5.8\text{ s}$ per page inference time. |

### 2.2 Universal Headless C-ABI Interface (`document_intelligence_engine.h`)

Because TakeMock may utilize completely separate, native UI stacks on each operating system (e.g. **Swift/SwiftUI on macOS**, **C#/WinUI 3 on Windows**, and **C++/Qt on Linux**), the engine compiles into a native shared library (`.dylib`, `.dll`, `.so`) or static archive (`.a`, `.lib`) exposing a standardized, thread-safe C99 API:

```c
// document_intelligence_engine.h
#ifndef DOCUMENT_INTELLIGENCE_ENGINE_H
#define DOCUMENT_INTELLIGENCE_ENGINE_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

// Opaque handle to the initialized engine instance
typedef struct DIEEngineHandle DIEEngineHandle;

// Async progress callback signature (non-blocking for UI thread)
typedef void (*DIEProgressCallback)(
    const char* event_type,   // "triage_pass", "dewarp_done", "page_complete"
    int32_t current_page, 
    int32_t total_pages, 
    const char* payload_json, 
    void* user_data
);

// Engine lifecycle
DIEEngineHandle* die_engine_init(const char* models_dir, const char* config_json);
void die_engine_destroy(DIEEngineHandle* handle);

// Session ingestion (Pass 1)
int32_t die_session_ingest_page(
    DIEEngineHandle* handle,
    const char* session_id,
    const char* section_id,
    int32_t page_num,
    const uint8_t* image_bytes,
    size_t image_len,
    DIEProgressCallback callback,
    void* user_data
);

// Session reconciliation and multi-format serialization (Pass 2)
char* die_session_export(
    DIEEngineHandle* handle,
    const char* session_id,
    const char* target_format // "yaml_frontmatter_v3" | "takemock_cbt_json"
);

// Memory cleanup for exported string payloads
void die_string_free(char* ptr);

#ifdef __cplusplus
}
#endif

#endif // DOCUMENT_INTELLIGENCE_ENGINE_H
```

#### Platform UI Bindings:
- **macOS (Apple Native Swift / SwiftUI)**:
  Directly imports `document_intelligence_engine.h` via a Swift Package (`Package.swift`) or Objective-C bridging header. Swift async/await wraps the C callbacks, updating `@Published` SwiftUI view models on `@MainActor` with zero IPC serialization cost.
- **Windows (Windows Fluent Native C# / WinUI 3 / WPF)**:
  Uses .NET P/Invoke (`[DllImport("document_intelligence_engine.dll")]`) with delegate marshaling for the progress callback. The UI dispatches results directly to the WinUI `DispatcherQueue`.
- **Linux (Native C++ / Qt6 / GTK4)**:
  Directly includes `document_intelligence_engine.h`. Wraps the engine handle in a standard `QObject` / `GObject` worker thread emitting native Qt signals (`emit pageProcessed()`).

---

## 3. End-to-End Operational Workflow: The Decoupled Two-Pass Engine

To process multi-page assessments containing a mixture of marked student answers, same-page footer keys, distant-page answer matrices (e.g. Page 8), and un-keyed questions without memory blowouts, ADIE implements a **Decoupled Two-Pass Engine**.

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                             ADIE Decoupled Two-Pass Operational Flow                                    │
│                                                                                                         │
│   PASS 1: Streaming Per-Page Optical Extraction (Throughput: ≤ 7.5s / page)                             │
│   ┌─────────────────┐       ┌───────────────────────────┐       ┌───────────────────────────────────┐   │
│   │ Raw Page Bitmap │──────►│ Stage 1: Adaptive Triage  │──────►│ Stage 2: Dewarp & Crease Splitter │   │
│   └─────────────────┘       └─────────────┬─────────────┘       └─────────────────┬─────────────────┘   │
│                                           │ Pass (< 45ms)                         │                     │
│                                           ▼                                       ▼                     │
│                             ┌───────────────────────────┐       ┌───────────────────────────────────┐   │
│                             │ Stage 4: Layout & Cross-  │◄──────│ Stage 3: Tri-Cue Layer Decomposer │   │
│                             │ Page Boundary Linker      │ (A/B) │ - Frame A: Base Print             │   │
│                             └─────────────┬─────────────┘       │ - Frame B: Multi-Channel Ink      │   │
│                                           │                     └───────────────────────────────────┘   │
│                                           ▼                                                             │
│                             ┌───────────────────────────┐       ┌───────────────────────────────────┐   │
│                             │ Stage 5: In-Situ Intent & │──────►│ Persist to In-Memory SQLite Graph │   │
│                             │ Marginalia Rotation Parser│       │ - Question Containers & Options   │   │
│                             └───────────────────────────┘       │ - Harvested Keys (Footers/Matrix) │   │
│                                                                 └─────────────────┬─────────────────┘   │
│          [PURGE HIGH-RES BITMAP FROM RAM IMMEDIATELY] ◄───────────────────────────┘                     │
│          (RAM drops back to ~2.05 GB; avoids multi-page bitmap accumulation in memory)                  │
│                                                                                                         │
│   PASS 2: Relational Graph Reconciliation & Constrained Serialization (< 100ms total across session)    │
│   ┌───────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│   │ Stage 6: Relational Session Graph Solver                                                          │ │
│   │   • Map intra-page footer keys (same page) ──► Question Entities                                  │ │
│   │   • Map inter-page matrix keys (distant pages) ──► Question Entities                              │ │
│   │   • Execute Hierarchy of Truth: Teacher Ink ≻ Student Ink ≻ Page Key ≻ Distant Key                │ │
│   │   • Handle Unresolved Questions: Strict Clean Mode (- [ ]) OR Opt-in CoT Solver Mode             │ │
│   └───────────────────────────────────────────────┬───────────────────────────────────────────────────┘ │
│                                                   ▼                                                     │
│   ┌───────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│   │ Stage 7: Constrained Multimodal VLM Decoder (llguidance / GBNF v3.0)                              │ │
│   │   • Fast-forward deterministic grammar tokens (skips VLM sampling on static structural schema)    │ │
│   │   • Deadlock-safe token mask sampling + n-gram repetition blocker                                 │ │
│   │   • SymPy AST validation (Formula edit distance NED ≤ 0.02)                                       │ │
│   │   • Emit Standardized Target Serialization: YAML Frontmatter v3.0 + LaTeX + "=== question ==="   │ │
│   └───────────────────────────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 3.1 Detailed Pass 1 Breakdown (Streaming Per-Page Extraction)

#### Stage 1: Adaptive Heuristic Triage ($\le 50\text{ ms}$, SIMD CPU)
- Downsamples input to a 720p L-channel proxy.
- **Adaptive Polarity Normalization**: Divides image into an $8 \times 8$ grid of local tiles. For each tile, if $\text{Median}(T_{i,j}) < 100$ and Canny edge density $> 0.04$, inverts the tile ($T'_{i,j} = 255 - T_{i,j}$), normalizing blackboards, slate screens, and dark headers without altering standard light regions.
- **Three-Point Gate Rejection**:
  $$\text{Reject if: } \sigma_L^2 < 80.0 \quad (\text{Blur}) \quad \lor \quad \Phi_{\text{text}} < 0.35 \quad (\text{Clutter/Nature}) \quad \lor \quad \sigma_{\Delta y}^2 < 1.2 \quad (\text{Monospace/Receipts})$$
- Returns appropriate error codes (`ERR_NON_ACADEMIC_IMAGE`, `ERR_NON_ACADEMIC_LAYOUT`, `ERR_UNRECOVERABLE_BLUR`) in $< 50\text{ ms}$, protecting GPU memory.

#### Stage 2: Geometric Rectification & Crease Discontinuity Splitting
- Estimates dense manifold displacement flow-field $F \in \mathbb{R}^{H \times W \times 2}$.
- **Photometric Crease Discontinuity Verification**:
  $$\text{IsTear} = (\|\nabla F\|_2 > 2.5) \land (\|\nabla I_{\text{photometric}}\| > \tau_{\text{shadow}})$$
- If verified: halts pixel interpolation across the crevasse to prevent equation hallucination, segments the manifold into sub-patches, and injects `[MISSING_SECTION]`.
- Continuous regions undergo **16-pixel Catmull-Rom bicubic spline resampling** ($\alpha = -0.5$), ensuring zero low-pass blur on subscripts, dots on $i, j$, and prime notations.

#### Stage 3: Multi-Cue Layer Decomposition (Non-Destructive Residual Masking)
- Disambiguates identical carbon-black ink (student gel pen vs. printer carbon toner where $a^* \approx 0, b^* \approx 0$) using three physical features:
  1. **Color Delta**: $\Delta E = \sqrt{\Delta a^2 + \Delta b^2}$
  2. **Specular Sheen**: $S = \frac{I_{\text{direct}}}{I_{\text{diffuse}}} > 1.8$ (distinguishes graphite and gel sheen from matte toner)
  3. **Stroke Curvature Tremor**: $\Psi_{\text{tremor}} = \frac{1}{L} \int_0^L |\kappa'(s)|\, ds > 0.42$ (identifies human neuromuscular tremor)
- Separates student ink from instructor grading ink via red chrominance ($a^* > 25$).
- **Non-Destructive Continuous Tensor**: Generates $W_{\text{print}} \in [0, 1]^{H \times W}$. Printed text, fraction lines, and radicals are preserved without destructive erasure or inpainting artifacts.

#### Stage 4: Layout Continuity & Reading Order DAG
- Segments layout using an INT8 RT-DETR model taking a 4-channel tensor ($\text{RGB} + \text{Frame B Mask}$).
- **Column-Barrier Reading Order DAG**: Blocks cross-gutter directed edges to eliminate multi-column sentence interleaving.
- **Cross-Page Boundary State Machine**: If a container at the page bottom lacks terminal punctuation, enters `PENDING_NEXT_PAGE` and merges with headless option blocks on Page $N+1$.

#### Stage 5: In-Situ Intent & Strike-Out Engine
- Uses Zhang-Suen skeletonization on option checkmarks. Analyzes crossing density $C_{\text{stroke}}$.
  - If $C_{\text{stroke}} \ge 1$ and bounding box span $> 55\%$: flagged as `STRIKE_OUT_CANCELLED` and forced to `- [ ]`.
  - If span $< 25\%$: preserved as valid algebraic variable '$x$'.
- Regex dimensional lexer strips scratchpad calculations inside fill-in-the-blank spaces (`r"([+-]?[0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z\mu\Omega/^\-]+)?"`).

#### Stage 6: Rotational Marginalia Triage & Session Graph Persistence
- Evaluates marginalia blocks across 4 orientations ($0^\circ, 90^\circ, 180^\circ, 270^\circ$). Un-rotates inverted footer/margin text and regex-extracts answer keys.
- Persists all entities to embedded SQLite in WAL mode.

#### Stage 7: Immediate Bitmap Memory Reclamation
- **CRITICAL STEP**: The uncompressed high-resolution bitmap (`cv::Mat`) is explicitly purged from RAM immediately after Pass 1 completes for the page. Active RAM drops back to the model baseline (~2.05 GB), completely eliminating multi-page memory bloat.

---

### 3.2 Detailed Pass 2 Breakdown (Relational Reconciliation & Serialization)

#### Stage 8: Relational Session Graph Reconciliation
- Runs SQL queries linking questions with harvested intra-page footers and distant-page matrix tables.
- Scoped by `PRIMARY KEY(session_id, section_id, question_numeral)` to avoid collisions across assessment sections.

#### Stage 9: The Hierarchy of Truth Protocol
Resolves answer states using an absolute precedence protocol:

```text
┌────────────────────────────────────────────────────────┐
│ Tier 0: Instructor Red Grading Ink                     │
│ - Overrules student markings and printed answer keys   │
└──────────────────────────┬─────────────────────────────┘
                           │ If absent
                           ▼
┌────────────────────────────────────────────────────────┐
│ Tier 1: Explicit Student Annotation (Handwritten Ink)  │
│ - Checkmark [- [x]], inline text, marginalia tags      │
│ - Overrules typeset answer keys (preserves submission) │
└──────────────────────────┬─────────────────────────────┘
                           │ If absent
                           ▼
┌────────────────────────────────────────────────────────┐
│ Tier 2a: Relational Same-Page Answer Key               │
│ - Resolved from footer/margin key on the current page  │
└──────────────────────────┬─────────────────────────────┘
                           │ If absent
                           ▼
┌────────────────────────────────────────────────────────┐
│ Tier 2b: Relational Distant-Page Answer Matrix         │
│ - Resolved from end-of-session tables (e.g., Page 8)   │
└──────────────────────────┬─────────────────────────────┘
                           │ If absent
                           ▼
┌────────────────────────────────────────────────────────┐
│ Tier 3: Unresolved Clean Assessment / Inferred Mode    │
│ - Default Strict Extractor: Emits distractors - [ ]    │
│ - Opt-In Solver Mode: Local model infers choice        │
└────────────────────────────────────────────────────────┘
```
- Conflicts between student selections and typeset keys are recorded in `answerResolution.conflictAudit`.

#### Stage 10: Fast-Forwarding GBNF v3.0 Grammar Decoding
- Emits YAML frontmatter, questions, and options constrained at the logit level by GBNF v3.0.
- Skips neural forward passes on static keys (`schemaVersion: "3.0"`, `\n=== question ===\n`), delivering a $2.5\times$ speedup.
- Catches zero-mask deadlocks and rolls back to raw UTF-8 byte stream fallback.

---

## 4. Data Architecture & Schema Design

### 4.1 Embedded Relational Session Graph Schema (SQLite WAL)

```sql
-- Section metadata and booklet codes
CREATE TABLE session_sections (
    section_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    booklet_code TEXT DEFAULT 'STANDARD',
    subject_scope TEXT
);

-- Question entities extracted in Pass 1
CREATE TABLE session_questions (
    question_uid TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    question_numeral TEXT NOT NULL,
    question_type TEXT CHECK(question_type IN ('single_choice', 'multiple_choice', 'numerical')),
    stem_text_latex TEXT NOT NULL,
    options_json TEXT,
    in_situ_ink_json TEXT,
    jsonld_anchors TEXT,
    continuation_state TEXT DEFAULT 'COMPLETE',
    FOREIGN KEY(section_id) REFERENCES session_sections(section_id)
);

-- Distributed answer keys harvested in Pass 1
CREATE TABLE scoped_answer_keys (
    key_uid TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    section_id TEXT NOT NULL,
    question_numeral TEXT NOT NULL,
    target_value TEXT NOT NULL,
    source_page INTEGER NOT NULL,
    key_locality TEXT CHECK(key_locality IN ('PAGE_FOOTER', 'MARGIN_CALLOUT', 'END_MATRIX')),
    confidence REAL DEFAULT 1.0
);
```

### 4.2 Mandatory Target Output Contract (Production Schema v3.0)

```yaml
---
schemaVersion: "3.0"
id: [Generated/Extracted Unique ID String]
type: [single_choice | multiple_choice | numerical]
subject: [Extracted/Inferred Subject String]
topic: [Extracted/Inferred Topic String]
difficulty: [easy | medium | hard]
marks: [Assigned Weight Numeric]
negativeMarks: [Assigned Multiplier Numeric]
tags: ["tag-1", "tag-2"]
answerResolution:
  state: [explicit_key | human_selection | teacher_graded | unresolved | model_inferred]
  confidence: [Numeric 0.0 to 1.0]
  sourceRef: ["page_X_matrix" | "frame_b_ink:opt_X" | "local_vlm_solver" | null]
  # Optional: Emitted only when candidate sources conflict:
  conflictAudit:
    typesetKeyAvailable: [Value String]
    typesetKeySource: [Source String]
# For numerical types only:
correctValue: [Derived Numeric Value | null]
toleranceAbsolute: [Derived Tolerance Numeric]
unit: [Derived Unit String]
# For multiple_choice types only:
allowPartialCredit: true
---

[Extracted Question Text with inline math using $...$ and display equations using $$...$$]

# If single_choice or multiple_choice type:
- [ ] Incorrect Distractor Option Text
- [x] Correct Option Text
- [ ] Incorrect Distractor Option Text

=== question ===
```

### 4.3 Formal Production Grammar (GBNF v3.0)

```ebnf
# Root Rule: Academic Assessment Unit
root ::= frontmatter question_body option_block_opt delimiter

# YAML Frontmatter Specification (Schema v3.0)
frontmatter ::= "---\n"
                "schemaVersion: \"3.0\"\n"
                "id: \"" id_string "\"\n"
                "type: \"" question_type "\"\n"
                "subject: \"" text_line "\"\n"
                "topic: \"" text_line "\"\n"
                "difficulty: \"" ("easy" | "medium" | "hard") "\"\n"
                "marks: " numeric_val "\n"
                "negativeMarks: " numeric_val "\n"
                "tags: [" tag_list "]\n"
                "answerResolution:\n"
                "  state: \"" resolution_state "\"\n"
                "  confidence: " numeric_val "\n"
                "  sourceRef: " source_ref_val "\n"
                conflict_audit_opt
                numerical_fields_opt
                multi_choice_fields_opt
                "---\n\n"

question_type    ::= "single_choice" | "multiple_choice" | "numerical"
resolution_state ::= "explicit_key" | "human_selection" | "teacher_graded" | "unresolved" | "model_inferred"
source_ref_val   ::= "\"" [a-zA-Z0-9_\-.:/ ]+ "\"" | "null"

conflict_audit_opt ::= (
    "  conflictAudit:\n"
    "    typesetKeyAvailable: \"" [a-zA-Z0-9_\-.: ]+ "\"\n"
    "    typesetKeySource: \"" [a-zA-Z0-9_\-.: ]+ "\"\n"
)?

numerical_fields_opt ::= (
    "correctValue: " (numeric_val | "null") "\n"
    "toleranceAbsolute: " numeric_val "\n"
    "unit: \"" [a-zA-Z0-9/^\- ]* "\"\n"
)?

multi_choice_fields_opt ::= (
    "allowPartialCredit: " ("true" | "false") "\n"
)?

# Body & Equation Syntax Rules
question_body  ::= (regular_text | inline_math | display_math | raw_unicode_sequence | missing_token)+ "\n\n"
inline_math    ::= "$" [^$\n\r]+ "$"
display_math   ::= "$$\n" [^$]+ "\n$$"
missing_token  ::= "[MISSING_SECTION]"
raw_unicode_sequence ::= [\x80-\xFF]{1,4}

# Controlled Option Blocks
option_block_opt ::= (option_item)+ | ""
option_item      ::= "- [" (" " | "x") "] " [^\n\r]+ "\n"

# Immutable Delimiter Contract
delimiter ::= "\n=== question ===\n"

# Primitives
id_string    ::= [a-zA-Z0-9_\-]+
text_line    ::= [a-zA-Z0-9 ,.\-_:;()]+
numeric_val  ::= "-"? [0-9]+ ("." [0-9]+)?
tag_list     ::= ("\"" [a-zA-Z0-9_\-]+ "\"" (", " | ""))*
regular_text ::= [a-zA-Z0-9 .,!?:;'\-\"()\n]+
```

### 4.4 Modular Multi-Format Serialization Architecture

While the foundational compilation target is the strictly-typed `YAML Frontmatter v3.0 + LaTeX + === question ===` format (guaranteed by GBNF v3.0 grammar), the Document Intelligence Engine features a **pluggable serialization adapter layer**. This enables TakeMock to serialize extracted questions into multiple downstream CBT formats without changing the core vision or extraction pipeline:

```text
                                  ┌────────────────────────────────────────┐
                                  │ Extracted Question Entity in SQLite DB │
                                  │ (Normalized STEM LaTeX, Options, Ink)  │
                                  └───────────────────┬────────────────────┘
                                                      │
                                                      ▼
                                       ┌─────────────────────────────┐
                                       │ Trait QuestionSerializer    │
                                       └──────────────┬──────────────┘
                                                      │
                  ┌───────────────────────────────────┼───────────────────────────────────┐
                  ▼                                   ▼                                   ▼
   ┌─────────────────────────────┐     ┌─────────────────────────────┐     ┌─────────────────────────────┐
   │ Format 1: Canonical YAML 3.0│     │ Format 2: TakeMock CBT JSON │     │ Format 3: Export Adapters   │
   │ (GBNF logit-constrained     │     │ (Structured test-bank for   │     │ (QTI 2.1 / Aiken / Moodle   │
   │  LaTeX + delimiters)        │     │  interactive exam simulator)│     │  CBT Question formats)      │
   └─────────────────────────────┘     └─────────────────────────────┘     └─────────────────────────────┘
```

#### Format 2: TakeMock Interactive CBT JSON Schema (Example)
```json
{
  "questionId": "phy_optics_q14",
  "type": "single_choice",
  "subject": "Physics",
  "topic": "Wave Optics",
  "difficulty": "medium",
  "marks": 4.0,
  "negativeMarks": -1.0,
  "stem": "In Young's double-slit experiment, if the slit separation is halved...",
  "options": [
    { "id": "A", "text": "Fringe width remains unchanged", "isCorrect": false },
    { "id": "B", "text": "Fringe width is halved", "isCorrect": false },
    { "id": "C", "text": "Fringe width is doubled", "isCorrect": true },
    { "id": "D", "text": "Fringe pattern disappears", "isCorrect": false }
  ],
  "resolution": {
    "state": "teacher_graded",
    "confidence": 0.98,
    "sourceRef": "teacher_red_ink:opt_C"
  }
}
```

This decoupling ensures that as TakeMock introduces new CBT mock test formats, exports, or test engines, the core perception, manifold dewarping, layer separation, and relational session graph subsystems remain completely invariant.

---

## 5. Zero-Loss Architectural Optimization Framework

The engine adheres to a rigorous **Zero-Loss Architectural Optimization Framework**, proving that operational speed and memory containment do not require sacrificing scientific depth:

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              ADIE Zero-Loss Architectural Optimization Pillars                          │
├──────────────────────────┬─────────────────────────────┬──────────────────┬────────────────────────────┤
│ Pillar 1: Spatial & CV   │ Pillar 2: Neural Inference  │ Pillar 3: Memory │ Pillar 4: Concurrency & OS │
├──────────────────────────┼─────────────────────────────┼──────────────────┼────────────────────────────┤
│ • Sub-pixel pyramid      │ • RadixAttention prefix tree│ • Two-pass WAL   │ • DirectML chunked fences  │
│   coordinates            │ • Fast-forwarding KV splice │   bitmap eviction│   (< 250ms WDDM TDR safe)  │
│ • Catmull-Rom C¹ splines │ • Zero-mask byte rollback   │ • Zero-copy mmap │ • Darwin pressure watchdog │
│ • Non-destructive W_print│ • 16-token bracket sliding  │ • Arena scratch  │ • Thermal Rayon scaling    │
│ • Crease [MISSING_SECT]  │   window budget             │   allocators     │   (N_phys - 2 at > 85°C)   │
└──────────────────────────┴─────────────────────────────┴──────────────────┴────────────────────────────┘
```

### 5.1 Latency, RAM & Information Preservation Budget

| Pipeline Stage | Latency Budget (Single Page) | Working RAM Allocation | Precision & Format | Information Preservation Metric |
| :--- | :--- | :--- | :--- | :--- |
| **Ingestion & SIMD Triage** | $\le 45\text{ ms}$ | $32\text{ MB}$ (Arena) | Native SIMD | $100\%$ text edge frequency preserved |
| **Catmull-Rom Dewarping** | $\le 680\text{ ms}$ | $180\text{ MB}$ (Arena) | FP16 / $C^1$ Spline | Zero sub/superscript low-pass blur |
| **Tri-Cue Layer Separation** | $\le 320\text{ ms}$ | $120\text{ MB}$ (Arena) | INT8 / Continuous $W_{\text{print}}$ | Zero erased fraction bars or radicals |
| **RT-DETR Polygon Layout** | $\le 210\text{ ms}$ | $68\text{ MB}$ (mmap) | INT8 ONNX | 4-channel layout with full ink visibility |
| **Relational Session Graph DB** | $\le 15\text{ ms}$ | $400\text{ MB}$ (SQLite WAL) | Native B-Tree | Section-scoped zero key collision |
| **RadixAttention VLM Forward** | $\le 5,800\text{ ms}$ | $2,050\text{ MB}$ (GGUF) | Q4_K_M (4-bit) | $\ge 97.5\%$ token match (NED $\le 0.02$) |
| **Fast-Forwarding Decoder** | $\le 180\text{ ms}$ | $16\text{ MB}$ (llguidance) | State Machine DFA | $100.0\%$ schema & delimiter determinism |
| **Pass 1 Memory Purge** | $\le 5\text{ ms}$ | $-1,200\text{ MB}$ (Eviction)| Instant Drop | Working RAM drops back to $\le 2.45\text{ GB}$ |
| **Total Single Page Pipeline** | **$\le 7.25\text{ s}$ ($\le 7.5\text{ s}$ target)** | **$\le 3.65\text{ GB}$ ($\le 3.8\text{ GB}$ target)** | **End-to-End** | **$0.00\%$ information loss** |

---

## 6. Cross-Platform Deployment & Hardware Topologies

### 6.1 Platform Backends

- **macOS (Apple Silicon M1+)**: Unified memory architecture. All models and weight tensors are loaded via `mmap` with `MAP_SHARED` and shared directly with the GPU via Metal Performance Shaders (MPS). Zero CPU-to-GPU memory copy overhead.
- **Windows 10/11 (x86_64, ARM64)**: Runs on discrete GPUs ($\ge 4\text{ GB}$ VRAM) via DirectML or CUDA. Patches are dispatched in $< 250\text{ ms}$ bursts with explicit DirectX 12 fence synchronizations to prevent WDDM Timeout Detection and Recovery (TDR) driver resets.
- **Linux (x86_64, glibc $\ge 2.31$)**: Automatically leverages CUDA if available; otherwise falls back to multithreaded CPU SIMD via OpenMP and AVX-512 F/BW instructions pinned to physical cores.

### 6.2 Bundled On-Disk Footprint Budget ($\le 2.6\text{ GB}$ packaged vs. $6.5\text{ GB}$ ceiling)

| Component | Format & Quantization | Packaged Size | Operational Role |
| :--- | :--- | :--- | :--- |
| **Heuristic Triage** | Native C++ / Rust SIMD | 14 MB | 8x8 tile polarity, Gabor, Laplacian triage |
| **Dewarping Engine** | FP16 ONNX (DocRes) | 38 MB | Manifold flow-field & crease displacement |
| **Layer Decomposer** | INT8 ONNX (Stroke U-Net) | 22 MB | Tri-cue ink vs. print toner attribution |
| **Layout Segmenter** | INT8 ONNX (RT-DETR) | 34 MB | 4-channel polygon bounding boxes |
| **Multimodal VLM** | GGUF Q4_K_M (Qwen2.5-VL-3B) | 1,920 MB | LaTeX math, text, options transcription |
| **Taxonomy Model** | GGUF Q8_0 (SmolLM2-360M) | 380 MB | Fallback subject/topic classification |
| **Headless Native Engine** | Rust Static/Shared C-ABI Lib + SQLite | 95 MB | Core headless engine, C-FFI API, session graph |
| **Grammar DFA Tables** | Static Trie Binary (`llguidance`) | 16 MB | State machines, token masks, GBNF rules |
| **Total Disk Package** | — | **2,519 MB** | **$\le 39\%$ of 6.5 GB upper ceiling** |

---

## 7. Concrete End-to-End Execution Trace

### Example Scenario: Graded Multi-Page Exam with Strike-Through & Gutter Answer Key

```text
[Input Capture: Page 2 of a Physics Assessment]
- Page gutter is curved (manifold curl).
- Question 14 stem starts on Page 2, but options (A-D) are at the top of Page 3.
- Student ticked option (B), crossed it out with dense scribble, and ticked option (C).
- Bottom margin contains an inverted 180° answer key: "Ans: 14-C, 15-A".
- Instructor marked a red ballpoint checkmark over option (C).

[Execution Trace]
1. Triage Gate (< 30ms): Laplacian variance = 194.2 (> 80), Gabor ratio = 0.62 (> 0.35). Passes gate.
2. Catmull-Rom Dewarp (540ms): Dense flow field F rectifies gutter curl. Gradient ||∇F|| = 1.1 (< 2.5). No tear.
3. Tri-Cue Layer Separation (290ms):
   - Student blue pen ink separated (ΔE = 14.2 > 3.0).
   - Instructor red checkmark separated into Tier 0 channel (a* = 48.5 > 25.0).
   - Continuous residual tensor W_print preserves printed text and formula fraction bars.
4. Layout & Continuity Linker (180ms):
   - Question 14 stem lacks terminal punctuation at bottom of Page 2.
   - Cross-Page Boundary FSM enters: PENDING_NEXT_PAGE.
   - Page 3 ingested: headless options (A, B, C, D) stitched to Question 14.
5. In-Situ Intent Analysis (Zhang-Suen):
   - Option (B): Crossing density C = 2, bounding box span = 68% (> 55%). Flagged STRIKE_OUT_CANCELLED -> - [ ].
   - Option (C): Single stroke checkmark, span = 19% (< 25%). Preserved.
6. Rotational Marginalia Triage:
   - Margin callout detected at 180°. Rotated by 180° -> OCR matches "Ans: 14-C".
   - Key inserted into scoped_answer_keys table.
7. Memory Purge (< 5ms):
   - High-res bitmaps for Page 2 and Page 3 explicitly dropped from RAM.
8. Pass 2 Hierarchy of Truth Reconciliation:
   - Tier 0 Teacher Red Check overrules all other sources.
   - Tier 1 Student Intent confirms (C).
   - Tier 2a Margin Key matches (C).
   - answerResolution.state = "teacher_graded", confidence = 0.98.
9. GBNF v3.0 Serialization:
   - Static schema tokens fast-forwarded into KV-cache.
   - Emitted standardized YAML Frontmatter v3.0 + LaTeX body + options + "\n=== question ===\n".
```

---

## 8. Quality Assurance, Benchmarks & Acceptance Criteria

The system must satisfy 100% of the empirical benchmarks across a randomized 500-page test suite:

| Evaluation Vector | Production Acceptance Threshold | Hard Failure Boundary (System Reject) | Production Mitigation / Enforcement |
| :--- | :--- | :--- | :--- |
| **Non-Academic Triage** | $> 99.2\%$ rejection in $< 50\text{ ms}$ | Model runs on receipt or code capture | Three-point gate: $\sigma_L^2 < 80 \lor \Phi_{\text{text}} < 0.35 \lor \sigma_{\Delta y}^2 < 1.2$. |
| **Dark / Inverted Media** | $> 99.0\%$ pass rate on blackboards | False rejection of valid dark slides | Tile-based local polarity mapping ($8 \times 8$) inverts inverted blocks only. |
| **Mathematical Accuracy** | $\ge 97.5\%$ token match (NED $\le 0.02$) | Variable hallucination ($k_B \to k_e$) | Qwen2.5-VL-3B-Instruct + post-decoding SymPy AST checker. |
| **Crease & Tear Integrity** | Zero hallucination on torn paper | Model guesses obscured equation terms | Coupled displacement gradient + shadow verification injects `[MISSING_SECTION]`. |
| **Identical Ink Separation** | $\ge 96.5\%$ precision | Erasing carbon gel-pen answers | Tri-cue decomposition: Color delta $\Delta E$, specular sheen $\mathcal{S}$, tremor $\Psi_{\text{tremor}}$. |
| **Layout Continuity** | $100\%$ sequential continuity | Line interleaving across columns | Column-Barrier Topological DAG blocks cross-gutter sorting edges. |
| **Answer Key Reconciliation** | $> 98.5\%$ correct reconciliation | Cross-section key overwrites | Section-scoped SQLite session graph (`session_id`, `section_scope`, `q_id`). |
| **Grammar Determinism** | $100.0\%$ over 10,000 runs | Token deadlock or parser crash | `llguidance` zero-mask catch with permissive UTF-8 byte stream fallback. |
| **Infinite Bracket Loops** | 0 context overflows | Autoregressive bracket generation loop | Token-budgeted GBNF grammar (max 800 tokens for body) with repetition penalties. |
| **Throughput & Latency** | Single Page $\le 7.5\text{ s}$; 10-Page $\le 70\text{ s}$ | Page processing exceeds $12.0\text{ s}$ | RadixAttention prefix caching + fast token forwarding on static YAML tokens. |
| **Windows GPU Stability** | Zero TDR driver crashes | DirectML runs $> 2\text{ s}$ without yielding | Vision transformer patches dispatched in $< 250\text{ ms}$ tiles with DirectX fences. |
| **System Memory Headroom** | Zero OOM panics across 1,000 pages | Heap crash or OS thrash freeze | Dynamic memory governor halts and emits `WARN_LOW_MEMORY` if free RAM $< 750\text{ MB}$. |
| **Zero-Loss Preservation** | $0.00\%$ loss of sub-pixel text or layer markers | Low-pass blur on subscripts or erased fraction bars | Catmull-Rom $C^1$ splines + continuous residual weight tensor $W_{\text{print}}$. |

---

## 9. Conclusion & Engineering Sign-Off

The High-Level Design of the **On-Device Academic Document Intelligence Engine (ADIE)** unifies cutting-edge computer vision, relational graph decoupling, and constrained neural decoding into a deterministic, air-gapped, and resource-bounded system. 

By eliminating the traditional pitfalls of monolithic multimodal models—such as multi-page memory bloat, low-pass blurring of mathematical notations, and conversational hallucinations—ADIE establishes a hardened, enterprise-grade foundation ready for immediate production engineering.
