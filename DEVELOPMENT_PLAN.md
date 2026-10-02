# Master Engineering Development Plan: Document Intelligence Engine (`documentIntelligenceEngine`)
### Core Native Backend Engine for the TakeMock Desktop Application

---

## 1. Plan Overview & Architectural Context

This document outlines the phased, end-to-end development roadmap for engineering the **Document Intelligence Engine (DIE)**—the core, air-gapped, on-device backend component of the **TakeMock** desktop application.

### 1.1 Non-Negotiable Targets & Guardrails
- **Operating Profile**: 100% local, air-gapped, 0 WAN socket calls.
- **Hardware Envelope**: Peak working RAM $\le 3.8\text{ GB}$ (hard limit 8.0 GB); total disk package $\le 2.6\text{ GB}$ (ceiling 6.5 GB).
- **Throughput**: Single page $\le 7.5\text{ s}$ ($\le 12.0\text{ s}$ ceiling); 10-page assessment $\le 70\text{ s}$ ($\le 90.0\text{ s}$ ceiling).
- **Headless Universal Interface**: Written in Rust, exposing an `extern "C"` C-ABI library (`.dylib`, `.dll`, `.so`) with async callbacks for SwiftUI (macOS), WinUI 3 (Windows), and Qt/GTK (Linux).
- **Zero-Loss Guarantee**: Sub-pixel coordinate pyramids, $C^1$ Catmull-Rom splines, non-destructive continuous residual tensor $W_{\text{print}}$, and RadixAttention fast-forwarding.

