use takemock_vlm::VlmRunner;

#[test]
fn test_inline_horizontal_options_dissection() {
    let raw = "How many candidate keys does the relation R have?\n(a) 3 (b) 4 (c) 5 (d) 6";
    let (statement, options) = VlmRunner::parse_text_options(raw);

    assert_eq!(statement, "How many candidate keys does the relation R have?");
    assert_eq!(options.len(), 4);
    assert_eq!(options[0].label, "A");
    assert_eq!(options[0].text, "3");
    assert_eq!(options[1].label, "B");
    assert_eq!(options[1].text, "4");
    assert_eq!(options[2].label, "C");
    assert_eq!(options[2].text, "5");
    assert_eq!(options[3].label, "D");
    assert_eq!(options[3].text, "6");
}

#[test]
fn test_vertical_stacked_options() {
    let raw = "Which of the following is correct?\n(A) First option\n(B) Second option\n(C) Third option\n(D) Fourth option";
    let (statement, options) = VlmRunner::parse_text_options(raw);

    assert_eq!(statement, "Which of the following is correct?");
    assert_eq!(options.len(), 4);
    assert_eq!(options[0].label, "A");
    assert_eq!(options[0].text, "First option");
    assert_eq!(options[3].label, "D");
    assert_eq!(options[3].text, "Fourth option");
}

#[test]
fn test_false_positive_single_match_protection() {
    let raw = "Consider a square matrix (A) of size 2x2 with non-zero determinant. Find the trace of inverse of matrix.";
    let (statement, options) = VlmRunner::parse_text_options(raw);

    assert_eq!(statement, raw);
    assert!(options.is_empty());
}

#[test]
fn test_numbered_options_1_to_4() {
    let raw = "The terminal velocity of a falling sphere is:\n(1) 9.8 m/s (2) 19.6 m/s (3) 29.4 m/s (4) 39.2 m/s";
    let (statement, options) = VlmRunner::parse_text_options(raw);

    assert_eq!(statement, "The terminal velocity of a falling sphere is:");
    assert_eq!(options.len(), 4);
    assert_eq!(options[0].label, "A");
    assert_eq!(options[0].text, "9.8 m/s");
    assert_eq!(options[1].label, "B");
    assert_eq!(options[1].text, "19.6 m/s");
    assert_eq!(options[2].label, "C");
    assert_eq!(options[2].text, "29.4 m/s");
    assert_eq!(options[3].label, "D");
    assert_eq!(options[3].text, "39.2 m/s");
}

#[test]
fn test_assertion_reason_sub_statement_protection() {
    let raw = "Statement I: Every tree is a bipartite graph.\nStatement II: Every bipartite graph has no odd cycles.\n(A) Both Statement I and Statement II are true\n(B) Both Statement I and Statement II are false\n(C) Statement I is true but Statement II is false\n(D) Statement I is false but Statement II is true";
    let (statement, options) = VlmRunner::parse_text_options(raw);

    assert!(statement.contains("Statement I: Every tree is a bipartite graph."));
    assert!(statement.contains("Statement II: Every bipartite graph has no odd cycles."));
    assert_eq!(options.len(), 4);
    assert_eq!(options[0].label, "A");
    assert_eq!(options[3].label, "D");
}
