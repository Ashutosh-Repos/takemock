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
            origin: Some("SOURCE".to_string()),
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
            origin: Some("SOURCE".to_string()),
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

#[test]
fn test_intra_source_contradiction_mcq() {
    let mut q = ReconstructedQuestion {
        id: "q-contra-mcq".to_string(),
        label: "28".to_string(),
        raw_index: 28,
        question_type: QuestionType::Mcq,
        question_text: "Which of the following is correct?".to_string(),
        options: vec![
            OptionItem { id: "opt-A".to_string(), label: "A".to_string(), text: "First".to_string(), math_latex: None, visual_asset_crop: None },
            OptionItem { id: "opt-B".to_string(), label: "B".to_string(), text: "Second".to_string(), math_latex: None, visual_asset_crop: None },
            OptionItem { id: "opt-C".to_string(), label: "C".to_string(), text: "Third".to_string(), math_latex: None, visual_asset_crop: None },
        ],
        answer_key: Some(AnswerKey {
            raw_text: "B".to_string(),
            parsed_options: vec!["B".to_string()],
            nat_range: None,
            special_resolution: None,
            confidence: 1.0,
            origin: Some("SOURCE".to_string()),
        }),
        explanation: Some(ExplanationBlock {
            full_text: "Solving the equation step by step:\nx = 5.\nTherefore, the correct option is (C).".to_string(),
            step_by_step: vec!["Solving step by step".to_string(), "Therefore, the correct option is (C).".to_string()],
            math_latex_blocks: Vec::new(),
            visual_asset_crops: Vec::new(),
        }),
        source_page_numbers: vec![1],
        ..Default::default()
    };

    ConstraintValidator::validate_and_score(&mut q);
    assert!(q.audit_issues.contains(&"KEY_VS_SOLUTION_DISCREPANCY".to_string()));
    assert!(q.confidence_score < 0.70);
    assert_eq!(q.competing_hypotheses.len(), 1);
    assert!(q.competing_hypotheses[0].reason.contains("Answer Key indicates 'B'"));
    assert!(q.competing_hypotheses[0].reason.contains("Worked Solution claims 'C'"));
}

#[test]
fn test_intra_source_contradiction_nat() {
    let mut q = ReconstructedQuestion {
        id: "q-contra-nat".to_string(),
        label: "30".to_string(),
        raw_index: 30,
        question_type: QuestionType::Nat,
        question_text: "Find the steady-state temperature in degrees:".to_string(),
        options: Vec::new(),
        answer_key: Some(AnswerKey {
            raw_text: "12.4 to 12.6".to_string(),
            parsed_options: Vec::new(),
            nat_range: Some(NatRange { min: 12.4, max: 12.6 }),
            special_resolution: None,
            confidence: 1.0,
            origin: Some("SOURCE".to_string()),
        }),
        explanation: Some(ExplanationBlock {
            full_text: "Applying boundary conditions, T = 25.0.\nHence, required value is 25.0.".to_string(),
            step_by_step: vec!["Applying boundary conditions".to_string()],
            math_latex_blocks: Vec::new(),
            visual_asset_crops: Vec::new(),
        }),
        source_page_numbers: vec![1],
        ..Default::default()
    };

    ConstraintValidator::validate_and_score(&mut q);
    assert!(q.audit_issues.contains(&"KEY_VS_SOLUTION_DISCREPANCY".to_string()));
    assert!(q.confidence_score < 0.70);
    assert_eq!(q.competing_hypotheses.len(), 1);
    assert!(q.competing_hypotheses[0].reason.contains("claims 25.00"));
}

