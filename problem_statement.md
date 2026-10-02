# Detailed Engineering Problem Statement: On-Device Academic Document Intelligence Engine (ADIE)

## 1. System Vision & Core Objective
The objective is to architect and build an entirely local, air-gapped, cross-platform desktop engine (macOS, Windows, Linux) capable of ingesting arbitrary, uncontrolled, non-planar photographic captures of academic assessments (exam papers, problem sets, textbook pages, and answer sheets) and compiling them into a strictly typed, standardized machine-readable format (YAML Frontmatter v3.0 + LaTeX/Markdown + `=== question ===` delimiters) without external network calls, conversational filler, or structural hallucinations.

The system is strictly an extraction, layer isolation, structural reconstruction, and relational metadata inference engine; it does not compute mathematical solutions, evaluate physics derivations, or execute symbolic derivations by default.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 ADIE System Boundary                                   │
│                                                                                        │
│  [Raw Adverse Optical Input]     [ADIE Hardened Local Desktop Pipeline] [Target Contract]│
│  - Non-planar manifold folds     - Tile-Based Adaptive Triage (OpenCV) - Strict YAML 3.0 │
│  - Fold self-occlusion           - Catmull-Rom Discontinuous Dewarp    - Clean LaTeX Math│
│  - Identical carbon-black ink ──►- Non-Destructive Tri-Cue Layer Split ──►- Provenance Audit│
│  - Split stems across pages      - Relational Session Graph (SQLite)   - [MISSING_SECTION]
│  - Heterogeneous / rotated keys  - Fast-Forwarding Logit Decoder (GBNF)- Zero Drift / Filler│
│                                                                                        │
│  [Air-Gapped: Zero WAN]          [Memory Envelope: ≤ 3.8 GB Working RAM][Determinism: 100%] │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Execution Constraints & Physical Hardware Envelope
The engine must execute deterministically on standard consumer-grade personal computers without requiring dedicated enterprise compute or external network access.

| Dimension | Specification Ceiling | Operational Target |
| :--- | :--- | :--- |
| **Target Platforms** | macOS (Apple Silicon M1+), Windows 10/11 (x86_64, ARM64), Linux (x86_64, glibc $\ge 2.31$). | Unified codebase in Rust with native OS integration. |
| **Network Profile** | Zero WAN access. Completely air-gapped runtime. | 0 outbound network calls; all models, weights, tokenizers, and grammars locally bundled. |
| **Memory Allocation** | Hard upper ceiling: 8.0 GB System RAM / Unified Memory. | Active working set during peak inference: $\le 3.8\text{ GB}$ ($\le 4.1\text{ GB}$ maximum safety boundary). |
| **VRAM Footprint** | Dynamic: Supports shared unified memory (Metal) and discrete VRAM (CUDA/DirectML $\ge 4\text{ GB}$). | Fallback to multi-threaded CPU SIMD (AVX-512 / NEON) if discrete GPU is unavailable or constrained. |
| **Throughput & Latency** | Single page: $\le 7.5\text{ seconds}$ ($\le 12.0\text{ s}$ ceiling). Session batch (10 pages): $\le 70\text{ seconds}$ ($\le 90.0\text{ s}$ ceiling). | Real-time visual progress streaming without dropping desktop UI below 60 FPS. |
| **Package Footprint** | Total on-disk footprint (runtime + compiled weights): $\le 2.6\text{ GB}$ ($\le 6.5\text{ GB}$ ceiling). | Models quantized to 4-bit / 8-bit precision (GGUF Q4_K_M / INT8 ONNX). |
| **OS Stability** | Zero Display Driver Resets (TDR) and Zero Swap Thrashing. | DirectML chunked $< 250\text{ ms}$ GPU fences; native Darwin memory pressure cache eviction. |

---

## 3. Adverse Input Taxonomy & Environmental Entropy

