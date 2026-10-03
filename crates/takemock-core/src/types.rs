use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct BoundingBox {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct PixelRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum QuestionType {
    Mcq,
    Msq,
    Nat,
    Match,
    Unsupported,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExamMetadata {
    pub exam_name: Option<String>,
    pub year: Option<u32>,
    pub marks: Option<f32>,
    pub section: Option<String>,
    pub subject: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptionItem {
    pub id: String,
    pub label: String,
    pub text: String,
    pub math_latex: Option<String>,
    pub visual_asset_crop: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NatRange {
    pub min: f64,
    pub max: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerKey {
    pub raw_text: String,
    pub parsed_options: Vec<String>,
    pub nat_range: Option<NatRange>,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplanationBlock {
    pub full_text: String,
    pub step_by_step: Vec<String>,
    pub math_latex_blocks: Vec<String>,
    pub visual_asset_crops: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompetingHypothesis {
    pub hypothesis_id: String,
    pub question_type: QuestionType,
    pub label: String,
    pub text: String,
    pub confidence: f64,
    pub source_model: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceProvenance {
    pub page_index: u32,
    pub page_identifier: Option<String>,
    pub bounding_box: [f32; 4], // [ymin, xmin, ymax, xmax] in 0.0 - 1.0 range
    pub source_modality: String,
    pub extraction_method: String,
    pub model_identifier: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconstructedQuestion {
    pub id: String,
    pub label: String,
    pub raw_index: u32,
    pub exam_metadata: Option<ExamMetadata>,
    pub question_type: QuestionType,
    pub question_text: String,
    pub math_latex: Option<String>,
    pub options: Vec<OptionItem>,
    pub answer_key: Option<AnswerKey>,
    pub explanation: Option<ExplanationBlock>,
    pub diagram_crop_path: Option<String>,
    pub provenance: Option<SourceProvenance>,
    pub competing_hypotheses: Vec<CompetingHypothesis>,
    #[serde(default)]
    pub audit_issues: Vec<String>,
    pub confidence_score: f64,
    pub source_page_numbers: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExamDocumentResult {
    pub job_id: String,
    pub total_pages: u32,
    pub total_questions: u32,
    pub questions: Vec<ReconstructedQuestion>,
    pub processing_duration_ms: u64,
}
