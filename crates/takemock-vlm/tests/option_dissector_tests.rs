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