```text
Input Document Entropy
                                        │
     ┌──────────────────┬───────────────┴───────────────┬──────────────────┐
     ▼                  ▼                               ▼                  ▼
┌──────────────┐ ┌──────────────┐               ┌──────────────┐ ┌──────────────────┐
│ Non-Academic │ │  Geometric & │               │  Structural  │ │   Dual-Stream    │
│    Noise     │ │ Optical Blur │               │  Topological │ │  Human Artifacts │
├──────────────┤ ├──────────────┤               ├──────────────┤ ├──────────────────┤
│• Receipts    │ │• Book spines │               │• Multi-column│ │• Pencil scribbles│
│• Landscapes  │ │• Creases/rips│               │• Split keys  │ │• Option ticks [x]│
│• Screenshots │ │• Harsh shade │               │• Wrap text   │ │• Inline answers  │
│• Clutter     │ │• Low contrast│               │• Embedded fig│ │• Written tags    │
└──────────────┘ └──────────────┘               └──────────────┘ └──────────────────┘
```

The system must consume images captured under adverse real-world conditions without requiring flatbed scanning or manual alignment.

### 3.1 Non-Academic Noise & Input Invalidation
The system must reject irrelevant imagery prior to deep model dispatch in $\le 50\text{ ms}$:

- **Natural Imagery & Clutter:** Non-target captures (landscapes, portraits, identity cards, room interiors).
- **High-Contrast Monospace False Targets:** Structured non-academic documents (store receipts, terminal logs, code screenshots) that exhibit text-like edge frequencies but lack academic equation distributions.
- **Severe Physical Degradation:** Completely out-of-focus captures, extreme motion blur, or bleached flash glare where text frequency is statistically indistinguishable from noise.

### 3.2 Optical, Sensor & Illumination Noise
- **Mixed Polarity & Dark-Theme Documents:** Inverted media such as white chalk on blackboards, dark-mode tablet screenshots, or pages featuring dark banner headers above light printed body text.
- **Directional Shadows & Specular Flare:** Cast shadows from user hands, mobile phone silhouettes, uneven ambient light falloff, page yellowing, and high-frequency graphite sheen under flash illumination.
- **Substrate Artifacts:** Ink bleed-through from reverse pages, coffee stains, paper tears, punch holes, and crinkled thermal paper.

### 3.3 Geometric & Manifold Deformations
- **Non-Planar Manifolds:** Severe page curvature originating from tight book gutters, warped textbook spines, and curled document edges.
- **Discontinuous Creases & Fold Self-Occlusion:** Sharp paper folds where a paper flap physically occludes underlying printed characters, creating non-differentiable displacement gradients in coordinate space ($\|\nabla F\| \to \infty$).
- **Perspective & Affine Skew:** Angled camera captures producing trapezoidal foreshortening, non-rectangular aspect ratios, and uneven focal distances across the page.

### 3.4 Structural & Topological Layout Complexity
- **Non-Standard Reading Orders:** Arbitrary multi-column configurations (e.g., transitioning from a full-width header to two unequal columns, switching to three columns, and returning to full-width text mid-page).
- **Irregular Geometric Enclosure:** Text dynamically wrapping around circular circuit schematics, floating proof boxes, or irregular chemical diagrams.
- **Cross-Page Question Splitting:** Multi-page continuity breaks where a question stem begins at the bottom of Page $N$, while its child option blocks or diagram appear at the top of Page $N+1$.
- **Detached & Distributed Answer Keys:** Answer matrices decoupled from questions across the session (e.g., questions on Pages 1–4, with answers printed in a compact table on Page 8, or printed upside-down in the footer margin of Page 2).

### 3.5 Dual-Stream Human Interaction & Handwriting Intent
The document contains two concurrent layers that must not be merged naively:
- **Base Print Layer:** Mechanically typeset fonts, publisher layouts, diagrams, tables, and formal problem numbers.
- **Annotation Layer (Human Ink):** Manual pencil/pen markings of varying pressure, contrast, and style.

The annotation layer introduces multi-intent semantic conflicts that must be classified rather than cleaned:

