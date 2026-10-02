//! Modular Multi-Format Serialization Architecture.
//!
//! Exposes a pluggable serializer trait allowing the Document Intelligence Engine
//! to export questions into multiple assessment formats (Canonical YAML 3.0,
//! TakeMock CBT JSON, QTI) without modifying perception or session graph subsystems.

use crate::error::{DIEError, Result};
use crate::types::QuestionRecord;
use serde_json::json;
use std::fmt::Write as _;
use tracing::instrument;

/// Target format identifier strings.
pub const FORMAT_YAML_V3: &str = "yaml_frontmatter_v3";
/// TakeMock interactive computer-based testing JSON format.
pub const FORMAT_TAKEMOCK_CBT_JSON: &str = "takemock_cbt_json";

/// Pluggable question serializer trait.
pub trait QuestionSerializer: Send + Sync {
    /// Format identifier name.
    fn format_name(&self) -> &'static str;

    /// Serialize a collection of question records into the target string payload.
    ///
    /// # Errors
    /// Returns [`DIEError`] if formatting or serialization fails.
    fn serialize(&self, questions: &[QuestionRecord]) -> Result<String>;
}

/// Serializer producing GBNF v3.0 compliant YAML Frontmatter + LaTeX + `\n=== question ===\n`.
#[derive(Debug, Default, Clone, Copy)]
pub struct YamlFrontmatterSerializer;

impl QuestionSerializer for YamlFrontmatterSerializer {
    fn format_name(&self) -> &'static str {
        FORMAT_YAML_V3
    }

    #[instrument(skip(self, questions))]
    fn serialize(&self, questions: &[QuestionRecord]) -> Result<String> {
        let mut out = String::new();

        for (idx, q) in questions.iter().enumerate() {
            if idx > 0 {
                out.push('\n');
            }

            out.push_str("---\n");
            out.push_str("schemaVersion: \"3.0\"\n");
            let _ = writeln!(out, "id: \"{}\"", q.id);
            let _ = writeln!(out, "type: \"{}\"", q.question_type.as_str());
            let _ = writeln!(out, "subject: \"{}\"", q.subject);
            let _ = writeln!(out, "topic: \"{}\"", q.topic);
            let _ = writeln!(out, "difficulty: \"{}\"", q.difficulty.as_str());
            let _ = writeln!(out, "marks: {:.1}", q.marks);
            let _ = writeln!(out, "negativeMarks: {:.1}", q.negative_marks);

            // Tags
            if q.tags.is_empty() {
                out.push_str("tags: []\n");
            } else {
                let tags_formatted: Vec<String> = q.tags.iter().map(|t| format!("\"{t}\"")).collect();
                let _ = writeln!(out, "tags: [{}]", tags_formatted.join(", "));
            }

            // Answer Resolution
            out.push_str("answerResolution:\n");
            let _ = writeln!(out, "  state: \"{}\"", q.answer_resolution.state.as_str());
            let _ = writeln!(out, "  confidence: {:.2}", q.answer_resolution.confidence);
            if let Some(ref source_ref) = q.answer_resolution.source_ref {
                let _ = writeln!(out, "  sourceRef: \"{source_ref}\"");
            } else {
                out.push_str("  sourceRef: null\n");
            }

            if let Some(ref conflict) = q.answer_resolution.conflict_audit {
                out.push_str("  conflictAudit:\n");
                let _ = writeln!(out, "    typesetKeyAvailable: \"{}\"", conflict.typeset_key_available);
                let _ = writeln!(out, "    typesetKeySource: \"{}\"", conflict.typeset_key_source);
            }

            // Numerical fields
            if q.question_type == crate::types::QuestionType::Numerical {
                if let Some(val) = q.correct_value {
                    let _ = writeln!(out, "correctValue: {val:.4}");
                } else {
                    out.push_str("correctValue: null\n");
                }
                if let Some(tol) = q.tolerance_absolute {
                    let _ = writeln!(out, "toleranceAbsolute: {tol:.4}");
                }
                if let Some(ref unit) = q.unit {
                    let _ = writeln!(out, "unit: \"{unit}\"");
                }
            }

            // Multiple choice fields
            if q.question_type == crate::types::QuestionType::MultipleChoice {
                if let Some(partial) = q.allow_partial_credit {
                    let _ = writeln!(out, "allowPartialCredit: {partial}");
                }
            }

            out.push_str("---\n\n");

            // Stem body
            out.push_str(&q.stem_latex);
            out.push('\n');

            // Option block
            if !q.options.is_empty() {
                out.push('\n');
                for opt in &q.options {
                    let marker = if opt.is_correct && !opt.is_strike_out { "x" } else { " " };
                    let _ = writeln!(out, "- [{marker}] {}", opt.text);
                }
            }

            // Immutable Delimiter
            out.push_str("\n=== question ===\n");
        }

        Ok(out)
    }
}

/// Serializer producing TakeMock Computer-Based Test JSON format.
#[derive(Debug, Default, Clone, Copy)]
pub struct TakeMockCbtJsonSerializer;

