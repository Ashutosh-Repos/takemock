use takemock_core::types::*;
use takemock_core::ConstraintValidator;

#[test]
fn test_valid_latex_syntax() {
    assert!(ConstraintValidator::validate_latex(r"\frac{a+b}{c}").is_ok());
    assert!(ConstraintValidator::validate_latex(r"X \to Y").is_ok());
    assert!(ConstraintValidator::validate_latex(r"$\sum_{i=1}^{n} x_i$").is_ok());
}

#[test]
fn test_unbalanced_latex_syntax() {
    assert!(ConstraintValidator::validate_latex(r"\frac{a+b}{c").is_err());
    assert!(ConstraintValidator::validate_latex(r"a + (b * c").is_err());
    assert!(ConstraintValidator::validate_latex(r"$x + y").is_err());
}

#[test]
fn test_mcq_to_msq_reclassification_when_multiple_keys() {
    let mut q = ReconstructedQuestion {
        id: "q-1".to_string(),
        label: "1".to_string(),
        raw_index: 1,
        question_type: QuestionType::Mcq,
        question_text: "Sample question".to_string(),
        options: vec![
            OptionItem { id: "opt-A".to_string(), label: "A".to_string(), text: "1".to_string(), math_latex: None, visual_asset_crop: None },
            OptionItem { id: "opt-B".to_string(), label: "B".to_string(), text: "2".to_string(), math_latex: None, visual_asset_crop: None },
        ],
        answer_key: Some(AnswerKey {
            raw_text: "A, B".to_string(),
            parsed_options: vec!["A".to_string(), "B".to_string()],
            nat_range: None,
            special_resolution: None,
            confidence: 1.0,
        }),
        source_page_numbers: vec![1],
        ..Default::default()
    };

    ConstraintValidator::validate_and_score(&mut q);
    assert_eq!(q.question_type, QuestionType::Msq);
    assert_eq!(q.competing_hypotheses.len(), 1);
}

#[test]
fn test_special_resolution_errata_validation() {
    let mut q = ReconstructedQuestion {
        id: "q-mta".to_string(),
        label: "42".to_string(),
        raw_index: 42,
        question_type: QuestionType::Mcq,
        question_text: "Disputed question statement".to_string(),
        options: vec![
            OptionItem { id: "opt-A".to_string(), label: "A".to_string(), text: "1".to_string(), math_latex: None, visual_asset_crop: None },
        ],
        answer_key: Some(AnswerKey {
            raw_text: "MTA".to_string(),
            parsed_options: Vec::new(),
            nat_range: None,
            special_resolution: Some(SpecialResolutionStatus::MarksToAll),
            confidence: 1.0,
        }),
        source_page_numbers: vec![1],
        ..Default::default()
    };

    ConstraintValidator::validate_and_score(&mut q);
    assert_eq!(q.confidence_score, 1.0);
    assert!(q.audit_issues.contains(&"ERRATA_MARKSTOALL".to_string()));
    assert!(!q.audit_issues.contains(&"ANSWER_MISSING_IN_SOURCE".to_string()));
}

#[test]
fn test_visual_option_validation() {
    let mut q = ReconstructedQuestion {
        id: "q-visual".to_string(),
        label: "10".to_string(),
        raw_index: 10,
        question_type: QuestionType::Mcq,
        question_text: "Which circuit represents an AND gate?".to_string(),
        options: vec![
            OptionItem { id: "opt-A".to_string(), label: "A".to_string(), text: "".to_string(), math_latex: None, visual_asset_crop: Some("crops/opt_A.webp".to_string()) },
            OptionItem { id: "opt-B".to_string(), label: "B".to_string(), text: "".to_string(), math_latex: None, visual_asset_crop: Some("crops/opt_B.webp".to_string()) },
        ],
        source_page_numbers: vec![1],
        ..Default::default()
    };

    ConstraintValidator::validate_and_score(&mut q);
    // Visual asset crop present -> no OPTION_EMPTY_NO_VISUAL penalty
    assert!(!q.audit_issues.contains(&"OPTION_EMPTY_NO_VISUAL".to_string()));

    let mut q_bad = q.clone();
    q_bad.options[0].visual_asset_crop = None;
    ConstraintValidator::validate_and_score(&mut q_bad);
    assert!(q_bad.audit_issues.contains(&"OPTION_EMPTY_NO_VISUAL".to_string()));
}

#[test]
fn test_stimulus_text_validation() {
    let mut q = ReconstructedQuestion {
        id: "q-52".to_string(),
        label: "52".to_string(),
        raw_index: 52,
        question_type: QuestionType::Mcq,
        question_text: "Calculate slip:".to_string(),
        options: vec![
            OptionItem { id: "opt-A".to_string(), label: "A".to_string(), text: "0.1".to_string(), math_latex: None, visual_asset_crop: None },
            OptionItem { id: "opt-B".to_string(), label: "B".to_string(), text: "0.2".to_string(), math_latex: None, visual_asset_crop: None },
        ],
        stimulus_id: Some("stim-52-53".to_string()),
        stimulus_text: Some("A 4-pole motor has...".to_string()),
        source_page_numbers: vec![1],
        ..Default::default()
    };

    ConstraintValidator::validate_and_score(&mut q);
    assert!(!q.audit_issues.contains(&"STIMULUS_TEXT_EMPTY".to_string()));

    let mut q_empty_stim = q.clone();
    q_empty_stim.stimulus_text = Some("   ".to_string());
    ConstraintValidator::validate_and_score(&mut q_empty_stim);
    assert!(q_empty_stim.audit_issues.contains(&"STIMULUS_TEXT_EMPTY".to_string()));
}