```text
Handwriting Intent Routing
                                       │
        ┌──────────────────┬───────────┴───────────┬──────────────────┐
        ▼                  ▼                       ▼                  ▼
┌────────────────┐ ┌────────────────┐      ┌────────────────┐ ┌────────────────┐
│   Metadata     │ │  Option Choice │      │ Inline Answer  │ │ Scratch/Noise  │
├────────────────┤ ├────────────────┤      ├────────────────┤ ├────────────────┤
│"Topic: Optics" │ │Tick on Option B│      │"Paris" inside  │ │Formula draft,  │
│"Marks: 4"      │ │Circled letter  │      │blank line:     │ │doodles, "WTF"  │
│"Subject: Math" │ │Cross on box    │      │"_____"         │ │strike-through  │
└───────┬────────┘ └───────┬────────┘      └───────┬────────┘ └───────┬────────┘
        │                  │                       │                  │
        ▼                  ▼                       ▼                  ▼
 [Override System]  [Map to Field: - [x]]   [Fill correctValue]  [Discard/Ignore]
```

#### Complex In-Situ Marking Scenarios
- **Identical Carbon-Black Ink:** Student ballpoint or gel-pen ink matching the exact chrominance of printer carbon toner ($a^* \approx 0, b^* \approx 0$).
- **Crossed-Out Corrections:** An option initially marked with a tick, subsequently crossed out with a dense scribble, followed by a new option marked with a tick.
- **Algebraic Variable '$x$' vs. Strike-Out '✗':** Differentiating a student writing the variable $x$ in an answer blank from a crossing-out gesture.
- **Dual-Pen Instructor vs. Student Conflict:** Graded assessments containing student graphite pencil marks overlaid with instructor red ballpoint checkmarks or corrections.
- **Numerical Inline Scratchpad Contamination:** Student working steps and rough calculations scribbled directly inside fill-in-the-blank spaces alongside the final value.

### 3.6 Specialized STEM Domain Notations
- **Mathematics:** High-nesting fractions, tensor indices, matrices, piecewise functions, Dirac bra-ket notations, and non-Latin variables. Must preserve font-weight semantics (e.g., bold vector $\mathbf{v}$ vs. italic scalar $v$).
- **Chemistry:** Skeletal molecular structures, stereochemical wedge/dash bonds, reaction equilibrium arrows ($\rightleftharpoons$), and isotopic notation.
- **Physics & Engineering:** Vector diagrams, circuit schematics, free-body force arrows, and truth-table state trees.

---

## 4. Processing, Information Preservation & Semantic Reconciliation Requirements

### 4.1 Ingestion & Heuristic Triage Phase ($\le 50\text{ ms}$)
Must evaluate image viability using SIMD CPU algorithms without initializing neural runtimes.

