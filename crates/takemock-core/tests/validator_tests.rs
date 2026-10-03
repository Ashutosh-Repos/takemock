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
        exam_metadata: None,
        question_type: QuestionType::Mcq,
        question_text: "Sample question".to_string(),
        math_latex: None,
        options: vec![
            OptionItem { id: "opt-A".to_string(), label: "A".to_string(), text: "1".to_string(), math_latex: None, visual_asset_crop: None },
            OptionItem { id: "opt-B".to_string(), label: "B".to_string(), text: "2".to_string(), math_latex: None, visual_asset_crop: None },
        ],
        answer_key: Some(AnswerKey {
            raw_text: "A, B".to_string(),
            parsed_options: vec!["A".to_string(), "B".to_string()],
            nat_range: None,
            confidence: 1.0,
        }),
        explanation: None,
        diagram_crop_path: None,
        provenance: None,
        competing_hypotheses: Vec::new(),
        audit_issues: Vec::new(),
        confidence_score: 1.0,
        source_page_numbers: vec![1],
    };

    ConstraintValidator::validate_and_score(&mut q);
    assert_eq!(q.question_type, QuestionType::Msq);
    assert_eq!(q.competing_hypotheses.len(), 1);
}
