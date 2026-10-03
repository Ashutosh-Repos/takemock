use anyhow::Result;
use std::collections::HashMap;
use takemock_core::{AnswerKey, ExplanationBlock, NatRange, QuestionType, ReconstructedQuestion, SpecialResolutionStatus};

#[derive(Debug, Clone)]
pub struct RawAnswerItem {
    pub label: String,
    pub raw_text: String,
    pub parsed_options: Vec<String>,
    pub nat_range: Option<NatRange>,
    pub special_resolution: Option<SpecialResolutionStatus>,
    pub target_unit: Option<String>,
    pub explanation_text: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct AssociationReport {
    pub unassigned_answers: Vec<RawAnswerItem>,
    pub detected_gaps: Vec<(u32, u32)>,
}

pub struct AssociationSolver;

impl AssociationSolver {
    /// Associates answer keys and explanations to questions with hard anchor locks to guarantee zero cascades.
    pub fn associate(
        questions: &mut [ReconstructedQuestion],
        raw_answers: Vec<RawAnswerItem>,
    ) -> Result<AssociationReport> {
        let mut answer_map: HashMap<String, RawAnswerItem> = HashMap::new();
        for ans in raw_answers {
            answer_map.insert(ans.label.trim().to_string(), ans);
        }

        // 1. Detect sequence gaps across reconstructed questions (Section 30.2)
        let mut detected_gaps = Vec::new();
        for i in 1..questions.len() {
            let prev_idx = questions[i - 1].raw_index;
            let curr_idx = questions[i].raw_index;
            if curr_idx > prev_idx + 1 && prev_idx > 0 {
                detected_gaps.push((prev_idx + 1, curr_idx - 1));
                questions[i].audit_issues.push("SEQUENCE_GAP_DETECTED".to_string());

                // Check if any missing question has an answer parked in the answer map
                for missing_num in (prev_idx + 1)..curr_idx {
                    if answer_map.contains_key(&missing_num.to_string()) {
                        questions[i].audit_issues.push("OFF_BY_ONE_SUSPECTED".to_string());
                        break;
                    }
                }
            }
        }

        for q in questions.iter_mut() {
            let label = q.label.trim();
            if let Some(ans) = answer_map.remove(label) {
                // Hard anchor lock match
                let nat_range = ans.nat_range.clone();
                let special_resolution = ans.special_resolution;

                q.answer_key = Some(AnswerKey {
                    raw_text: ans.raw_text.clone(),
                    parsed_options: ans.parsed_options.clone(),
                    nat_range,
                    special_resolution,
                    confidence: 1.0,
                });

                if ans.target_unit.is_some() && q.target_unit.is_none() {
                    q.target_unit = ans.target_unit;
                }

                if ans.nat_range.is_some() && (q.question_type == QuestionType::Unknown || q.options.is_empty()) {
                    q.question_type = QuestionType::Nat;
                }

                if special_resolution == Some(SpecialResolutionStatus::MultiAccepted) && ans.parsed_options.len() > 1 {
                    q.question_type = QuestionType::Msq;
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

        // Collect any unassigned answers safely parked to prevent cascade
        let unassigned_answers: Vec<RawAnswerItem> = answer_map.into_values().collect();

        Ok(AssociationReport {
            unassigned_answers,
            detected_gaps,
        })
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct SolutionTerminalClaim {
    pub claimed_options: Vec<String>,
    pub claimed_nat: Option<f64>,
    pub claim_sentence: String,
}

pub struct SolutionClaimParser;

impl SolutionClaimParser {
    /// Extracts terminal conclusion or final assertion from an explanation/solution text.
    pub fn parse_terminal_claim(solution_text: &str) -> Option<SolutionTerminalClaim> {
        let opt_claim_re = regex::Regex::new(r"(?i)(?:hence|therefore|thus|so|correct\s+option|correct\s+answer|right\s+option|right\s+choice|ans(?:wer)?)\b[^\n\.]*?[\(\[]?([A-Da-d])[\)\]\.]?(?:\s+is\s+correct|\s+is\s+right|\s*$|\.)").unwrap();
        let nat_claim_re = regex::Regex::new(r"(?i)(?:hence|therefore|thus|so|ans(?:wer)?|value)\s*(?:is|=|:)\s*(-?\d+(?:\.\d+)?)\b").unwrap();

        let lines: Vec<&str> = solution_text.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
        let search_window: Vec<&str> = lines.iter().rev().take(5).copied().collect();

        for line in &search_window {
            if let Some(caps) = opt_claim_re.captures(line) {
                if let Some(m) = caps.get(1) {
                    return Some(SolutionTerminalClaim {
                        claimed_options: vec![m.as_str().to_ascii_uppercase()],
                        claimed_nat: None,
                        claim_sentence: line.to_string(),
                    });
                }
            }
        }

        for line in &search_window {
            if let Some(caps) = nat_claim_re.captures(line) {
                if let Some(m) = caps.get(1) {
                    if let Ok(val) = m.as_str().parse::<f64>() {
                        return Some(SolutionTerminalClaim {
                            claimed_options: Vec::new(),
                            claimed_nat: Some(val),
                            claim_sentence: line.to_string(),
                        });
                    }
                }
            }
        }

        None
    }
}

pub struct AnswerKeyParser;

impl AnswerKeyParser {
    /// Parses numerical NAT ranges, errata status (MTA, Bonus, Dropped), or discrete option lists like A, B, C.
    pub fn parse_nat_or_options(raw: &str) -> (Vec<String>, Option<NatRange>, Option<SpecialResolutionStatus>, Option<String>) {
        let clean = raw.trim();
        let upper = clean.to_uppercase();

        // 1. Official errata keywords
        if upper == "MTA" || upper == "MARKS TO ALL" || upper == "ALL" {
            return (Vec::new(), None, Some(SpecialResolutionStatus::MarksToAll), None);
        }
        if upper == "BONUS" {
            return (Vec::new(), None, Some(SpecialResolutionStatus::Bonus), None);
        }
        if upper == "DROPPED" {
            return (Vec::new(), None, Some(SpecialResolutionStatus::Dropped), None);
        }
        if upper == "CANCELLED" || upper == "CANCELED" {
            return (Vec::new(), None, Some(SpecialResolutionStatus::Cancelled), None);
        }

        // 2. Multi-accepted options: "A OR C", "A/C", "A OR B OR C"
        if upper.contains(" OR ") {
            let parts: Vec<&str> = upper.split(" OR ").collect();
            let opts: Vec<String> = parts
                .iter()
                .map(|s| s.trim().to_string())
                .filter(|s| s.len() == 1 && s.chars().all(|c| c.is_ascii_alphabetic()))
                .collect();
            if !opts.is_empty() {
                return (opts, None, Some(SpecialResolutionStatus::MultiAccepted), None);
            }
        }

        // 3. Bracketed interval: [12.4, 12.6]
        if let (Some(start), Some(end)) = (clean.find('['), clean.find(']')) {
            let inside = &clean[start + 1..end];
            let parts: Vec<&str> = inside.split(',').collect();
            if parts.len() == 2 {
                if let (Ok(min), Ok(max)) = (parts[0].trim().parse::<f64>(), parts[1].trim().parse::<f64>()) {
                    return (Vec::new(), Some(NatRange { min, max }), None, None);
                }
            }
        }

        // 4. Word "to" interval: "12.4 to 12.6"
        let lower = clean.to_lowercase();
        if lower.contains(" to ") {
            let parts: Vec<&str> = lower.splitn(2, " to ").collect();
            if parts.len() == 2 {
                let left_num = parts[0].split_whitespace().last().unwrap_or("");
                let right_num = parts[1].split_whitespace().next().unwrap_or("");
                if let (Ok(min), Ok(max)) = (left_num.parse::<f64>(), right_num.parse::<f64>()) {
                    return (Vec::new(), Some(NatRange { min, max }), None, None);
                }
            }
        }

        // 5. Space-hyphen-space interval: "12.4 - 12.6"
        if clean.contains(" - ") {
            let parts: Vec<&str> = clean.splitn(2, " - ").collect();
            if parts.len() == 2 {
                if let (Ok(min), Ok(max)) = (parts[0].trim().parse::<f64>(), parts[1].trim().parse::<f64>()) {
                    return (Vec::new(), Some(NatRange { min, max }), None, None);
                }
            }
        }

        // 6. Number with optional unit (e.g. "4.5 kW", "42 seconds", "12.5")
        let num_unit_re = regex::Regex::new(r"^(-?\d+(?:\.\d+)?)(?:\s+([A-Za-z/]+))?$").unwrap();
        if let Some(caps) = num_unit_re.captures(clean) {
            if let Ok(val) = caps[1].parse::<f64>() {
                let unit = caps.get(2).map(|m| m.as_str().to_string());
                return (Vec::new(), Some(NatRange { min: val, max: val }), None, unit);
            }
        }

        // 7. Letter options: "A", "B, C", "A/C"
        if clean.chars().all(|c| c.is_ascii_alphabetic() || c == ',' || c == '/' || c == '&' || c.is_whitespace()) {
            let opts: Vec<String> = clean
                .split(|c| c == ',' || c == '/' || c == '&')
                .map(|s| s.trim().to_ascii_uppercase())
                .filter(|s| !s.is_empty() && s.len() == 1)
                .collect();
            if !opts.is_empty() {
                return (opts, None, None, None);
            }
        }

        (Vec::new(), None, None, None)
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

            let (parsed_options, nat_range, special_resolution, target_unit) = Self::parse_nat_or_options(raw_val);

            // Record if valid options, NAT range, or special resolution status
            if !parsed_options.is_empty() || nat_range.is_some() || special_resolution.is_some() {
                results.push(RawAnswerItem {
                    label,
                    raw_text: raw_val.to_string(),
                    parsed_options,
                    nat_range,
                    special_resolution,
                    target_unit,
                    explanation_text: None,
                });
            }
        }

        results
    }
}