- **Adaptive Polarity Normalization:** Partition image into an $8 \times 8$ grid of local tiles. If a tile satisfies $\text{Median}(T_{i,j}) < 100$ and Canny edge density $> 0.04$, invert that tile ($T'_{i,j} = 255 - T_{i,j}$), preserving surrounding black-on-white text.
- **Frequency Periodicity:** Compute directional Gabor energy ratio $\Phi_{\text{text}}$. If $\Phi_{\text{text}} < 0.35$ and edge density $< 0.04$, reject with `ERR_NON_ACADEMIC_IMAGE`.
- **Monospace Rejection:** Calculate variance of vertical line spacing $\sigma_{\Delta y}^2$. If $\sigma_{\Delta y}^2 < 1.2$ and aspect ratio $> 2.5$, reject receipts/code screenshots with `ERR_NON_ACADEMIC_LAYOUT`.
- **Focus Variance:** If focus variance $\sigma_L^2 < 80.0$, return `ERR_UNRECOVERABLE_BLUR`.

### 4.2 Geometric Rectification & Zero-Loss Layer Separation
- **Discontinuous Manifold Rectification:** Estimate dense flow field $F$. If displacement gradient $\|\nabla F\|_2 > 2.5$ and photometric shadow verification confirms a crease crevasse, segment into sub-patches and inject `[MISSING_SECTION]`. Halt cross-crease pixel interpolation to prevent formula hallucination.
- **Catmull-Rom Bicubic Resampling:** Remap planar coordinates using a 16-pixel Catmull-Rom spline kernel ($\alpha = -0.5$) to prevent low-pass blurring of dots on $i$, prime marks $f'(x)$, and subscripts.
- **Non-Destructive Residual Layer Decomposition:** Do not destructively inpaint student ink on Frame A. Generate a continuous Pixel Attribution Weight Tensor $W_{\text{print}} \in [0, 1]^{H \times W}$.
- **Tri-Cue Ink Disambiguation:** Disambiguate identical carbon-black ink from toner using Color Delta $\Delta E$, Surface Specular Sheen $S = \frac{I_{\text{direct}}}{I_{\text{diffuse}}}$, and Stroke Curvature Tremor $\Psi_{\text{tremor}} = \frac{1}{L} \int_0^L |\kappa'(s)|\, ds$. If $\Psi_{\text{tremor}} > 0.42$ or $S > 1.8$, route to Annotation Ink (Frame B).
- **Dual-Channel Annotation Routing:** Isolate student ink (pencil/blue) from instructor grading ink (red channel $a^* > 25$).

### 4.3 Spatial Grounding, Layout DAG & Session Linker
- **4-Channel Polygon Layout Segmentation:** Segment page into `Question_Container`, `Option_Block`, `Diagram_Figure`, `Table_Grid`, `Answer_Key_Matrix`, and `Marginalia_Metadata` using 8-point polygon oriented bounding boxes (OBB) over a 4-channel tensor ($\text{RGB} + \text{Frame B Mask}$).
- **Column-Barrier Reading Order DAG:** Formulate a topological DAG blocking cross-gutter sorting edges, preventing cross-column sentence interleaving.
- **Cross-Page Boundary State Machine:** If a question container at the bottom of Page $N$ lacks terminal punctuation or options, enter `PENDING_NEXT_PAGE`. Merge with headless option blocks at the top of Page $N+1$ before dispatching to the decoder.

### 4.4 In-Situ Intent & Rotational Marginalia Triage
- **Scale-Aware Strike-Through Analysis:** Skeletonize strokes inside option bounds using Zhang-Suen thinning. Compute crossing density $C_{\text{stroke}}$. If $C_{\text{stroke}} \ge 1$ and stroke bounding box spans $> 55\%$ of the option block, mark as `STRIKE_OUT_CANCELLED` and force to `- [ ]`. If stroke spans $< 25\%$ (e.g., algebraic variable '$x$'), preserve as valid content.
- **Numerical Terminal Extraction:** Isolate numerical answers and physical units from inline scratch calculations using spatial enclosure filters and dimensional regex lexers (`r"([+-]?[0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z\mu\Omega/^\-]+)?"`).
- **Marginalia Rotational Parser:** Classify marginalia blocks across 4 orientations ($0^\circ, 90^\circ, 180^\circ, 270^\circ$). Un-rotate inverted text blocks before parsing footer/gutter answer keys.

### 4.5 Relational Session Graph & Asynchronous Two-Pass Execution
To handle single pages containing mixed question states (some marked in ink, some solved in same-page footers, some solved on distant pages, and some blank), the engine must decouple processing into two passes:

- **Pass 1 (Streaming Entity Harvesting):** Extract geometries, text, and harvested keys into an embedded SQLite database (WAL mode). Drop high-resolution image bitmaps immediately after Pass 1 to keep active RAM $\le 3.8\text{ GB}$.
- **Pass 2 (Relational Graph Reconciliation & Serialization):** Execute relational SQL joins across intra-page and inter-page answer keys. Apply the Hierarchy of Truth and serialize to the target contract.
- **Section-Scoped Keys:** Prevent primary key collisions across multi-section assessments (e.g., Set A vs. Set B, or Section 1 Physics vs. Section 2 Chemistry) by scoping keys: `PRIMARY KEY(session_id, section_id, question_numeral)`.

### 4.6 The Hierarchy of Truth (Metadata Precedence Protocol)
When assigning answers and metadata, resolve conflicts using an absolute hierarchy:

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

**Audit Logging:** If a conflict exists (e.g., student ticked A, but the answer key specifies C), record the conflict in `answerResolution.conflictAudit`.

---

## 5. Mandatory Target Output Contract (Production Schema v3.0)
The engine must serialize completed questions conforming to the following target specification. Output must contain zero conversational prose, markdown backtick wrappers around the entire payload, or unclosed delimiters.

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

### Schema Rules & Enforcement
- **Delimiter Contract:** Each discrete question record must conclude with the verbatim delimiter `\n=== question ===\n`.
- **Selection State:** For multiple choice and single choice:
  - If resolved, correct options must use `- [x]`, while distractors use `- [ ]`.
  - If `state: "unresolved"`, all options must be serialized as `- [ ]`.
- **Equation Syntax:** Inline math must strictly utilize single dollar delimiters (`$...$`). Display math must use standalone double dollar blocks (`$$\n...\n$$`). Pure ASCII approximations (e.g., `x^2`, `sqrt(x)`) are prohibited. Bold vectors must use `\mathbf{...}`.
- **Missing & Occluded Artifacts:** Regions obscured by tears or paper folds must use the verbatim token `[MISSING_SECTION]`.
- **Zero Output Drift:** Any output containing conversational tokens (e.g., "Here is the parsed question:", "Certainly!") constitutes a fatal verification failure.

---

## 6. Formal Production Grammar Specification (GBNF v3.0)
Autoregressive decoding must be constrained at the logit-sampling level via the following formal grammar:

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

---

## 7. Non-Functional & Runtime Safety Requirements

### 7.1 Fast-Forwarding Grammar Decoder & Token Budgets
- **Deterministic Fast-Forwarding:** Whenever the grammar uniquely determines the next token sequence (such as static schema keys: `schemaVersion: "3.0"`, `\n=== question ===\n`), the engine must bypass neural forward passes and inject tokens directly into the KV-cache, achieving a $\ge 2.0\times$ speedup on frontmatter generation.
- **Zero-Mask Deadlock Recovery:** If legal candidate bitmask $\|M_t\|_0 = 0$ during math tokenization, roll back 1 token, unclamp grammar constraints to permissive UTF-8 byte stream collector (`raw_unicode_sequence`), and emit raw bytes rather than crashing.
- **Token Budget Bounds:** Impose hard token budgets: `frontmatter` $\le 150$ tokens, `question_body` $\le 800$ tokens, `option_item` $\le 100$ tokens. If budget is exceeded inside a math block, force-inject `\n$$\n` and advance to delimiter.
- **Repetition Blocker:** Enforce a rolling 16-token sliding window penalty inside math blocks to eliminate infinite closing bracket loops (`\right] \right] ...`).

### 7.2 OS Resource Governors & Concurrency
- **Desktop UI Fluidity:** Maintain 60 FPS on the main GUI thread (Tauri v2 / Webview) by executing all computer vision and multimodal inference on background worker threads.
- **Windows DirectML TDR Protection:** Vision transformer patches must be chunked into $< 250\text{ ms}$ tiles with explicit DirectX fence synchronizations, preventing Windows WDDM 2.0-second driver timeout resets.
- **macOS Memory Pressure Monitoring:** Monitor Darwin `DISPATCH_SOURCE_TYPE_MEMORYPRESSURE`. On `WARN`, evict LRU image caches. On `CRITICAL`, pause processing and emit `WARN_LOW_MEMORY` if free RAM $< 750\text{ MB}$.
- **Thermal & Battery Scaler:** Automatically throttle background CPU worker threads to $N_{\text{physical}} - 2$ when running on battery power or if CPU temperature exceeds $85^\circ\text{C}$.

---

## 8. Failure Boundary Matrix & Production Acceptance Thresholds
The engine is viable for production only when meeting the following empirical test thresholds across a randomized 500-page benchmark:

| Evaluation Vector | Production Acceptance Threshold | Hard Failure Boundary (System Reject) | Production Mitigation / Enforcement |
| :--- | :--- | :--- | :--- |
| **Non-Academic Triage** | $> 99.2\%$ rejection in $< 50\text{ ms}$ | Model runs on receipt or code capture | Three-point gate: $\sigma_L^2 < 80 \lor \Phi_{\text{text}} < 0.35 \lor \sigma_{\Delta y}^2 < 1.2$. |
| **Dark / Inverted Media** | $> 99.0\%$ pass rate on blackboards | False rejection of valid dark slides | Tile-based local polarity mapping ($8 \times 8$) inverts inverted blocks only. |
| **Mathematical Accuracy** | $\ge 97.5\%$ token match (NED $\le 0.02$) | Variable hallucination ($k_B \to k_e$) | Qwen2.5-VL-3B-Instruct + post-decoding SymPy AST checker. |
| **Crease & Tear Integrity** | Zero hallucination on torn paper | Model guesses obscured equation terms | Coupled displacement gradient + shadow verification injects `[MISSING_SECTION]`. |
| **Identical Ink Separation** | $\ge 96.5\%$ precision | Erasing carbon gel-pen answers | Tri-cue decomposition: Color delta $\Delta E$, specular sheen $S$, tremor $\Psi_{\text{tremor}}$. |
| **Layout Continuity** | $100\%$ sequential continuity | Line interleaving across columns | Column-Barrier Topological DAG blocks cross-gutter sorting edges. |
| **Answer Key Reconciliation** | $> 98.5\%$ correct reconciliation | Cross-section key overwrites | Section-scoped SQLite session graph (`session_id, section_scope, q_id`). |
| **Grammar Determinism** | $100.0\%$ over 10,000 runs | Token deadlock or parser crash | llguidance zero-mask catch with permissive UTF-8 byte stream fallback. |
| **Infinite Bracket Loops** | 0 context overflows | Autoregressive bracket generation loop | Token-budgeted GBNF grammar (max 800 tokens for body) with repetition penalties. |
| **Throughput & Latency** | Single Page $\le 7.5\text{ s}$; 10-Page $\le 70\text{ s}$ | Page processing exceeds $12.0\text{ s}$ | RadixAttention prefix caching + fast token forwarding on static YAML tokens. |
| **Windows GPU Stability** | Zero TDR driver crashes | DirectML runs $> 2\text{ s}$ without yielding | Vision transformer patches dispatched in $< 250\text{ ms}$ tiles with DirectX fences. |
| **System Memory Headroom** | Zero OOM panics across 1,000 pages | Heap crash or OS thrash freeze | Dynamic memory governor halts and emits `WARN_LOW_MEMORY` if free RAM $< 750\text{ MB}$. |
| **Zero-Loss Preservation** | $0.00\%$ loss of sub-pixel text or layer markers | Low-pass blur on subscripts or erased fraction bars | Catmull-Rom $C^1$ splines + continuous residual weight tensor $W_{\text{print}}$. |

---

## 9. Definitive Summary of Invariants

```text
ADIE Production Guarantees:
├── Zero Remote Sockets ────────── Completely local encapsulation (Rust + ONNX Runtime + Llama.cpp)
├── Resource Ceiling ───────────── Peak Working RAM ≤ 3.8 GB (8.0 GB max) | Disk: 2.53 GB (6.5 GB max)
├── Operational Throughput ─────── Single Page ≤ 7.5s | 10-Page Session ≤ 70s
├── Zero Information Loss ──────── Catmull-Rom splines, non-destructive residual masks, 4-channel layout
├── Optical Manifold Handling ──── Photometrically verified discontinuous mesh splits prevent hallucinations
├── Layer Separation Precision ─── Tri-cue classifier untangles identical carbon-black ink from toner
├── Comprehensive Continuity ───── Two-pass relational graph stitches cross-page stems and footer keys
├── Multi-Section Disambiguation ─ Section-scoped SQLite prevents answer key collisions
├── Schema Compliance ──────────── 100.0% deterministic output via fast-forwarding GBNF grammar
└── Cross-Platform Stability ───── Tiled DirectML GPU chunking prevents Windows WDDM driver resets
```

This engineering problem statement captures the complete physical, mathematical, architectural, and operational reality of building a production-grade, on-device academic document intelligence engine.