#[test]
fn test_intra_source_agreement_no_discrepancy() {
    let mut q = ReconstructedQuestion {
        id: "q-agree".to_string(),
        label: "5".to_string(),
        raw_index: 5,
        question_type: QuestionType::Mcq,
        question_text: "Sample aligned question".to_string(),
        options: vec![
            OptionItem { id: "opt-A".to_string(), label: "A".to_string(), text: "Alpha".to_string(), math_latex: None, visual_asset_crop: None },
            OptionItem { id: "opt-B".to_string(), label: "B".to_string(), text: "Beta".to_string(), math_latex: None, visual_asset_crop: None },
        ],
        answer_key: Some(AnswerKey {
            raw_text: "A".to_string(),
            parsed_options: vec!["A".to_string()],
            nat_range: None,
            special_resolution: None,
            confidence: 1.0,
            origin: Some("SOURCE".to_string()),
        }),
        explanation: Some(ExplanationBlock {
            full_text: "Since Alpha is true, hence option (A) is correct.".to_string(),
            step_by_step: vec![],
            math_latex_blocks: Vec::new(),
            visual_asset_crops: Vec::new(),
        }),
        source_page_numbers: vec![1],
        ..Default::default()
    };

    ConstraintValidator::validate_and_score(&mut q);
    assert!(!q.audit_issues.contains(&"KEY_VS_SOLUTION_DISCREPANCY".to_string()));
    assert_eq!(q.confidence_score, 1.0);
}

#[test]
fn test_subjective_unsupported_question_reclassification() {
    let mut q = ReconstructedQuestion {
        id: "q-essay".to_string(),
        label: "15".to_string(),
        raw_index: 15,
        question_type: QuestionType::Mcq, // Initial default
        question_text: "Explain the working principle of a 4-stroke internal combustion engine with neat sketches.".to_string(),
        options: Vec::new(),
        answer_key: None,
        source_page_numbers: vec![1],
        ..Default::default()
    };

    ConstraintValidator::validate_and_score(&mut q);
    assert_eq!(q.question_type, QuestionType::Unsupported);
    assert!(q.audit_issues.contains(&"UNSUPPORTED_QUESTION_TYPE".to_string()));
}

#[test]
fn test_nat_target_unit_extraction_from_question_text() {
    let mut q = ReconstructedQuestion {
        id: "q-unit".to_string(),
        label: "7".to_string(),
        raw_index: 7,
        question_type: QuestionType::Nat,
        question_text: "The total power dissipated across the resistor is ________ kW.".to_string(),
        options: Vec::new(),
        target_unit: None,
        answer_key: Some(AnswerKey {
            raw_text: "4.5".to_string(),
            parsed_options: Vec::new(),
            nat_range: Some(NatRange { min: 4.5, max: 4.5 }),
            special_resolution: None,
            confidence: 1.0,
            origin: Some("SOURCE".to_string()),
        }),
        source_page_numbers: vec![1],
        ..Default::default()
    };

    ConstraintValidator::validate_and_score(&mut q);
    assert_eq!(q.target_unit.as_deref(), Some("kW"));
}

#[test]
fn test_unbalanced_latex_environments() {
    assert!(ConstraintValidator::validate_latex(r"\begin{matrix} 1 & 0 \end{matrix}").is_ok());
    assert!(ConstraintValidator::validate_latex(r"\begin{matrix} 1 & 0").is_err());
    assert!(ConstraintValidator::validate_latex(r"\begin{matrix} 1 & 0 \end{matrix} \begin{cases} x").is_err());
}

