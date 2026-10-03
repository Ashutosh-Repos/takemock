use takemock_core::types::*;
use takemock_solver::{AssociationSolver, RawAnswerItem};

#[test]
fn test_zero_cascade_guarantee_on_missing_question() {
    // Q1, Q2, Q3 exist. Q4 is MISSING from the question list. Q5 exists.
    let mut questions = vec![
        ReconstructedQuestion {
            id: "q-1".to_string(), label: "1".to_string(), raw_index: 1,
            question_type: QuestionType::Mcq, question_text: "Q1 text".to_string(),
            ..Default::default()
        },
        ReconstructedQuestion {
            id: "q-2".to_string(), label: "2".to_string(), raw_index: 2,
            question_type: QuestionType::Mcq, question_text: "Q2 text".to_string(),
            ..Default::default()
        },
        ReconstructedQuestion {
            id: "q-3".to_string(), label: "3".to_string(), raw_index: 3,
            question_type: QuestionType::Mcq, question_text: "Q3 text".to_string(),
            ..Default::default()
        },
        // Q4 is MISSING!
        ReconstructedQuestion {
            id: "q-5".to_string(), label: "5".to_string(), raw_index: 5,
            question_type: QuestionType::Mcq, question_text: "Q5 text".to_string(),
            ..Default::default()
        },
    ];

    let raw_answers = vec![
        RawAnswerItem { label: "1".to_string(), raw_text: "A".to_string(), parsed_options: vec!["A".to_string()], nat_range: None, special_resolution: None, target_unit: None, explanation_text: None },
        RawAnswerItem { label: "2".to_string(), raw_text: "B".to_string(), parsed_options: vec!["B".to_string()], nat_range: None, special_resolution: None, target_unit: None, explanation_text: None },
        RawAnswerItem { label: "3".to_string(), raw_text: "C".to_string(), parsed_options: vec!["C".to_string()], nat_range: None, special_resolution: None, target_unit: None, explanation_text: None },
        RawAnswerItem { label: "4".to_string(), raw_text: "D".to_string(), parsed_options: vec!["D".to_string()], nat_range: None, special_resolution: None, target_unit: None, explanation_text: None },
        RawAnswerItem { label: "5".to_string(), raw_text: "A".to_string(), parsed_options: vec!["A".to_string()], nat_range: None, special_resolution: None, target_unit: None, explanation_text: None },
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

#[test]
fn test_nat_interval_parsing() {
    use takemock_solver::AnswerKeyParser;

    let text = "Answer Key:\n1. A\n2: [12.4, 12.6]\n3. 14.5 to 16.0\n4 - 42\n5: B, D";
    let answers = AnswerKeyParser::parse_answers(text);

    assert_eq!(answers.len(), 5);

    // Q1 -> Option A
    assert_eq!(answers[0].label, "1");
    assert_eq!(answers[0].parsed_options, vec!["A"]);
    assert!(answers[0].nat_range.is_none());

    // Q2 -> NAT range [12.4, 12.6]
    assert_eq!(answers[1].label, "2");
    let r2 = answers[1].nat_range.as_ref().unwrap();
    assert!((r2.min - 12.4).abs() < 1e-4);
    assert!((r2.max - 12.6).abs() < 1e-4);

    // Q3 -> NAT range 14.5 to 16.0
    assert_eq!(answers[2].label, "3");
    let r3 = answers[2].nat_range.as_ref().unwrap();
    assert!((r3.min - 14.5).abs() < 1e-4);
    assert!((r3.max - 16.0).abs() < 1e-4);

    // Q4 -> NAT single value 42
    assert_eq!(answers[3].label, "4");
    let r4 = answers[3].nat_range.as_ref().unwrap();
    assert!((r4.min - 42.0).abs() < 1e-4);
    assert!((r4.max - 42.0).abs() < 1e-4);

    // Q5 -> MSQ options B, D
    assert_eq!(answers[4].label, "5");
    assert_eq!(answers[4].parsed_options, vec!["B", "D"]);
    assert!(answers[4].nat_range.is_none());
}

#[test]
fn test_errata_mta_bonus_multi_accepted_and_target_unit() {
    use takemock_core::SpecialResolutionStatus;
    use takemock_solver::AnswerKeyParser;

    let text = "Official Key:\n1. MTA\n2. BONUS\n3. DROPPED\n4. A OR C\n5: 4.5 kW";
    let answers = AnswerKeyParser::parse_answers(text);

    assert_eq!(answers.len(), 5);

    // Q1 -> MTA
    assert_eq!(answers[0].label, "1");
    assert_eq!(answers[0].special_resolution, Some(SpecialResolutionStatus::MarksToAll));

    // Q2 -> Bonus
    assert_eq!(answers[1].label, "2");
    assert_eq!(answers[1].special_resolution, Some(SpecialResolutionStatus::Bonus));

    // Q3 -> Dropped
    assert_eq!(answers[2].label, "3");
    assert_eq!(answers[2].special_resolution, Some(SpecialResolutionStatus::Dropped));

    // Q4 -> MultiAccepted "A OR C"
    assert_eq!(answers[3].label, "4");
    assert_eq!(answers[3].special_resolution, Some(SpecialResolutionStatus::MultiAccepted));
    assert_eq!(answers[3].parsed_options, vec!["A", "C"]);

    // Q5 -> NAT with target unit "kW"
    assert_eq!(answers[4].label, "5");
    let r5 = answers[4].nat_range.as_ref().unwrap();
    assert!((r5.min - 4.5).abs() < 1e-4);
    assert_eq!(answers[4].target_unit.as_deref(), Some("kW"));
}


