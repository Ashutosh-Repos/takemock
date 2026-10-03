use crate::types::{CompetingHypothesis, QuestionType, ReconstructedQuestion};

pub struct ConstraintValidator;

impl ConstraintValidator {
    /// Validates LaTeX mathematical expressions for balanced delimiters and brackets.
    pub fn validate_latex(latex: &str) -> Result<(), &'static str> {
        let mut brace_depth = 0i32;
        let mut bracket_depth = 0i32;
        let mut paren_depth = 0i32;
        let mut dollar_count = 0u32;

        for ch in latex.chars() {
            match ch {
                '{' => brace_depth += 1,
                '}' => {
                    brace_depth -= 1;
                    if brace_depth < 0 {
                        return Err("Unbalanced closing brace '}'");
                    }
                }
                '[' => bracket_depth += 1,
                ']' => {
                    bracket_depth -= 1;
                    if bracket_depth < 0 {
                        return Err("Unbalanced closing bracket ']'");
                    }
                }
                '(' => paren_depth += 1,
                ')' => {
                    paren_depth -= 1;
                    if paren_depth < 0 {
                        return Err("Unbalanced closing parenthesis ')'");
                    }
                }
                '$' => dollar_count += 1,
                _ => {}
            }
        }

        if brace_depth != 0 {
            return Err("Unclosed opening brace '{'");
        }
        if bracket_depth != 0 {
            return Err("Unclosed opening bracket '['");
        }
        if paren_depth != 0 {
            return Err("Unclosed opening parenthesis '('");
        }
        if dollar_count % 2 != 0 {
            return Err("Unpaired math delimiter '$'");
        }

        let begin_count = latex.matches(r"\begin{").count();
        let end_count = latex.matches(r"\end{").count();
        if begin_count != end_count {
            return Err("Unbalanced \\begin{...} and \\end{...} environments");
        }

