//! # Document Intelligence Engine (`document-intelligence-core`)
//!
//! Core native library for on-device academic document intelligence in TakeMock.
//!
//! ## Architecture Overview
//! The engine operates as an air-gapped, headless system designed for cross-platform
//! desktop applications. It implements a decoupled two-pass pipeline:
//!
//! 1. **Pass 1: Streaming Per-Page Optical Extraction**:
//!    - SIMD Optical Triage Gate (< 50ms) filters blurred images and non-academic layouts.
//!    - 16-pixel Catmull-Rom bicubic spline dewarping with photometric crease protection.
//!    - Non-destructive tri-cue layer separation (Toner vs. Gel Pen vs. Red Grading Pen).
//!    - Column-Barrier reading order DAG & cross-page boundary state machine.
//!    - **Immediate Bitmap Memory Purge**: Raw bitmaps are dropped immediately from RAM.
//! 2. **Pass 2: Relational Reconciliation & Multi-Format Serialization**:
//!    - In-memory SQLite session graph in WAL mode.
//!    - Hierarchy of Truth decision engine: Teacher Red Ink ≻ Student Ink ≻ Same-Page Key ≻ Distant Key.
//!    - GBNF v3.0 fast-forwarding grammar decoder with RadixAttention prefix caching.
//!    - Pluggable export serializers (Canonical YAML 3.0, TakeMock CBT JSON).

#![deny(unsafe_code)]
#![warn(missing_docs)]
#![warn(rust_2018_idioms)]

pub mod coordinator;
pub mod decoder;
pub mod dewarp;
pub mod error;
pub mod governor;
pub mod layer;
pub mod layout;
pub mod neural;
pub mod serializers;
pub mod session_graph;
pub mod triage;
pub mod truth;
pub mod types;

/// Common prelude containing primary domain types and errors.
pub mod prelude {
    pub use crate::coordinator::{EngineCoordinator, ProgressCallback};
    pub use crate::error::{DIEError, Result};
    pub use crate::serializers::{
        get_serializer, QuestionSerializer, FORMAT_TAKEMOCK_CBT_JSON, FORMAT_YAML_V3,
    };
    pub use crate::types::{
        AnswerResolution, AnswerResolutionState, ConflictAudit, ContinuationState, Difficulty,
        KeyLocality, OptionItem, QuestionRecord, QuestionType, QuestionUid, ScopedAnswerKey,
        SectionScope, SessionId,
    };
}