#[test]
fn test_match_the_following_validation() {
    let mut q = ReconstructedQuestion {
        id: "q-match".to_string(),
        label: "35".to_string(),
        raw_index: 35,
        question_type: QuestionType::Match,
        question_text: "Match List-I with List-II:\nList-I\nP. Quick sort\nQ. Merge sort\nList-II\n1. O(n log n) worst case\n2. O(n^2) worst case".to_string(),
        options: vec![
            OptionItem { id: "opt-A".to_string(), label: "A".to_string(), text: "P-2, Q-1".to_string(), math_latex: None, visual_asset_crop: None },
            OptionItem { id: "opt-B".to_string(), label: "B".to_string(), text: "P-1, Q-2".to_string(), math_latex: None, visual_asset_crop: None },
        ],
        answer_key: Some(AnswerKey {
            raw_text: "A".to_string(),
            parsed_options: vec!["A".to_string()],
            nat_range: None,
            special_resolution: None,
            confidence: 1.0,
            origin: Some("SOURCE".to_string()),
        }),
        source_page_numbers: vec![1],
        ..Default::default()
    };

    ConstraintValidator::validate_and_score(&mut q);
    assert_eq!(q.question_type, QuestionType::Match);
    assert_eq!(q.resolution_status.as_deref(), Some("RESOLVED"));
    assert_eq!(q.confidence_score, 1.0);
    assert!(!q.audit_issues.contains(&"MATCH_MAPPING_UNCERTAIN".to_string()));
}

#[test]
fn test_nat_with_discrete_option_key_mismatch() {
    let mut q = ReconstructedQuestion {
        id: "q-nat-mismatch".to_string(),
        label: "40".to_string(),
        raw_index: 40,
        question_type: QuestionType::Nat,
        question_text: "The value of determinant is:".to_string(),
        options: Vec::new(),
        answer_key: Some(AnswerKey {
            raw_text: "B".to_string(),
            parsed_options: vec!["B".to_string()],
            nat_range: None,
            special_resolution: None,
            confidence: 1.0,
            origin: Some("SOURCE".to_string()),
        }),
        source_page_numbers: vec![1],
        ..Default::default()
    };

    ConstraintValidator::validate_and_score(&mut q);
    assert!(q.audit_issues.contains(&"TYPE_CLASSIFICATION_UNCERTAIN".to_string()));
    assert_eq!(q.resolution_status.as_deref(), Some("REVIEW_REQUIRED"));
    assert!(q.confidence_score <= 0.70);
    assert!(q.competing_hypotheses.iter().any(|h| h.reason.contains("discrete option")));
}

#[test]
fn test_resolution_status_lifecycle() {
    // 1. Unresolved in source
    let mut q_no_key = ReconstructedQuestion {
        id: "q-unres".to_string(),
        label: "1".to_string(),
        raw_index: 1,
        question_type: QuestionType::Mcq,
        options: vec![
            OptionItem { id: "opt-A".to_string(), label: "A".to_string(), text: "1".to_string(), math_latex: None, visual_asset_crop: None },
            OptionItem { id: "opt-B".to_string(), label: "B".to_string(), text: "2".to_string(), math_latex: None, visual_asset_crop: None },
        ],
        answer_key: None,
        ..Default::default()
    };
    ConstraintValidator::validate_and_score(&mut q_no_key);
    assert_eq!(q_no_key.resolution_status.as_deref(), Some("UNRESOLVED_IN_SOURCE"));

    // 2. Errata override
    let mut q_errata = ReconstructedQuestion {
        id: "q-err".to_string(),
        label: "2".to_string(),
        raw_index: 2,
        question_type: QuestionType::Mcq,
        options: vec![
            OptionItem { id: "opt-A".to_string(), label: "A".to_string(), text: "1".to_string(), math_latex: None, visual_asset_crop: None },
            OptionItem { id: "opt-B".to_string(), label: "B".to_string(), text: "2".to_string(), math_latex: None, visual_asset_crop: None },
        ],
        answer_key: Some(AnswerKey {
            raw_text: "MTA".to_string(),
            parsed_options: Vec::new(),
            nat_range: None,
            special_resolution: Some(SpecialResolutionStatus::MarksToAll),
            confidence: 1.0,
            origin: Some("SOURCE".to_string()),
        }),
        ..Default::default()
    };
    ConstraintValidator::validate_and_score(&mut q_errata);
    assert_eq!(q_errata.resolution_status.as_deref(), Some("ERRATA_OVERRIDE"));
    assert_eq!(q_errata.confidence_score, 1.0);
}

