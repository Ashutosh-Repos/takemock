//! Hierarchy of Truth Decision Engine & Relational Reconciliation Solver.
//!
//! Reconciles multiple candidate answer sources across student annotations,
//! instructor grading marks, intra-page footers, and distant answer matrices.
//!
//! Precedence order:
//! Tier 0 (Teacher Red Ink) ≻ Tier 1 (Student Annotation) ≻ Tier 2a (Same-Page Key) ≻ Tier 2b (Distant Matrix) ≻ Tier 3 (Unresolved).

use crate::types::{
    AnswerResolution, AnswerResolutionState, ConflictAudit, KeyLocality,
    QuestionRecord, ScopedAnswerKey,
};
use tracing::{debug, instrument};

/// Reconciles an extracted question entity with all available harvested answer keys
/// and handwritten layers using the strict Hierarchy of Truth precedence protocol.
#[instrument(skip(q, harvested_keys))]
pub fn reconcile_question_truth(
    q: &mut QuestionRecord,
    harvested_keys: &[ScopedAnswerKey],
    opt_in_solver_mode: bool,
) {
    // Check Tier 0: Instructor Red Grading Ink
    // If instructor marked an option in red pen, it unconditionally overrules all else
    if let Some(opt_idx) = q.options.iter().position(|opt| opt.is_correct && opt.id.starts_with("TEACHER_")) {
        let opt_label = q.options[opt_idx].id.trim_start_matches("TEACHER_").to_string();
        q.options[opt_idx].id = opt_label.clone();
        q.answer_resolution = AnswerResolution {
            state: AnswerResolutionState::TeacherGraded,
            confidence: 0.98,
            source_ref: Some(format!("teacher_red_ink:opt_{opt_label}")),
            conflict_audit: None,
        };
        debug!(q_id = %q.id, opt = %opt_label, "resolved via Tier 0 (Teacher Red Ink)");
        return;
    }

    // Find candidate printed keys matching (section_id, question_numeral)
    let matching_keys: Vec<&ScopedAnswerKey> = harvested_keys
        .iter()
        .filter(|k| k.section_id == q.section_id && k.question_numeral == q.question_numeral)
        .collect();

    // Check same-page footer/margin key (Tier 2a) vs distant matrix (Tier 2b)
    let same_page_key = matching_keys.iter().find(|k| k.source_page == q.page_number);
    let distant_key = matching_keys.iter().find(|k| k.source_page != q.page_number);
    let best_printed_key = same_page_key.or(distant_key);

    // Check Tier 1: Student Handwritten Checkmark
    let student_selected_opt = q.options.iter().find(|opt| opt.is_correct && !opt.is_strike_out);

    if let Some(student_opt) = student_selected_opt {
        let student_choice = student_opt.id.clone();
        let mut conflict_audit = None;

        // If printed key also exists and disagrees, log conflict audit
        if let Some(key) = best_printed_key {
            let key_val = &key.target_value;
            if !key_val.eq_ignore_ascii_case(&student_choice) {
                let locality_str = match key.key_locality {
                    KeyLocality::PageFooter => format!("page_{}_footer", key.source_page),
                    KeyLocality::MarginCallout => format!("page_{}_margin", key.source_page),
                    KeyLocality::EndMatrix => format!("page_{}_matrix", key.source_page),
                };

                conflict_audit = Some(ConflictAudit {
                    typeset_key_available: key_val.clone(),
                    typeset_key_source: locality_str,
                });
            }
        }

        q.answer_resolution = AnswerResolution {
            state: AnswerResolutionState::HumanSelection,
            confidence: 0.95,
            source_ref: Some(format!("frame_b_ink:opt_{student_choice}")),
            conflict_audit,
        };
        debug!(q_id = %q.id, opt = %student_choice, "resolved via Tier 1 (Student Annotation)");
        return;
    }

    // Apply Tier 2a (Same-Page Footer/Margin Key) or Tier 2b (Distant Matrix Key)
    if let Some(key) = best_printed_key {
        let is_same_page = key.source_page == q.page_number;
        let source_ref = match key.key_locality {
            KeyLocality::PageFooter => format!("page_{}_footer", key.source_page),
            KeyLocality::MarginCallout => format!("page_{}_margin", key.source_page),
            KeyLocality::EndMatrix => format!("page_{}_matrix", key.source_page),
        };

        // Mark the matching option as correct
        let target_val = key.target_value.trim();
        for opt in &mut q.options {
            opt.is_correct = opt.id.eq_ignore_ascii_case(target_val);
        }

        // If numerical question, populate correct_value
        if q.question_type == crate::types::QuestionType::Numerical {
            if let Ok(num) = target_val.parse::<f64>() {
                q.correct_value = Some(num);
                q.tolerance_absolute = Some(0.01);
            }
        }

        q.answer_resolution = AnswerResolution {
            state: AnswerResolutionState::ExplicitKey,
            confidence: 1.0,
            source_ref: Some(source_ref),
            conflict_audit: None,
        };

        debug!(
            q_id = %q.id,
            target = %target_val,
            tier = if is_same_page { "Tier 2a" } else { "Tier 2b" },
            "resolved via printed answer key"
        );
        return;
    }

    // Tier 3: Unresolved Clean Assessment (or Opt-In Local Solver Mode)
    if opt_in_solver_mode {
        q.answer_resolution = AnswerResolution {
            state: AnswerResolutionState::ModelInferred,
            confidence: 0.85,
            source_ref: Some("local_vlm_solver".to_string()),
            conflict_audit: None,
        };
    } else {
        // Ensure all distractors are false for clean assessment
        for opt in &mut q.options {
            opt.is_correct = false;
        }
        q.answer_resolution = AnswerResolution {
            state: AnswerResolutionState::Unresolved,
            confidence: 0.0,
            source_ref: None,
            conflict_audit: None,
        };
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::*;

    #[test]
    fn test_tier1_overrules_tier2_with_conflict_audit() {
        let mut q = QuestionRecord {
            schema_version: "3.0".to_string(),
            id: QuestionUid::from("q14"),
            session_id: SessionId::from("sess"),
            section_id: "sec1".to_string(),
            page_number: 2,
            question_numeral: "14".to_string(),
            question_type: QuestionType::SingleChoice,
            subject: "Physics".to_string(),
            topic: "Optics".to_string(),
            difficulty: Difficulty::Medium,
            marks: 4.0,
            negative_marks: -1.0,
            tags: vec![],
            answer_resolution: AnswerResolution::default(),
            correct_value: None,
            tolerance_absolute: None,
            unit: None,
            allow_partial_credit: None,
            stem_latex: "Optics question stem".to_string(),
            options: vec![
                OptionItem { id: "A".to_string(), text: "opt a".to_string(), is_correct: false, is_strike_out: false },
                OptionItem { id: "B".to_string(), text: "opt b".to_string(), is_correct: true, is_strike_out: false }, // student ticked B
                OptionItem { id: "C".to_string(), text: "opt c".to_string(), is_correct: false, is_strike_out: false },
            ],
            continuation_state: ContinuationState::Complete,
        };

        // Key says C on page 8 matrix
        let key = ScopedAnswerKey {
            key_uid: "key1".to_string(),
            session_id: SessionId::from("sess"),
            section_id: "sec1".to_string(),
            question_numeral: "14".to_string(),
            target_value: "C".to_string(),
            source_page: 8,
            key_locality: KeyLocality::EndMatrix,
            confidence: 1.0,
        };

        reconcile_question_truth(&mut q, &[key], false);

        assert_eq!(q.answer_resolution.state, AnswerResolutionState::HumanSelection);
        assert_eq!(q.answer_resolution.confidence, 0.95);
        assert!(q.answer_resolution.conflict_audit.is_some());
        let audit = q.answer_resolution.conflict_audit.unwrap();
        assert_eq!(audit.typeset_key_available, "C");
        assert_eq!(audit.typeset_key_source, "page_8_matrix");
    }
}
