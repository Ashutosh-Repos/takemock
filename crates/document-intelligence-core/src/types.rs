//! Core domain types and data transfer objects for the Document Intelligence Engine.
//!
//! These types define the schema v3.0 representations for questions, options,
//! answer resolutions, and session graph relational entities.

use serde::{Deserialize, Serialize};

/// Unique identifier for a question entity.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[repr(transparent)]
pub struct QuestionUid(pub String);

impl From<String> for QuestionUid {
    #[inline]
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl From<&str> for QuestionUid {
    #[inline]
    fn from(s: &str) -> Self {
        Self(s.to_string())
    }
}

impl std::fmt::Display for QuestionUid {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Unique identifier for an assessment session.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[repr(transparent)]
pub struct SessionId(pub String);

impl From<String> for SessionId {
    #[inline]
    fn from(s: String) -> Self {
        Self(s)
    }
}

impl From<&str> for SessionId {
    #[inline]
    fn from(s: &str) -> Self {
        Self(s.to_string())
    }
}

impl std::fmt::Display for SessionId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Section scope or booklet identifier (e.g. "Section A", "Physics").
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SectionScope {
    /// Section unique identifier.
    pub section_id: String,
    /// Parent session identifier.
    pub session_id: String,
    /// Booklet or paper code (e.g., "SET_A", "STANDARD").
    pub booklet_code: String,
    /// Optional subject domain.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject_scope: Option<String>,
}

/// Question taxonomy format.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuestionType {
    /// Exactly one correct option among distractors.
    SingleChoice,
    /// One or more correct options among distractors.
    MultipleChoice,
    /// Free-form integer or floating-point numerical response.
    Numerical,
}

impl QuestionType {
    /// Convert to canonical database string representation.
    #[must_use]
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::SingleChoice => "single_choice",
            Self::MultipleChoice => "multiple_choice",
            Self::Numerical => "numerical",
        }
    }
}

impl std::fmt::Display for QuestionType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Difficulty rating for assessment question.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Difficulty {
    /// Foundational difficulty.
    Easy,
    /// Standard academic difficulty.
    #[default]
    Medium,
    /// Advanced competitive difficulty.
    Hard,
}

impl Difficulty {
    /// Convert to string representation.
    #[must_use]
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::Easy => "easy",
            Self::Medium => "medium",
            Self::Hard => "hard",
        }
    }
}

/// Answer resolution state according to the Hierarchy of Truth.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum AnswerResolutionState {
    /// Resolved from an explicit printed answer key table or margin.
    ExplicitKey,
    /// Resolved from handwritten student checkmarks or annotations.
    HumanSelection,
    /// Resolved from instructor red ink grading marks (Tier 0).
    TeacherGraded,
    /// Inferred by the local neural reasoning solver.
    ModelInferred,
    /// Unsolved clean assessment question with no available key.
    #[default]
    Unresolved,
}

impl AnswerResolutionState {
    /// Convert to string representation.
    #[must_use]
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::ExplicitKey => "explicit_key",
            Self::HumanSelection => "human_selection",
            Self::TeacherGraded => "teacher_graded",
            Self::ModelInferred => "model_inferred",
            Self::Unresolved => "unresolved",
        }
    }
}

/// Audit record emitted when multiple candidate answer sources disagree.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ConflictAudit {
    /// The value stated by the printed answer key.
    #[serde(rename = "typesetKeyAvailable")]
    pub typeset_key_available: String,
    /// The page and locality of the printed key.
    #[serde(rename = "typesetKeySource")]
    pub typeset_key_source: String,
}

/// Answer resolution metadata conforming to Schema v3.0.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnswerResolution {
    /// Resolution state.
    pub state: AnswerResolutionState,
    /// Confidence score in range [0.0, 1.0].
    pub confidence: f64,
    /// Reference string indicating source of resolution (e.g. "page_8_matrix", "frame_b_ink:opt_C").
    #[serde(rename = "sourceRef")]
    pub source_ref: Option<String>,
    /// Optional conflict audit if student ink disagreed with printed key.
    #[serde(rename = "conflictAudit", skip_serializing_if = "Option::is_none")]
    pub conflict_audit: Option<ConflictAudit>,
}

impl Default for AnswerResolution {
    fn default() -> Self {
        Self {
            state: AnswerResolutionState::Unresolved,
            confidence: 0.0,
            source_ref: None,
            conflict_audit: None,
        }
    }
}

