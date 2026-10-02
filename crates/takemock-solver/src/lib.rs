use anyhow::Result;
use std::collections::HashMap;
use takemock_core::{AnswerKey, ExplanationBlock, ReconstructedQuestion};

#[derive(Debug, Clone)]
pub struct RawAnswerItem {
    pub label: String,
    pub raw_text: String,
    pub parsed_options: Vec<String>,
    pub explanation_text: Option<String>,
}

pub struct AssociationSolver;

impl AssociationSolver {
    /// Associates answer keys and explanations to questions with hard anchor locks to guarantee zero cascades.
    pub fn associate(
        questions: &mut [ReconstructedQuestion],
        raw_answers: Vec<RawAnswerItem>,
    ) -> Result<()> {
        let mut answer_map: HashMap<String, RawAnswerItem> = HashMap::new();
        for ans in raw_answers {
            answer_map.insert(ans.label.trim().to_string(), ans);
        }

        for q in questions.iter_mut() {
            let label = q.label.trim();
            if let Some(ans) = answer_map.remove(label) {
                // Hard anchor lock match
                q.answer_key = Some(AnswerKey {
                    raw_text: ans.raw_text.clone(),
                    parsed_options: ans.parsed_options,
                    nat_range: None,
                    confidence: 1.0,
                });

                if let Some(expl) = ans.explanation_text {
                    q.explanation = Some(ExplanationBlock {
                        full_text: expl.clone(),
                        step_by_step: vec![expl],
                        math_latex_blocks: Vec::new(),
                        visual_asset_crops: Vec::new(),
                    });
                }
            } else {
                // No answer found for this exact label; DO NOT cascade or shift!
                q.answer_key = None;
            }
        }

        Ok(())
    }
}

pub struct AnswerKeyParser;

impl AnswerKeyParser {
    /// Extracts raw answer key items from inline answer text or answer sections.
    pub fn parse_answers(text: &str) -> Vec<RawAnswerItem> {
        let mut results = Vec::new();
        let pattern = regex::Regex::new(r"(?i)(?:^|[\s,;])(?:Q(?:uestion)?\.?\s*)?(\d{1,3})\s*[\.\-:\)]\s*[\(\[]?([A-D](?:\s*,\s*[A-D])?|-?\d+(?:\.\d+)?)[\)\]\.]?").unwrap();

        for caps in pattern.captures_iter(text) {
            let label = caps[1].trim().to_string();
            let ans_raw = caps[2].trim().to_string();

            let parsed_options: Vec<String> = if ans_raw.chars().all(|c| c.is_ascii_alphabetic() || c == ',' || c.is_whitespace()) {
                ans_raw
                    .split(',')
                    .map(|s| s.trim().to_ascii_uppercase())
                    .filter(|s| !s.is_empty())
                    .collect()
            } else {
                Vec::new()
            };

            results.push(RawAnswerItem {
                label,
                raw_text: ans_raw,
                parsed_options,
                explanation_text: None,
            });
        }

        results
    }
}

