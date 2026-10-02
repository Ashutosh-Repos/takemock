# Document Intelligence Engine CLI (`die-cli`) Guide

The `die-cli` command-line utility is the native test harness, diagnostic profiler, and batch conversion tool for the **TakeMock Academic Document Intelligence Engine (ADIE)**. It provides direct, air-gapped access to the core computer vision, manifold dewarping, and relational reconciliation pipelines without requiring a GUI.

---

## Table of Contents

- [Overview & Capabilities](#overview--capabilities)
- [Building & Installation](#building--installation)
- [User Guide (Operational Workflows)](#user-guide-operational-workflows)
  - [1. Optical Triage (`die-cli triage`)](#1-optical-triage-die-cli-triage)
  - [2. One-Shot Processing (`die-cli process`)](#2-one-shot-processing-die-cli-process)
  - [3. Incremental Streaming (`die-cli ingest`)](#3-incremental-streaming-die-cli-ingest)
  - [4. Relational Reconciliation (`die-cli export`)](#4-relational-reconciliation-die-cli-export)
  - [5. Performance Benchmark (`die-cli benchmark`)](#5-performance-benchmark-die-cli-benchmark)
- [Developer Guide (Architecture & Internals)](#developer-guide-architecture--internals)
  - [Two-Pass Pipeline Flow](#two-pass-pipeline-flow)
  - [Core Module Mapping](#core-module-mapping)
  - [Exit Codes & Error Taxonomy](#exit-codes--error-taxonomy)
  - [Extending the CLI](#extending-the-cli)
- [Target Schema Specifications](#target-schema-specifications)
  - [Schema v3.0 YAML Frontmatter](#schema-v30-yaml-frontmatter)
  - [TakeMock CBT JSON Format](#takemock-cbt-json-format)

---

## Overview & Capabilities

- **100% Air-Gapped & Local-First**: Zero external network or socket dependencies. All models and mathematical kernels run locally on CPU or native GPU shaders (Metal, DirectML, OpenVINO).
- **Two-Pass Decoupled Architecture**:
  - **Pass 1 (Streaming Ingestion)**: Real-time image perception, Catmull-Rom manifold dewarping, chromatic ink separation, and topological layout parsing into SQLite WAL. Intermediate raw RGB buffers are deallocated immediately upon entity extraction.
  - **Pass 2 (Relational Reconciliation)**: Multi-page Hierarchy of Truth answer resolution, cross-page question stitching, and multi-format serialization.
- **Strict Memory Budget**: Enforces a peak working RAM ceiling $\le 3.8\text{ GB}$ with runtime hardware pressure watchdogs.
- **Dual Export Formats**: Emits Schema v3.0 Markdown with YAML Frontmatter and LaTeX delimiters, or TakeMock Computer-Based Test (CBT) JSON.

---

## Building & Installation

### Prerequisites

- **Rust Toolchain**: 1.85+ (Edition 2021)
- **Host Compilers**: Standard C compiler for SQLite (`clang` on macOS, `gcc` on Linux, `MSVC` on Windows)

### Build Commands

```bash
# Debug build (faster compilation, unoptimized execution)
cargo build -p document-intelligence-cli

# Release build (recommended: optimized with Fat LTO and single codegen unit)
cargo build --release -p document-intelligence-cli
```

The compiled binary will be located at:
- **Release**: `./target/release/die-cli`
- **Debug**: `./target/debug/die-cli`

### Verify Installation

```bash
./target/release/die-cli --help
```

---

## User Guide (Operational Workflows)

### 1. Optical Triage (`die-cli triage`)

Runs the SIMD optical triage gate on an image in $\le 12\text{ ms}$. Use this command as a pre-flight check before ingesting captures from phone cameras or document scanners.

#### Syntax
```bash
./target/release/die-cli triage --image <PATH_TO_IMAGE>
```

#### What It Evaluates:
1. **Focus Variance ($\sigma_L^2 \ge 80.00$)**:
   - Convolves the 720p luminance proxy with a $3 \times 3$ discrete Laplacian kernel.
   - Detects camera defocus and motion blur.
2. **Directional Text Ratio ($\Phi_{\text{text}} \ge 0.35$)**:
   - Computes horizontal vs. vertical Gabor gradient energy.
   - Filters out natural scenes, desks, or blank pages.
3. **High-Frequency Edge Density ($\ge 0.04$)**:
   - Assesses stroke sharpness and character presence.
4. **Layout Geometry (Receipt Rejection)**:
   - Evaluates vertical line spacing variance ($\sigma_{\Delta y}^2 \ge 1.20$) and aspect ratio ($H/W \le 2.50$) to reject supermarket receipts and terminal logs.
5. **Tile Polarity Normalization**:
   - Evaluates median luminance across an $8 \times 8$ grid. Dark backgrounds (blackboards, slate screens, dark mode) are automatically inverted for downstream parsing.

#### Sample Passing Output:
```text
╔════════════════════════════════════════════════════════════════╗
║          Document Intelligence Engine: Optical Triage          ║
╚════════════════════════════════════════════════════════════════╝
Image File:                  samples/exam_page_1.png
Evaluation Latency:          8.14 ms
────────────────────────────────────────────────────────────────
1. Focus Variance (Laplacian σ_L²):  942.15  [Threshold >= 80.00] -> PASSED
2. Text Periodicity Ratio (Φ_text):    0.41  [Threshold >= 0.35]  -> PASSED
3. High-Frequency Edge Density:      0.0482  [Threshold >= 0.04]  -> PASSED
4. Layout Aspect Ratio (H/W):          1.41  [Receipt > 2.50]     -> PASSED
5. Polarity Inversion (Dark Mode):   STANDARD (Light paper background)
────────────────────────────────────────────────────────────────
OVERALL VERDICT: PASSED - Meets academic perceptual quality standards.
Recommendation:  Proceed with: ./target/release/die-cli process --images samples/exam_page_1.png
```

#### Sample Failing Output:
```text
OVERALL VERDICT: REJECTED - Image fails perception thresholds.
 -> Cause: Severe optical motion blur or defocus (σ_L² = 12.40 < 80.00).
    Remedy: Stabilize camera, ensure uniform lighting, and tap to focus.
```

---

### 2. One-Shot Processing (`die-cli process`)

Processes one or more assessment photos sequentially and outputs the finalized assessment schema in a single execution. Raw image bitmaps are freed after each page is processed.

#### Options & Flags:
| Flag | Long Option | Description | Default |
| :--- | :--- | :--- | :--- |
| `-i` | `--images <PATHS>...` | One or more image file paths in reading order | *Required* |
| `-s` | `--session <ID>` | Session identifier | `session_cli` |
| | `--section <ID>` | Section scope identifier | `section_main` |
| `-f` | `--format <FMT>` | Output format: `yaml_frontmatter_v3` or `takemock_cbt_json` | `yaml_frontmatter_v3` |
| `-o` | `--output <PATH>` | Destination file path (defaults to stdout) | `None` (stdout) |
| `-m` | `--models-dir <PATH>` | Directory containing optional ONNX / GGUF weights | `None` (Heuristic fallback) |
| | `--db <PATH>` | Path to SQLite session database | `:memory:` |

#### Example: Single Page to YAML
```bash
./target/release/die-cli process \
  --images test_photos/page_1.jpg \
  --output test_paper.yaml
```

#### Example: Multi-Page Test to TakeMock CBT JSON
```bash
./target/release/die-cli process \
  --images test_photos/p1.jpg test_photos/p2.jpg test_photos/p3.jpg \
  --session jee_mock_01 \
  --section physics \
  --format takemock_cbt_json \
  --output jee_physics.json
```

---

### 3. Incremental Streaming (`die-cli ingest`)

Simulates mobile camera streaming or scanner batching where pages arrive over time. It performs Pass 1 on a single page and writes extracted entities into a persistent SQLite WAL database.

#### Syntax
```bash
./target/release/die-cli ingest \
  --image <PATH> \
  --page <PAGE_NUM> \
  --session <SESSION_ID> \
  --section <SECTION_ID> \
  [--db <DB_PATH>]
```

#### Example: Ingesting 3 Pages Sequentially
```bash
# Ingest Page 1 into session 'exam_01'
./target/release/die-cli ingest --image page1.jpg --page 1 --session exam_01 --db session.db

# Ingest Page 2 into same session
./target/release/die-cli ingest --image page2.jpg --page 2 --session exam_01 --db session.db

# Ingest Page 3 (containing Answer Key matrix)
./target/release/die-cli ingest --image page3.jpg --page 3 --session exam_01 --db session.db
```

---

### 4. Relational Reconciliation (`die-cli export`)

Executes Pass 2 over an existing SQLite session database. It evaluates the Hierarchy of Truth, cross-page question continuations, and conflict audits, serializing the final questions without needing the original image files.

#### Syntax
```bash
./target/release/die-cli export \
  --session <SESSION_ID> \
  --format <yaml_frontmatter_v3 | takemock_cbt_json> \
  [--db <DB_PATH>] \
  [-o <OUTPUT_PATH>]
```

#### Example: Exporting to Schema v3.0 YAML
```bash
./target/release/die-cli export \
  --session exam_01 \
  --db session.db \
  --format yaml_frontmatter_v3 \
  -o exam_01_final.yaml
```

---

### 5. Performance Benchmark (`die-cli benchmark`)

Runs a stress test by generating synthetic academic document buffers in-memory and passing them through the complete `EngineCoordinator` lifecycle.

#### Syntax
```bash
./target/release/die-cli benchmark [--pages <COUNT>]
```

#### Benchmark Execution Sample:
```bash
./target/release/die-cli benchmark --pages 20
```
```text
Starting Document Intelligence Engine benchmark on 20 pages...
=== Benchmark Summary ===
Total Pages Processed:  20
Total Questions:        20
Total Ingestion Time:   0.58s
Average Throughput:     29.12ms / page
Pass 2 Export Time:     0.18ms
Output YAML Length:     9910 bytes
Status: ALL THRESHOLDS SATISFIED
```

---

## Developer Guide (Architecture & Internals)

### Two-Pass Pipeline Flow

```text
[Input Image (PNG/JPEG)]
         │
         ▼
┌─────────────────────────────────┐
│ 1. Optical Triage (< 50ms)      │ ──> Rejects blur, receipts, natural clutter
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ 2. Catmull-Rom Dewarping        │ ──> Flow-field interpolation + Crease detection
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ 3. CIE-Lab Chrominance Split    │ ──> Isolates Red Ink (a* > 25) vs Student Blue Ink
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ 4. Column-Barrier DAG Sorting   │ ──> Topological ordering across column gutters
└─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│ 5. Session Graph Insertion      │ ──> session_questions, scoped_answer_keys
└─────────────────────────────────┘
         │
         ▼
[DROP IMAGE BITMAP FROM RAM]      ──> Strict peak memory constraint <= 3.8 GB
         │
         ▼
┌─────────────────────────────────┐
│ 6. Hierarchy of Truth Engine    │ ──> Tier 0 (Red) > Tier 1 (Student) > Tier 2 (Keys)
└─────────────────────────────────┘
         │
         ▼
[Schema v3.0 Output Serialization]
```

### Core Module Mapping

The CLI binary (`crates/document-intelligence-cli/src/main.rs`) coordinates core engine subsystems found under [`crates/document-intelligence-core/src/`](file:///Users/ashutoshkumar/takemock/crates/document-intelligence-core/src/):

| Subsystem File | Responsibility in `die-cli` |
| :--- | :--- |
| [`coordinator.rs`](file:///Users/ashutoshkumar/takemock/crates/document-intelligence-core/src/coordinator.rs) | Coordinates Pass 1 streaming, memory monitoring, and Pass 2 export |
| [`triage.rs`](file:///Users/ashutoshkumar/takemock/crates/document-intelligence-core/src/triage.rs) | SIMD Laplacian variance, Gabor periodicity, and polarity inversion |
| [`dewarp.rs`](file:///Users/ashutoshkumar/takemock/crates/document-intelligence-core/src/dewarp.rs) | 16-pixel Catmull-Rom cubic spline interpolation and Jacobian crease tags |
| [`layer.rs`](file:///Users/ashutoshkumar/takemock/crates/document-intelligence-core/src/layer.rs) | CIE-Lab color separation, red instructor ink detection, strike-out thinning |
| [`layout.rs`](file:///Users/ashutoshkumar/takemock/crates/document-intelligence-core/src/layout.rs) | Column-Barrier topological DAG sorting and cross-page `BoundaryStateMachine` |
| [`truth.rs`](file:///Users/ashutoshkumar/takemock/crates/document-intelligence-core/src/truth.rs) | Hierarchy of Truth multi-tier answer resolution and discordance logging |
| [`session_graph.rs`](file:///Users/ashutoshkumar/takemock/crates/document-intelligence-core/src/session_graph.rs) | Embedded SQLite WAL graph database schema and indexes |
| [`serializers.rs`](file:///Users/ashutoshkumar/takemock/crates/document-intelligence-core/src/serializers.rs) | Implements `YamlFrontmatterSerializer` and `TakeMockCbtJsonSerializer` |
| [`governor.rs`](file:///Users/ashutoshkumar/takemock/crates/document-intelligence-core/src/governor.rs) | Hardware watchdog monitoring memory headroom and GPU TDR limits |
| [`neural.rs`](file:///Users/ashutoshkumar/takemock/crates/document-intelligence-core/src/neural.rs) | Discovers hardware backend (Metal/DirectML/CPU) and loads neural weights |

### Exit Codes & Error Taxonomy

`die-cli` uses strongly-typed Rust errors mapped via `anyhow` and [`DIEError`](file:///Users/ashutoshkumar/takemock/crates/document-intelligence-core/src/error.rs):

| Exit Code | Failure Domain | Common Causes |
| :--- | :--- | :--- |
| `0` | **Success** | All operations completed normally |
| `1` | **Unrecoverable Blur** | Laplacian focus variance $\sigma_L^2 < 80.00$ |
| `1` | **Non-Academic Image** | Directional text ratio $\Phi_{\text{text}} < 0.35$ and edge density $< 0.04$ |
| `1` | **Non-Academic Layout** | Monospace receipt aspect ratio $> 2.50$ and line spacing variance $< 1.20$ |
| `1` | **Low Memory Abort** | Host available RAM falls below the critical 32 MB threshold |
| `1` | **IO / SQLite Error** | Unreadable image file, missing file permissions, or locked SQLite WAL |

### Extending the CLI

To add a new subcommand or serializer:
1. **Define Subcommand**: Add variant to `enum Commands` in [`crates/document-intelligence-cli/src/main.rs`](file:///Users/ashutoshkumar/takemock/crates/document-intelligence-cli/src/main.rs).
2. **Implement Serializer**: Implement the [`QuestionSerializer`](file:///Users/ashutoshkumar/takemock/crates/document-intelligence-core/src/serializers.rs) trait in `serializers.rs`:
   ```rust
   pub trait QuestionSerializer {
       fn serialize(&self, questions: &[QuestionRecord]) -> Result<String>;
   }
   ```
3. **Dispatch in CLI**: Add matching branch in `main.rs` to call `coordinator.export_session(...)`.

---

## Target Schema Specifications

### Schema v3.0 YAML Frontmatter

```yaml
---
schemaVersion: "3.0"
id: "session_cli_section_main_p1_q1"
type: "single_choice"
subject: "Physics"
topic: "Classical Mechanics"
difficulty: "medium"
marks: 4.0
negativeMarks: -1.0
tags:
  - "SHM"
  - "Oscillations"
answerResolution:
  state: "human_selection"
  confidence: 0.95
  sourceRef: "frame_b_ink:opt_A"
  conflictAudit: []
---

A block of mass $m = 2.5\text{ kg}$ is attached to a spring of force constant $k = 400\text{ N/m}$. Calculate the period of oscillation $T$.

- [x] $T = \frac{\pi}{10}\text{ s}$
- [ ] $T = \frac{\pi}{5}\text{ s}$
- [ ] $T = \frac{\pi}{20}\text{ s}$
- [ ] $T = 2\pi\text{ s}$

=== question ===
```

### TakeMock CBT JSON Format

```json
{
  "test_id": "session_cli",
  "title": "Assessment Session",
  "sections": [
    {
      "section_id": "section_main",
      "name": "section_main",
      "questions": [
        {
          "question_id": "session_cli_section_main_p1_q1",
          "numeral": 1,
          "question_type": "single_choice",
          "stem_markdown": "A block of mass $m = 2.5\\text{ kg}$ is attached to a spring...",
          "options": [
            { "key": "A", "content_markdown": "$T = \\frac{\\pi}{10}\\text{ s}$", "is_correct": true },
            { "key": "B", "content_markdown": "$T = \\frac{\\pi}{5}\\text{ s}$", "is_correct": false },
            { "key": "C", "content_markdown": "$T = \\frac{\\pi}{20}\\text{ s}$", "is_correct": false },
            { "key": "D", "content_markdown": "$T = 2\\pi\\text{ s}$", "is_correct": false }
          ],
          "marks": 4.0,
          "negative_marks": -1.0,
          "difficulty": "medium",
          "solution_markdown": ""
        }
      ]
    }
  ]
}
```