/// Single choice option item.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OptionItem {
    /// Option label (e.g. "A", "B", "C", "D" or "(1)", "(2)").
    pub id: String,
    /// Option text and LaTeX math formulas.
    pub text: String,
    /// Whether this option is selected/correct.
    #[serde(rename = "isCorrect")]
    pub is_correct: bool,
    /// Whether this option was crossed out by student.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub is_strike_out: bool,
}

/// Cross-page boundary continuation state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ContinuationState {
    /// Entire question completed on current page.
    #[default]
    Complete,
    /// Question stem or options continue onto the next page.
    PendingNextPage,
    /// Headless option continuation block linked to previous page stem.
    StitchedFromPrevious,
}

impl ContinuationState {
    /// Convert to string representation.
    #[must_use]
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::Complete => "COMPLETE",
            Self::PendingNextPage => "PENDING_NEXT_PAGE",
            Self::StitchedFromPrevious => "STITCHED_FROM_PREVIOUS",
        }
    }
}

/// Complete academic question record conforming to Schema v3.0.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct QuestionRecord {
    /// Schema version (fixed at "3.0").
    #[serde(rename = "schemaVersion", default = "default_schema_version")]
    pub schema_version: String,
    /// Unique question identifier.
    pub id: QuestionUid,
    /// Parent assessment session identifier.
    #[serde(skip_serializing)]
    pub session_id: SessionId,
    /// Parent section scope identifier.
    #[serde(skip_serializing)]
    pub section_id: String,
    /// Page number where question begins (1-indexed).
    #[serde(skip_serializing)]
    pub page_number: u32,
    /// Extracted question numeral string (e.g. "14", "Q. 2").
    #[serde(skip_serializing)]
    pub question_numeral: String,
    /// Question type taxonomy.
    #[serde(rename = "type")]
    pub question_type: QuestionType,
    /// Subject classification (e.g. "Physics", "Mathematics").
    pub subject: String,
    /// Specific academic topic.
    pub topic: String,
    /// Assessed difficulty rating.
    pub difficulty: Difficulty,
    /// Marks awarded for correct response.
    pub marks: f64,
    /// Negative marks penalty multiplier.
    #[serde(rename = "negativeMarks")]
    pub negative_marks: f64,
    /// Topic and curriculum tags.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    /// Answer resolution details.
    #[serde(rename = "answerResolution")]
    pub answer_resolution: AnswerResolution,

    // Numerical specific fields
    /// Numerical correct target value.
    #[serde(rename = "correctValue", skip_serializing_if = "Option::is_none")]
    pub correct_value: Option<f64>,
    /// Numerical absolute error tolerance.
    #[serde(rename = "toleranceAbsolute", skip_serializing_if = "Option::is_none")]
    pub tolerance_absolute: Option<f64>,
    /// Unit of measure string.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,

    // Multiple choice specific fields
    /// Whether partial credit is allowed for multiple choice.
    #[serde(rename = "allowPartialCredit", skip_serializing_if = "Option::is_none")]
    pub allow_partial_credit: Option<bool>,

    // Content body & options
    /// Normalized LaTeX question stem.
    pub stem_latex: String,
    /// Choice options (empty for numerical questions).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub options: Vec<OptionItem>,
    /// Boundary continuation state.
    #[serde(skip_serializing)]
    pub continuation_state: ContinuationState,
}

fn default_schema_version() -> String {
    "3.0".to_string()
}

/// Locality of harvested answer key.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum KeyLocality {
    /// Footer at bottom of the same page.
    PageFooter,
    /// Margin callout on side of page.
    MarginCallout,
    /// Dedicated distant answer key matrix (e.g. Page 8).
    EndMatrix,
}

impl KeyLocality {
    /// Convert to string representation.
    #[must_use]
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::PageFooter => "PAGE_FOOTER",
            Self::MarginCallout => "MARGIN_CALLOUT",
            Self::EndMatrix => "END_MATRIX",
        }
    }
}

/// Relational answer key harvested during Pass 1.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScopedAnswerKey {
    /// Unique key identifier.
    pub key_uid: String,
    /// Parent session identifier.
    pub session_id: SessionId,
    /// Scoped section identifier.
    pub section_id: String,
    /// Question numeral string (e.g. "14").
    pub question_numeral: String,
    /// Derived target value (e.g. "C", "A, C", "3.14").
    pub target_value: String,
    /// Source page where key was discovered.
    pub source_page: u32,
    /// Physical location of key.
    pub key_locality: KeyLocality,
    /// Extraction confidence in [0.0, 1.0].
    pub confidence: f64,
}
