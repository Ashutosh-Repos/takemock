use takemock_core::types::*;
use takemock_solver::{AssociationSolver, RawAnswerItem};

#[test]
fn test_zero_cascade_guarantee_on_missing_question() {
    // Q1, Q2, Q3 exist. Q4 is MISSING from the question list. Q5 exists.
    let mut questions = vec![
        ReconstructedQuestion {
            id: "q-1".to_string(), label: "1".to_string(), raw_index: 1, exam_metadata: None,
            question_type: QuestionType::Mcq, question_text: "Q1 text".to_string(),
            math_latex: None, options: Vec::new(), answer_key: None, explanation: None,
            diagram_crop_path: None, provenance: None, competing_hypotheses: Vec::new(), confidence_score: 1.0,
            source_page_numbers: vec![1],
        },
        ReconstructedQuestion {
            id: "q-2".to_string(), label: "2".to_string(), raw_index: 2, exam_metadata: None,
            question_type: QuestionType::Mcq, question_text: "Q2 text".to_string(),
            math_latex: None, options: Vec::new(), answer_key: None, explanation: None,
            diagram_crop_path: None, provenance: None, competing_hypotheses: Vec::new(), confidence_score: 1.0,
            source_page_numbers: vec![1],
        },
        ReconstructedQuestion {
            id: "q-3".to_string(), label: "3".to_string(), raw_index: 3, exam_metadata: None,
            question_type: QuestionType::Mcq, question_text: "Q3 text".to_string(),
            math_latex: None, options: Vec::new(), answer_key: None, explanation: None,
            diagram_crop_path: None, provenance: None, competing_hypotheses: Vec::new(), confidence_score: 1.0,
            source_page_numbers: vec![1],
        },
        // Q4 is MISSING!
        ReconstructedQuestion {
            id: "q-5".to_string(), label: "5".to_string(), raw_index: 5, exam_metadata: None,
            question_type: QuestionType::Mcq, question_text: "Q5 text".to_string(),
            math_latex: None, options: Vec::new(), answer_key: None, explanation: None,
            diagram_crop_path: None, provenance: None, competing_hypotheses: Vec::new(), confidence_score: 1.0,
            source_page_numbers: vec![1],
        },
    ];

    let raw_answers = vec![
        RawAnswerItem { label: "1".to_string(), raw_text: "A".to_string(), parsed_options: vec!["A".to_string()], explanation_text: None },
        RawAnswerItem { label: "2".to_string(), raw_text: "B".to_string(), parsed_options: vec!["B".to_string()], explanation_text: None },
        RawAnswerItem { label: "3".to_string(), raw_text: "C".to_string(), parsed_options: vec!["C".to_string()], explanation_text: None },
        RawAnswerItem { label: "4".to_string(), raw_text: "D".to_string(), parsed_options: vec!["D".to_string()], explanation_text: None },
        RawAnswerItem { label: "5".to_string(), raw_text: "A".to_string(), parsed_options: vec!["A".to_string()], explanation_text: None },
    ];

    AssociationSolver::associate(&mut questions, raw_answers).unwrap();

    // Verify:
    // Q1 -> A
    // Q2 -> B
    // Q3 -> C
    // Q5 MUST BE 'A' (Answer 5) and NEVER 'D' (Answer 4)! ZERO OFF-BY-ONE CASCADE!
    assert_eq!(questions[0].answer_key.as_ref().unwrap().raw_text, "A");
    assert_eq!(questions[1].answer_key.as_ref().unwrap().raw_text, "B");
    assert_eq!(questions[2].answer_key.as_ref().unwrap().raw_text, "C");
    assert_eq!(questions[3].answer_key.as_ref().unwrap().raw_text, "A");
}
