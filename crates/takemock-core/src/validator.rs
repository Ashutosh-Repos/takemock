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

        Ok(())
    }

    /// Validates reconstructed question against CBT domain invariants and tags confidence/issues.
    pub fn validate_and_score(q: &mut ReconstructedQuestion) {
        let mut score: f64 = 1.0;

        // 1. Validate question type vs. option count
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
            QuestionType::Unsupported => {
                q.audit_issues.push("UNSUPPORTED_QUESTION_TYPE".to_string());
                score -= 0.50;
            }
            QuestionType::Unknown => {
                q.audit_issues.push("TYPE_CLASSIFICATION_UNCERTAIN".to_string());
                score -= 0.20;
            }
            _ => {}
        }

        // 2. Validate LaTeX syntax if formula present
        if let Some(ref math) = q.math_latex {
            if let Err(_err) = Self::validate_latex(math) {
                q.audit_issues.push("LATEX_SYNTAX_MALFORMED".to_string());
                score -= 0.10;
            }
        }

        // 3. Validate answer key consistency
        if let Some(ref ans) = q.answer_key {
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

        q.confidence_score = score.clamp(0.1, 1.0);
    }
}
