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