        Ok(())
    }

    /// Validates reconstructed question against CBT domain invariants and tags confidence/issues.
    pub fn validate_and_score(q: &mut ReconstructedQuestion) {
        q.audit_issues.clear();
        let mut score: f64 = 1.0;
        let mut is_authoritative_errata = false;

        // 1. Target unit extraction from question text if blank present (C-10)
        if q.target_unit.is_none() {
            let unit_re = regex::Regex::new(r"(?i)(?:_{2,}|\.{3,}|\bblank\b)\s*([A-Za-z/%]+)\b|(?:in\s+([A-Za-z/%]+)\s*(?:is|equals|=)?\s*(?:_{2,}|\.{3,}))").unwrap();
            if let Some(caps) = unit_re.captures(&q.question_text) {
                let unit = caps.get(1).or_else(|| caps.get(2)).map(|m| m.as_str().to_string());
                if let Some(u) = unit {
                    let u_lower = u.to_lowercase();
                    if u_lower != "the" && u_lower != "a" && u_lower != "an" && u_lower != "is" && u_lower != "which" {
                        q.target_unit = Some(u);
                    }
                }
            }
        }

        // 2. Subjective / Unsupported question classification (Section 3.4)
        if q.options.is_empty() && q.question_type != QuestionType::Nat && q.answer_key.as_ref().and_then(|a| a.nat_range.as_ref()).is_none() {
            let subjective_re = regex::Regex::new(r"(?i)^\s*(?:explain|describe|discuss|derive|prove\s+that|write\s+short\s+notes|what\s+is\s+meant\s+by|distinguish\s+between|differentiate\s+between|illustrate|critically\s+analyze)\b").unwrap();
            if subjective_re.is_match(&q.question_text) {
                q.question_type = QuestionType::Unsupported;
            }
        }

        // 3. Validate question type vs. option count
        match q.question_type {
            QuestionType::Nat => {
                if !q.options.is_empty() {
                    q.audit_issues.push("OPTION_COUNT_ANOMALY".to_string());
                    q.competing_hypotheses.push(CompetingHypothesis {
                        hypothesis_id: format!("hyp-{}", q.id),
                        question_type: QuestionType::Mcq,
                        label: q.label.clone(),
                        text: q.question_text.clone(),
                        confidence: 0.85,
                        source_model: "Validator::ArchetypeCheck".to_string(),
                        reason: "Question tagged as NAT but has extracted options; may be MCQ".to_string(),
                    });
                    score -= 0.15;
                }
            }
            QuestionType::Mcq | QuestionType::Msq => {
                if q.options.len() < 2 {
                    q.audit_issues.push("OPTION_COUNT_ANOMALY".to_string());
                    score -= 0.25;
                } else if q.options.len() > 6 {
                    q.audit_issues.push("OPTION_COUNT_ANOMALY".to_string());
                    score -= 0.15;
                }
            }
            QuestionType::Match => {
                if q.options.len() < 2 {
                    q.audit_issues.push("OPTION_COUNT_ANOMALY".to_string());
                    score -= 0.25;
                }
                let has_match_syntax = q.options.iter().any(|o| o.text.contains('-') || o.text.contains("->"));
                if !has_match_syntax && !q.options.is_empty() {
                    q.audit_issues.push("MATCH_MAPPING_UNCERTAIN".to_string());
                    score -= 0.15;
                }
            }
            QuestionType::Unsupported => {
                q.audit_issues.push("UNSUPPORTED_QUESTION_TYPE".to_string());
                score -= 0.50;
            }
            QuestionType::Unknown => {
                q.audit_issues.push("TYPE_CLASSIFICATION_UNCERTAIN".to_string());
                score -= 0.20;
            }
        }

        // 4. Validate options for text or visual asset crop (C-16)
        if q.question_type == QuestionType::Mcq || q.question_type == QuestionType::Msq || q.question_type == QuestionType::Match {
            for opt in &q.options {
                if opt.text.trim().is_empty() && opt.visual_asset_crop.is_none() {
                    q.audit_issues.push("OPTION_EMPTY_NO_VISUAL".to_string());
                    score -= 0.15;
                    break;
                }
            }
        }

        // 5. Validate LaTeX syntax if formula present
        if let Some(ref math) = q.math_latex {
            if let Err(_err) = Self::validate_latex(math) {
                q.audit_issues.push("LATEX_SYNTAX_MALFORMED".to_string());
                score -= 0.10;
            }
        }

        // 6. Validate stimulus completeness (Parent-Child linked questions)
        if q.stimulus_id.is_some() {
            if q.stimulus_text.as_ref().map_or(true, |t| t.trim().is_empty()) {
                q.audit_issues.push("STIMULUS_TEXT_EMPTY".to_string());
                score -= 0.20;
            }
        }

        // 7. Validate answer key consistency
        if let Some(ref ans) = q.answer_key {
            if let Some(special) = ans.special_resolution {
                if special != crate::types::SpecialResolutionStatus::None {
                    // Official exam errata (MTA, Bonus, Dropped, Cancelled, MultiAccepted)
                    q.audit_issues.push(format!("ERRATA_{:?}", special).to_uppercase());
                    // Errata is authoritative source truth
                    is_authoritative_errata = true;
                }
            }

            if q.question_type == QuestionType::Mcq && ans.parsed_options.len() > 1 {
                // MCQ should have exactly 1 answer
                q.competing_hypotheses.push(CompetingHypothesis {
                    hypothesis_id: format!("hyp-msq-{}", q.id),
                    question_type: QuestionType::Msq,
                    label: q.label.clone(),
                    text: q.question_text.clone(),
                    confidence: 0.90,
                    source_model: "Validator::AnswerCardinality".to_string(),
                    reason: "MCQ has multiple correct keys; reclassifying to MSQ".to_string(),
                });
                q.question_type = QuestionType::Msq;
            }

            // NAT question with discrete letter key (Section 30.2)
            if q.question_type == QuestionType::Nat && !ans.parsed_options.is_empty() && ans.nat_range.is_none() {
                q.audit_issues.push("TYPE_CLASSIFICATION_UNCERTAIN".to_string());
                q.competing_hypotheses.push(CompetingHypothesis {
                    hypothesis_id: format!("hyp-nat-mismatch-{}", q.id),
                    question_type: QuestionType::Mcq,
                    label: q.label.clone(),
                    text: q.question_text.clone(),
                    confidence: 0.70,
                    source_model: "Validator::ArchetypeCheck".to_string(),
                    reason: format!("Question tagged as NAT but answer key specifies discrete option {:?}", ans.parsed_options),
                });
                score -= 0.30;
            }

            if !q.options.is_empty() {
                for opt in &ans.parsed_options {
                    if !q.options.iter().any(|o| o.label.eq_ignore_ascii_case(opt)) {
                        q.audit_issues.push("ANSWER_OUT_OF_OPTION_DOMAIN".to_string());
                        score -= 0.20;
                        break;
                    }
                }
            }
        } else {
            q.audit_issues.push("ANSWER_MISSING_IN_SOURCE".to_string());
        }

        // 8. Intra-Source Contradictions (Answer Key vs Worked Solution) (C-14 / Section 31)
        if let (Some(ref ans), Some(ref expl)) = (&q.answer_key, &q.explanation) {
            let opt_claim_re = regex::Regex::new(r"(?i)(?:hence|therefore|thus|so|correct\s+option|correct\s+answer|right\s+option|right\s+choice|ans(?:wer)?)\b[^\n\.]*?[\(\[]?([A-Da-d])[\)\]\.]?(?:\s+is\s+correct|\s+is\s+right|\s*$|\.)").unwrap();
            let nat_claim_re = regex::Regex::new(r"(?i)(?:hence|therefore|thus|so|ans(?:wer)?|value)\s*(?:is|=|:)\s*(-?\d+(?:\.\d+)?)\b").unwrap();

            let lines: Vec<&str> = expl.full_text.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
            let search_window: Vec<&str> = lines.iter().rev().take(5).copied().collect();

            let mut claimed_option: Option<(String, String)> = None;
            let mut claimed_nat: Option<(f64, String)> = None;

            for line in &search_window {
                if let Some(caps) = opt_claim_re.captures(line) {
                    if let Some(m) = caps.get(1) {
                        claimed_option = Some((m.as_str().to_ascii_uppercase(), line.to_string()));
                        break;
                    }
                }
            }

            if claimed_option.is_none() {
                for line in &search_window {
                    if let Some(caps) = nat_claim_re.captures(line) {
                        if let Some(m) = caps.get(1) {
                            if let Ok(val) = m.as_str().parse::<f64>() {
                                claimed_nat = Some((val, line.to_string()));
                                break;
                            }
                        }
                    }
                }
            }

            // Check option discrepancy
            if let Some((sol_opt, claim_line)) = claimed_option {
                if !ans.parsed_options.is_empty() {
                    let key_opt = &ans.parsed_options[0];
                    if !key_opt.eq_ignore_ascii_case(&sol_opt) {
                        q.audit_issues.push("KEY_VS_SOLUTION_DISCREPANCY".to_string());
                        q.competing_hypotheses.push(CompetingHypothesis {
                            hypothesis_id: format!("hyp-contradiction-{}", q.id),
                            question_type: q.question_type,
                            label: q.label.clone(),
                            text: q.question_text.clone(),
                            confidence: 0.70,
                            source_model: "Validator::IntraSourceContradiction".to_string(),
                            reason: format!("Answer Key indicates '{}', but Worked Solution claims '{}': \"{}\"", key_opt, sol_opt, claim_line),
                        });
                        score -= 0.35;
                    }
                }
            }

            // Check NAT discrepancy
            if let (Some(ref range), Some((sol_val, claim_line))) = (&ans.nat_range, claimed_nat) {
                if sol_val < range.min - 1e-4 || sol_val > range.max + 1e-4 {
                    q.audit_issues.push("KEY_VS_SOLUTION_DISCREPANCY".to_string());
                    q.competing_hypotheses.push(CompetingHypothesis {
                        hypothesis_id: format!("hyp-nat-contradiction-{}", q.id),
                        question_type: q.question_type,
                        label: q.label.clone(),
                        text: q.question_text.clone(),
                        confidence: 0.70,
                        source_model: "Validator::IntraSourceContradiction".to_string(),
                        reason: format!("Answer Key NAT range is [{:.2}, {:.2}], but Worked Solution claims {:.2}: \"{}\"", range.min, range.max, sol_val, claim_line),
                    });
                    score -= 0.35;
                }
            }
        }

        let final_score = if is_authoritative_errata {
            1.0
        } else {
            score.clamp(0.1, 1.0)
        };
        q.confidence_score = final_score;

        // Compute resolution status (Section 32 / 37)
        if q.answer_key.is_none() {
            q.resolution_status = Some("UNRESOLVED_IN_SOURCE".to_string());
        } else if is_authoritative_errata {
            q.resolution_status = Some("ERRATA_OVERRIDE".to_string());
        } else if final_score < 0.85 || q.audit_issues.iter().any(|i| i.contains("DISCREPANCY") || i.contains("SUSPECTED")) {
            q.resolution_status = Some("REVIEW_REQUIRED".to_string());
        } else {
            q.resolution_status = Some("RESOLVED".to_string());
        }
    }
}