```text
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                ADIE Development Plan Architecture Flow                                 │
│                                                                                                        │
│  Phase 0: Workspace & Tooling Scaffolding ──► Phase 1: Domain Types & SQLite Graph DB                  │
│                                                          │                                             │
│  Phase 3: Manifold Dewarp & Crease Split ◄── Phase 2: SIMD Triage Gate (≤ 45ms CPU)                   │
│         │                                                                                              │
│         ▼                                                                                              │
│  Phase 4: Non-Destructive Tri-Cue Layer Separation (Toner vs. Gel Pen vs. Red Ink)                     │
│         │                                                                                              │
│         ▼                                                                                              │
│  Phase 5: 4-Channel Layout DAG & Cross-Page State Machine ──► [PASS 1 BITMAP MEMORY PURGE]             │
│                                                                      │                                 │
│  Phase 7: Neural VLM & Fast-Forward GBNF Decoder ◄── Phase 6: Relational Reconciliation & Truth FSM    │
│         │                                                                                              │
│         ▼                                                                                              │
│  Phase 8: Multi-Format Serialization (YAML 3.0 & TakeMock CBT JSON)                                    │
│         │                                                                                              │
│         ▼                                                                                              │
│  Phase 9: Universal C-ABI (`die-c-abi`) & Swift/C#/C++ Platform Bindings                               │
│         │                                                                                              │
│         ▼                                                                                              │
│  Phase 10: OS Resource Governors (DirectML/Darwin) & 500-Page Verification Suite                       │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Phased Development Roadmap

### Phase 0: Workspace Architecture, Crate Scaffolding & Toolchain Setup
**Goal**: Establish a modular, multi-crate Rust workspace with platform-specific feature flags and continuous benchmarking.

- [ ] **Task 0.1: Initialize Cargo Workspace**:
  Create workspace `Cargo.toml` with three core crates:
  - `crates/document-intelligence-core`: Pure engine logic, algorithms, models, and graph solver.
  - `crates/document-intelligence-c-abi`: Universal C-ABI wrapper (`extern "C"`), dynamic/static library exports, and C header generation.
  - `crates/document-intelligence-cli`: Headless CLI runner for developer diagnostics, automated test harnesses, and benchmarking.
- [ ] **Task 0.2: Configure Hardware Acceleration Feature Flags**:
  - `metal`: Apple Silicon MPS backend (`llama.cpp` + Metal shaders).
  - `directml`: Windows DirectX 12 / DirectML chunked fence backend.
  - `cuda`: Linux / Windows NVIDIA GPU acceleration.
  - `avx512`: CPU SIMD fallback for non-GPU execution.
- [ ] **Task 0.3: Dependency Matrix Setup**:
  Pin verified crate versions:
  - `rayon = "1.10"` (multithreading data-flow)
  - `rusqlite = { version = "0.31", features = ["bundled"] }` (in-memory WAL database)
  - `image = "0.25"` & `imageproc = "0.24"` (CPU image decoding & SIMD filters)
  - `ort = "=2.0.0-rc.4"` (ONNX Runtime bindings)
  - `llama-cpp-2 = "0.1"` (or direct `llama.cpp` C++ submodule binding)
  - `llguidance = "0.6"` (fast-forwarding grammar state machine)
  - `sysinfo = "0.30"` (memory pressure and thermal monitoring)
  - `cbindgen = "0.26"` (C99 header generation)

---

### Phase 1: Core Domain Types, Errors & Relational Session Graph Subsystem
**Goal**: Implement the foundational data structures and the embedded SQLite session graph engine with section scoping.

- [ ] **Task 1.1: Define Core Domain Types & DTOs**:
  Implement `QuestionRecord`, `OptionItem`, `AnswerResolutionState`, `ConflictAudit`, and `SectionScope` with `serde` serialization.
- [ ] **Task 1.2: Implement Error Hierarchy (`DIEError`)**:
  Build strongly typed error enumerations (`UnrecoverableBlur`, `NonAcademicImage`, `NonAcademicLayout`, `CreaseOcclusion`, `WarnLowMemory`, `TdrTimeout`, `DeadlockRecovered`).
- [ ] **Task 1.3: Embed SQLite Session Graph Engine (WAL Mode)**:
  Implement `SessionGraphDatabase`:
  - Enforce schema: `session_sections`, `session_questions`, `scoped_answer_keys`.
  - Primary key isolation: `PRIMARY KEY(session_id, section_id, question_numeral)`.
  - Configure SQLite pragmas: `journal_mode = WAL`, `synchronous = NORMAL`, `temp_store = MEMORY`.
- [ ] **Task 1.4: Unit Tests for Session Graph**:
  Test multi-section insertion (e.g. Set A vs Set B) to verify zero key collisions.

---

### Phase 2: Ultra-Fast Optical Ingestion & SIMD Triage Engine ($\le 50\text{ ms}$)
**Goal**: Build a pure CPU SIMD gate that filters out receipts, clutter, and unrecoverable blur in $< 50\text{ ms}$ before allocating neural memory.

- [ ] **Task 2.1: SIMD Proxy Downsampler**:
  Downsample input image bytes to a lightweight 720p L-channel luminance proxy buffer in $< 12\text{ ms}$.
- [ ] **Task 2.2: Adaptive Tile Polarity Normalization**:
  Implement the $8 \times 8$ local tile grid:
  - Calculate tile median $\text{Median}(T_{i,j})$ and Canny edge density.
  - Invert dark tiles ($T'_{i,j} = 255 - T_{i,j}$) where $\text{Median} < 100 \land \text{density} > 0.04$.
  - Normalizes blackboards, dark-theme tablets, and dark header banners.
- [ ] **Task 2.3: Focus Variance ($\sigma_L^2$) Evaluator**:
  Compute Laplacian kernel convolution over proxy. If $\sigma_L^2 < 80.0$, return `ERR_UNRECOVERABLE_BLUR`.
- [ ] **Task 2.4: Gabor Periodicity ($\Phi_{\text{text}}$) & Line Spacing ($\sigma_{\Delta y}^2$) Gate**:
  - Gabor energy ratio: If $\Phi_{\text{text}} < 0.35$ and edge density $< 0.04$, reject with `ERR_NON_ACADEMIC_IMAGE`.
  - Vertical line spacing variance: If $\sigma_{\Delta y}^2 < 1.2$ and aspect ratio $> 2.5$, reject with `ERR_NON_ACADEMIC_LAYOUT` (receipts / terminal logs).
- [ ] **Task 2.5: Benchmark Suite for Triage Gate**:
  Validate that 100% of receipts, code logs, and blurry photos are rejected in $\le 45\text{ ms}$.

---

### Phase 3: Manifold Dewarping & Crease Discontinuity Protection
**Goal**: Rectify tight book gutters and textbook spines with zero text blur, while halting interpolation across sharp creases to prevent hallucination.

- [ ] **Task 3.1: DocRes Flow-Field Model Loader**:
  Load quantized FP16/INT8 DocRes ONNX model into `ort` session to predict dense flow field $F \in \mathbb{R}^{H \times W \times 2}$.
- [ ] **Task 3.2: 16-Pixel Catmull-Rom Bicubic Spline Resampler**:
  Implement backward coordinate remapping using the Catmull-Rom kernel ($\alpha = -0.5$):
  $$W(t) = \begin{cases} 1.5 |t|^3 - 2.5 |t|^2 + 1 & |t| \le 1 \\ -0.5 |t|^3 + 2.5 |t|^2 - 4 |t| + 2 & 1 < |t| \le 2 \\ 0 & \text{otherwise} \end{cases}$$
  Maintains $C^1$ continuity and eliminates low-pass blur on subscripts and dots on $i, j$.
- [ ] **Task 3.3: Coupled Gradient-Photometric Crease Splitter**:
  Compute gradient tensor field $J_F = \nabla F$.
  - If $\|\nabla F\|_2 > 2.5 \land \|\nabla I_{\text{photometric}}\| > \tau_{\text{shadow}}$: segment into sub-patches A and B.
  - Halt cross-crease pixel interpolation and inject `[MISSING_SECTION]`.
- [ ] **Task 3.4: Sub-Pixel Coordinate Transformation Engine**:
  Map all feature points and bounding boxes between normalized downsampled coordinates and high-res sensor coordinates without rounding errors.

---

### Phase 4: Non-Destructive Tri-Cue Layer Decomposition & Stroke Classifier
**Goal**: Untangle identical carbon-black student gel-pen ink from printer toner without destructively inpainting base text.

- [ ] **Task 4.1: Tri-Cue Physical Feature Extractor**:
  Compute three physical metrics for each stroke candidate $s(t)$:
  1. **Color Delta**: $\Delta E = \sqrt{\Delta a^2 + \Delta b^2}$ in CIE-Lab space.
  2. **Specular Sheen**: $S = \frac{I_{\text{direct}}}{I_{\text{diffuse}}}$ (distinguishes shiny gel/graphite from matte toner).
  3. **Stroke Curvature Tremor**: $\Psi_{\text{tremor}} = \frac{1}{L} \int_0^L |\kappa'(s)|\, ds$ (human neuromuscular tremor).
- [ ] **Task 4.2: Continuous Residual Weight Tensor ($W_{\text{print}}$)**:
  Generate attribution tensor $W_{\text{print}} \in [0, 1]^{H \times W}$. Printed text, division fraction bars, and radical roots are preserved without destructive erasure.
- [ ] **Task 4.3: Dual-Channel Annotation Routing**:
  - Blue/black student ink $\to$ Frame B (Student Layer).
  - Red instructor grading pen ($a^* > 25$) $\to$ Frame B Tier 0 (Grading Layer).
- [ ] **Task 4.4: Zhang-Suen Scale-Aware Strike-Through Engine**:
  Skeletonize strokes inside option bounds. Compute crossing density $C_{\text{stroke}}$:
  - If $C_{\text{stroke}} \ge 1$ and bounding box span $> 55\% \to$ mark `STRIKE_OUT_CANCELLED` and force to `- [ ]`.
  - If span $< 25\% \to$ preserve as valid algebraic variable '$x$'.
- [ ] **Task 4.5: Numerical Dimensional Lexer**:
  Isolate final values and units from inline scratch calculations using spatial enclosure filters and regex (`r"([+-]?[0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z\mu\Omega/^\-]+)?"`).

---

### Phase 5: 4-Channel Layout Detection, DAG Reading Order & Boundary State Machine
**Goal**: Detect layout regions on 4-channel tensors ($\text{RGB} + \text{Frame B Mask}$), build column topological DAGs, and resolve cross-page breaks.

- [ ] **Task 5.1: RT-DETR-DocLayNet 4-Channel Inference**:
  Run INT8 RT-DETR layout model to predict 8-point polygon bounding boxes for `Question_Container`, `Option_Block`, `Diagram_Figure`, `Table_Grid`, `Answer_Key_Matrix`, `Marginalia_Metadata`.
- [ ] **Task 5.2: Column-Barrier Reading Order DAG**:
  Build directed acyclic graph blocking cross-gutter directed edges. Topologically sort blocks to guarantee Column 1 is completed before Column 2 begins.
- [ ] **Task 5.3: Cross-Page Question Continuation State Machine**:
  - Inspect terminal block $B_{\text{last}}$ on Page $N$.
  - If it lacks terminal punctuation $\to$ set state to `PENDING_NEXT_PAGE` and buffer question ID.
  - On Page $N+1$, stitch initial headless options $B_{\text{first}}$ directly to the buffered question ID.
- [ ] **Task 5.4: Rotational Marginalia Parser**:
  Classify marginalia orientations ($0^\circ, 90^\circ, 180^\circ, 270^\circ$). Un-rotate inverted text, OCR, and insert into `scoped_answer_keys`.
- [ ] **Task 5.5: Immediate Pass 1 Bitmap Memory Purge**:
  Explicitly drop uncompressed high-resolution bitmaps (`drop(raw_bitmap)`). Assert working RAM drops back to $\le 2.45\text{ GB}$ before the next page is processed.

---

### Phase 6: Relational Session Graph Solver & Hierarchy of Truth
**Goal**: Reconcile intra-page footers, distant matrix keys, and handwritten markings into verified question solutions.

- [ ] **Task 6.1: Pass 2 SQL Relational Reconciliation Queries**:
  Execute indexed relational joins linking `session_questions` with `scoped_answer_keys` using section-scoped primary keys.
- [ ] **Task 6.2: Hierarchy of Truth Decision Engine**:
  Implement the deterministic precedence resolver:
  - **Tier 0**: Instructor Red Ink ($a^* > 25$, confidence = 0.98) $\succ$
  - **Tier 1**: Student Annotation (human check/text, confidence = 0.95) $\succ$
  - **Tier 2a**: Same-Page Footer / Margin Key (confidence = 1.00) $\succ$
  - **Tier 2b**: Distant Page Answer Matrix (e.g. Page 8, confidence = 1.00) $\succ$
  - **Tier 3**: Unresolved Clean Assessment (confidence = 0.00, distractors `- [ ]`).
- [ ] **Task 6.3: Conflict Audit Logger**:
  If candidate sources disagree (e.g. Student ticked B, but key says C), serialize disagreement into `answerResolution.conflictAudit`.

---

### Phase 7: Neural Multimodal Compilation & Fast-Forwarding GBNF Decoder
**Goal**: High-fidelity mathematical and text transcription using `Qwen2.5-VL-3B-Instruct` with logit-constrained grammar decoding.

- [ ] **Task 7.1: Model Packaging & `llama.cpp` Integration**:
  Integrate `llama.cpp` runtime with GGUF Q4_K_M quantization (~1.92 GB). Ensure Metal (macOS), DirectML (Windows), and AVX-512 (Linux) backend bindings.
- [ ] **Task 7.2: RadixAttention Persistent Prefix Caching**:
  Cache system prompts and assessment instructions in a persistent prefix tree. Drop TTFT from $1,800\text{ ms}$ to $< 85\text{ ms}$ per question entity.
- [ ] **Task 7.3: `llguidance` GBNF v3.0 Grammar Compilation**:
  Compile GBNF v3.0 grammar into DFA trie tables. Enforce strict YAML frontmatter, inline math `$..$`, display math `$$\n..\n$$`, and `=== question ===` delimiters.
- [ ] **Task 7.4: Fast Token Forwarding (KV Splicing)**:
  Whenever the grammar DFA has a deterministic path of length $K$, bypass neural forward passes and splice embeddings directly into the KV-cache ($2.5\times$ frontmatter speedup).
- [ ] **Task 7.5: Zero-Mask Rollback & Bracket Repetition Breaker**:
  - Zero-mask deadlock: Roll back 1 token and unclamp grammar to permissive UTF-8 byte stream collector (`raw_unicode_sequence`).
  - Sliding 16-token repetition window: Suppress repeated closing bracket tokens (`\right]`).

---

### Phase 8: Modular Multi-Format Serialization Architecture
**Goal**: Provide pluggable serializers so TakeMock can export questions into multiple formats without modifying the core pipeline.

- [ ] **Task 8.1: Define `QuestionSerializer` Trait**:
  ```rust
  pub trait QuestionSerializer: Send + Sync {
      fn serialize(&self, questions: &[QuestionRecord]) -> Result<String, DIEError>;
  }
  ```
- [ ] **Task 8.2: Implement Canonical YAML Frontmatter v3.0 Adapter**:
  Serializes strictly typed YAML 3.0 + LaTeX + `\n=== question ===\n` records.
- [ ] **Task 8.3: Implement TakeMock CBT JSON Adapter**:
  Serializes directly into the interactive test-bank schema consumed by the TakeMock CBT Exam player.
- [ ] **Task 8.4: Multi-Format Verification Tests**:
  Ensure both serializers validate against strict JSON/YAML schemas with zero syntax errors.

---

### Phase 9: Universal Headless C-ABI (`die-c-abi`) & Platform UI Bindings
**Goal**: Compile the engine into a universal dynamic/static library and provide idiomatic native wrappers for macOS, Windows, and Linux.

- [ ] **Task 9.1: Implement Universal C-ABI in `crates/document-intelligence-c-abi`**:
  Implement thread-safe C99 API:
  - `die_engine_init()`, `die_engine_destroy()`
  - `die_session_ingest_page()`, `die_session_export()`
  - Asynchronous progress callback: `(*DIEProgressCallback)(event_type, current, total, payload, user_data)`
  - Memory cleanup: `die_string_free()`
- [ ] **Task 9.2: Auto-Generate C Header (`document_intelligence_engine.h`)**:
  Configure `cbindgen.toml` to automatically emit standard C99 header during build.
- [ ] **Task 9.3: macOS Swift / SwiftUI Binding (`DocumentIntelligenceEngine.swift`)**:
  Create Swift Package wrapping the `.dylib` or `.a`, mapping C callbacks to Swift `AsyncStream` / `@MainActor` published properties.
- [ ] **Task 9.4: Windows C# / WinUI 3 Binding (`DocumentIntelligenceEngine.cs`)**:
  Implement .NET P/Invoke `[DllImport]` class with delegates marshaling progress events to the WinUI `DispatcherQueue`.
- [ ] **Task 9.5: Linux C++ / Qt6 Binding (`die_qt.hpp`)**:
  Implement a `QObject` wrapper emitting native Qt signals (`emit pageProgress()`).

---

### Phase 10: OS Governors, Hardening & 500-Page Quality Acceptance Suite
**Goal**: Guarantee OS stability (zero TDR resets, zero OOMs, zero swap thrashing) and validate against the 500-page empirical benchmark.

- [ ] **Task 10.1: Windows DirectML $< 250\text{ ms}$ Chunked Fences**:
  Chunk Vision Transformer patch processing into execution bursts $< 250\text{ ms}$ with explicit DirectX 12 fences to eliminate WDDM TDR resets.
- [ ] **Task 10.2: macOS Darwin Memory Pressure Watchdog**:
  Subscribe to `DISPATCH_SOURCE_TYPE_MEMORYPRESSURE`:
  - On `WARN`: Evict LRU dewarping tiles.
  - On `CRITICAL`: Pause queue and emit `WARN_LOW_MEMORY` if system free RAM $< 750\text{ MB}$.
- [ ] **Task 10.3: Dynamic Thermal & Battery Scaler**:
  Pin Rayon threads to physical cores ($N_{\text{physical}}$). Throttle to $N_{\text{physical}} - 2$ if CPU junction temp $> 85^\circ\text{C}$ or if running on battery.
- [ ] **Task 10.4: Automated 500-Page Empirical Test Harness**:
  Implement test runner in `crates/document-intelligence-cli` verifying all 13 benchmarks:
  - Non-academic triage rejection $> 99.2\%$ in $< 50\text{ ms}$
  - Mathematical accuracy $\ge 97.5\%$ (NED $\le 0.02$)
  - Crease/tear occlusion integrity (100% `[MISSING_SECTION]`, zero hallucination)
  - Identical ink precision $\ge 96.5\%$
  - Single page latency $\le 7.5\text{ s}$; 10-page batch $\le 70\text{ s}$
  - Working RAM peak $\le 3.8\text{ GB}$; zero OOMs across 1,000 continuous pages.

---

## 3. Milestones, Deliverables & Verification Gates

```text
Milestone 1 (Foundations)   ──► Phase 0 + Phase 1 (Workspace, Domain Models, SQLite WAL Graph)
Milestone 2 (Perception)    ──► Phase 2 + Phase 3 + Phase 4 (SIMD Triage, Dewarp, Tri-Cue Layer)
Milestone 3 (Layout & Purge)──► Phase 5 + Phase 6 (Layout DAG, Cross-Page FSM, Memory Purge, Truth)
Milestone 4 (AI & Grammar)  ──► Phase 7 + Phase 8 (VLM Inference, GBNF Fast-Forward, Serializers)
Milestone 5 (C-ABI & UI)    ──► Phase 9 (Universal C-ABI, Swift / C# / C++ platform wrappers)
Milestone 6 (Hardening)     ──► Phase 10 (OS Governors, TDR Fences, 500-Page Benchmark Gate)
```

| Milestone | Deliverables | Verification Exit Criteria |
| :--- | :--- | :--- |
| **M1: Core Engine Skeleton** | Rust workspace, domain models, SQLite schema, test DB harness. | Unit tests pass for section-scoped primary keys; zero database lock contention under multithreaded writes. |
| **M2: Optical CV & Triage** | SIMD triage gate, Catmull-Rom resampler, DocRes ONNX model, tri-cue ink classifier. | Triage rejects receipts in $< 45\text{ ms}$; Catmull-Rom retains dots/subscripts; tri-cue separates gel ink with $\ge 96.5\%$ precision. |
| **M3: Layout & Relational Graph** | 4-channel RT-DETR layout model, reading order DAG, cross-page state machine, Hierarchy of Truth. | Reading order prevents column interleaving; Page $N/N+1$ stitch passes; uncompressed bitmaps purged from RAM immediately. |
| **M4: Neural Decoding & Formats** | `llama.cpp` Qwen2.5-VL Q4_K_M, `llguidance` GBNF engine, YAML 3.0 & TakeMock CBT JSON serializers. | Fast token forwarding delivers $\ge 2.0\times$ speedup; 0% grammar deadlocks; SymPy NED $\le 0.02$. |
| **M5: Universal C-ABI** | `libdocument_intelligence_engine` shared/static lib, `document_intelligence_engine.h`, Swift / C# / C++ bindings. | Swift sample app on macOS and C# sample app on Windows link and stream progress events at 60 FPS without UI stalls. |
| **M6: Production Hardening** | DirectML fences, Darwin memory pressure listener, thermal scaler, 500-page automated benchmark runner. | All 13 production thresholds satisfied; 0 TDR driver resets; peak RAM strictly $\le 3.8\text{ GB}$; 10-page session $\le 70\text{ s}$. |

---

## 4. Immediate Next Step: Phase 0 Execution

To kick off development immediately:
1. **Initialize the Cargo workspace** in `/Users/ashutoshkumar/takemock`.
2. Configure `Cargo.toml` with the three crate targets (`core`, `c-abi`, `cli`).
3. Set up initial feature flags and dependency manifests for macOS Metal, Windows DirectML, and Linux AVX-512.
