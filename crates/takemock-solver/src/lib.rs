use anyhow::Result;
use std::collections::HashMap;
use takemock_core::{AnswerKey, ExplanationBlock, NatRange, QuestionType, ReconstructedQuestion};

#[derive(Debug, Clone)]
pub struct RawAnswerItem {
    pub label: String,
    pub raw_text: String,
    pub parsed_options: Vec<String>,
    pub nat_range: Option<NatRange>,
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
                let nat_range = ans.nat_range.clone();
                q.answer_key = Some(AnswerKey {
                    raw_text: ans.raw_text.clone(),
                    parsed_options: ans.parsed_options,
                    nat_range,
                    confidence: 1.0,
                });

                if ans.nat_range.is_some() && (q.question_type == QuestionType::Unknown || q.options.is_empty()) {
                    q.question_type = QuestionType::Nat;
                }

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
    /// Parses numerical NAT ranges (single values or intervals like [12.4, 12.6], 12.4 to 12.6, 12.4 - 12.6)
    /// or discrete option lists like A, B, C.
    pub fn parse_nat_or_options(raw: &str) -> (Vec<String>, Option<NatRange>) {
        let clean = raw.trim();

        // 1. Bracketed interval: [12.4, 12.6]
        if let (Some(start), Some(end)) = (clean.find('['), clean.find(']')) {
            let inside = &clean[start + 1..end];
            let parts: Vec<&str> = inside.split(',').collect();
            if parts.len() == 2 {
                if let (Ok(min), Ok(max)) = (parts[0].trim().parse::<f64>(), parts[1].trim().parse::<f64>()) {
                    return (Vec::new(), Some(NatRange { min, max }));
                }
            }
        }

        // 2. Word "to" interval: "12.4 to 12.6"
        let lower = clean.to_lowercase();
        if lower.contains(" to ") {
            let parts: Vec<&str> = lower.splitn(2, " to ").collect();
            if parts.len() == 2 {
                let left_num = parts[0].split_whitespace().last().unwrap_or("");
                let right_num = parts[1].split_whitespace().next().unwrap_or("");
                if let (Ok(min), Ok(max)) = (left_num.parse::<f64>(), right_num.parse::<f64>()) {
                    return (Vec::new(), Some(NatRange { min, max }));
                }
            }
        }

        // 3. Space-hyphen-space interval: "12.4 - 12.6"
        if clean.contains(" - ") {
            let parts: Vec<&str> = clean.splitn(2, " - ").collect();
            if parts.len() == 2 {
                if let (Ok(min), Ok(max)) = (parts[0].trim().parse::<f64>(), parts[1].trim().parse::<f64>()) {
                    return (Vec::new(), Some(NatRange { min, max }));
                }
            }
        }

        // 4. Single numeric value (integer or float): "42", "3.14", "-5.2"
        if let Ok(val) = clean.parse::<f64>() {
            return (Vec::new(), Some(NatRange { min: val, max: val }));
        }

        // 5. Letter options: "A", "B, C", "A/C"
        if clean.chars().all(|c| c.is_ascii_alphabetic() || c == ',' || c == '/' || c == '&' || c.is_whitespace()) {
            let opts: Vec<String> = clean
                .split(|c| c == ',' || c == '/' || c == '&')
                .map(|s| s.trim().to_ascii_uppercase())
                .filter(|s| !s.is_empty() && s.len() == 1)
                .collect();
            if !opts.is_empty() {
                return (opts, None);
            }
        }

        (Vec::new(), None)
    }

    /// Extracts raw answer key items from inline answer text or answer sections.
    pub fn parse_answers(text: &str) -> Vec<RawAnswerItem> {
        let mut results = Vec::new();
        let anchor_re = regex::Regex::new(r"(?im)(?:^|[\r\n\s,;])(?:Q(?:uestion)?\.?\s*)?(\d{1,3})(?:\s*[-:)]\s*|\.(?:\s+|[A-Za-z\[\(]|$))").unwrap();

        let captures: Vec<_> = anchor_re.captures_iter(text).collect();
        let match_indices: Vec<_> = anchor_re.find_iter(text).collect();

        for i in 0..captures.len() {
            let label = captures[i][1].trim().to_string();
            let val_start = match_indices[i].end();
            let max_end = if i + 1 < match_indices.len() {
                match_indices[i + 1].start()
            } else {
                text.len()
            };

            let candidate_slice = &text[val_start..max_end];
            // If there is a newline within candidate_slice, value terminates at the newline
            let raw_val = if let Some(nl_idx) = candidate_slice.find('\n') {
                &candidate_slice[..nl_idx]
            } else {
                candidate_slice.trim_end_matches(|c| c == ',' || c == ';' || c == '\r' || c == ' ')
            }.trim();

            let (parsed_options, nat_range) = Self::parse_nat_or_options(raw_val);

            // Only record if we got valid options or a valid NAT range
            if !parsed_options.is_empty() || nat_range.is_some() {
                results.push(RawAnswerItem {
                    label,
                    raw_text: raw_val.to_string(),
                    parsed_options,
                    nat_range,
                    explanation_text: None,
                });
            }
        }

        results
    }
}