impl QuestionSerializer for TakeMockCbtJsonSerializer {
    fn format_name(&self) -> &'static str {
        FORMAT_TAKEMOCK_CBT_JSON
    }

    #[instrument(skip(self, questions))]
    fn serialize(&self, questions: &[QuestionRecord]) -> Result<String> {
        let json_items: Vec<_> = questions
            .iter()
            .map(|q| {
                let options_json: Vec<_> = q
                    .options
                    .iter()
                    .map(|opt| {
                        json!({
                            "id": opt.id,
                            "text": opt.text,
                            "isCorrect": opt.is_correct && !opt.is_strike_out,
                            "isStrikeOut": opt.is_strike_out
                        })
                    })
                    .collect();

                let mut item = json!({
                    "questionId": q.id.to_string(),
                    "type": q.question_type.as_str(),
                    "subject": q.subject,
                    "topic": q.topic,
                    "difficulty": q.difficulty.as_str(),
                    "marks": q.marks,
                    "negativeMarks": q.negative_marks,
                    "stem": q.stem_latex,
                    "options": options_json,
                    "resolution": {
                        "state": q.answer_resolution.state.as_str(),
                        "confidence": q.answer_resolution.confidence,
                        "sourceRef": q.answer_resolution.source_ref
                    }
                });

                if let Some(ref conflict) = q.answer_resolution.conflict_audit {
                    item["resolution"]["conflictAudit"] = json!({
                        "typesetKeyAvailable": conflict.typeset_key_available,
                        "typesetKeySource": conflict.typeset_key_source
                    });
                }

                if q.question_type == crate::types::QuestionType::Numerical {
                    item["correctValue"] = json!(q.correct_value);
                    item["toleranceAbsolute"] = json!(q.tolerance_absolute);
                    item["unit"] = json!(q.unit);
                }

                item
            })
            .collect();

        serde_json::to_string_pretty(&json!({
            "examSession": {
                "schemaVersion": "3.0",
                "totalQuestions": questions.len(),
                "questions": json_items
            }
        }))
        .map_err(DIEError::from)
    }
}

/// Factory function retrieving serializer corresponding to requested format name.
///
/// # Errors
/// Returns [`DIEError::ExecutionError`] if format identifier is unknown.
pub fn get_serializer(format_name: &str) -> Result<Box<dyn QuestionSerializer>> {
    match format_name {
        FORMAT_YAML_V3 | "yaml" | "v3" => Ok(Box::new(YamlFrontmatterSerializer)),
        FORMAT_TAKEMOCK_CBT_JSON | "json" | "cbt" => Ok(Box::new(TakeMockCbtJsonSerializer)),
        unknown => Err(DIEError::ExecutionError(format!(
            "unsupported export format '{unknown}', valid formats are '{FORMAT_YAML_V3}' or '{FORMAT_TAKEMOCK_CBT_JSON}'"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::*;

    fn sample_question() -> QuestionRecord {
        QuestionRecord {
            schema_version: "3.0".to_string(),
            id: QuestionUid::from("phy_optics_q14"),
            session_id: SessionId::from("sess_1"),
            section_id: "sec_a".to_string(),
            page_number: 1,
            question_numeral: "14".to_string(),
            question_type: QuestionType::SingleChoice,
            subject: "Physics".to_string(),
            topic: "Wave Optics".to_string(),
            difficulty: Difficulty::Medium,
            marks: 4.0,
            negative_marks: -1.0,
            tags: vec!["interference".to_string()],
            answer_resolution: AnswerResolution {
                state: AnswerResolutionState::TeacherGraded,
                confidence: 0.98,
                source_ref: Some("teacher_red_ink:opt_C".to_string()),
                conflict_audit: None,
            },
            correct_value: None,
            tolerance_absolute: None,
            unit: None,
            allow_partial_credit: None,
            stem_latex: "In Young's double-slit experiment, if the slit separation is halved...".to_string(),
            options: vec![
                OptionItem { id: "A".to_string(), text: "Fringe width unchanged".to_string(), is_correct: false, is_strike_out: false },
                OptionItem { id: "B".to_string(), text: "Fringe width halved".to_string(), is_correct: false, is_strike_out: false },
                OptionItem { id: "C".to_string(), text: "Fringe width doubled".to_string(), is_correct: true, is_strike_out: false },
            ],
            continuation_state: ContinuationState::Complete,
        }
    }

    #[test]
    fn test_yaml_frontmatter_serializer() -> Result<()> {
        let q = sample_question();
        let serializer = YamlFrontmatterSerializer;
        let serialized = serializer.serialize(&[q])?;

        assert!(serialized.contains("schemaVersion: \"3.0\""));
        assert!(serialized.contains("id: \"phy_optics_q14\""));
        assert!(serialized.contains("state: \"teacher_graded\""));
        assert!(serialized.contains("- [x] Fringe width doubled"));
        assert!(serialized.contains("- [ ] Fringe width halved"));
        assert!(serialized.contains("\n=== question ===\n"));

        Ok(())
    }

    #[test]
    fn test_cbt_json_serializer() -> Result<()> {
        let q = sample_question();
        let serializer = TakeMockCbtJsonSerializer;
        let serialized = serializer.serialize(&[q])?;

        let parsed: serde_json::Value = serde_json::from_str(&serialized)?;
        assert_eq!(parsed["examSession"]["totalQuestions"], 1);
        assert_eq!(parsed["examSession"]["questions"][0]["questionId"], "phy_optics_q14");
        assert_eq!(parsed["examSession"]["questions"][0]["resolution"]["state"], "teacher_graded");

        Ok(())
    }
}
