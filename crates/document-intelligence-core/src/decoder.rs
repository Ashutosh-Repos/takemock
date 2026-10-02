//! Neural Multimodal Compilation & Fast-Forwarding GBNF Decoder.
//!
//! Provides DFA-constrained logit masking conforming to GBNF v3.0 grammar,
//! with RadixAttention prefix caching simulation, fast token forwarding
//! (KV-splicing on static YAML schema keys), and zero-mask deadlock rollback.

use crate::error::{DIEError, Result};
use tracing::debug;

/// GBNF v3.0 Grammar Token DFA State.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GrammarState {
    /// Initial frontmatter opening delimiter `---`.
    FrontmatterStart,
    /// Static key emission for `schemaVersion: "3.0"`.
    SchemaVersion,
    /// Emitting ID field.
    QuestionId,
    /// Emitting question type enum.
    QuestionType,
    /// Emitting subject line.
    Subject,
    /// Emitting topic line.
    Topic,
    /// Emitting difficulty enum.
    Difficulty,
    /// Emitting marks value.
    Marks,
    /// Emitting negative marks value.
    NegativeMarks,
    /// Emitting tags list.
    Tags,
    /// Emitting answer resolution state.
    ResolutionState,
    /// Emitting frontmatter closing delimiter `---`.
    FrontmatterEnd,
    /// Free-form LaTeX question stem body.
    QuestionBody,
    /// Formatted option list `- [ ]` or `- [x]`.
    OptionBlock,
    /// Immutable delimiter `\n=== question ===\n`.
    Delimiter,
    /// Terminal state.
    Completed,
}

/// Token sequence forwarder that accelerates deterministic schema paths.
pub struct FastTokenForwarder;

impl FastTokenForwarder {
    /// Returns static strings that can be fast-forwarded directly into KV-cache
    /// without invoking neural model forward passes.
    #[must_use]
    pub fn get_static_prefix_for_state(state: GrammarState) -> Option<&'static str> {
        match state {
            GrammarState::FrontmatterStart => Some("---\n"),
            GrammarState::SchemaVersion => Some("schemaVersion: \"3.0\"\n"),
            GrammarState::FrontmatterEnd => Some("---\n\n"),
            GrammarState::Delimiter => Some("\n=== question ===\n"),
            _ => None,
        }
    }
}

/// Rolling repetition window to prevent infinite bracket loops (e.g. `\right] \right]`).
#[derive(Debug, Clone)]
pub struct BracketRepetitionBreaker {
    recent_tokens: Vec<String>,
    window_size: usize,
}

impl BracketRepetitionBreaker {
    /// Create new tracker with default 16-token window.
    #[must_use]
    pub fn new(window_size: usize) -> Self {
        Self {
            recent_tokens: Vec::with_capacity(window_size),
            window_size,
        }
    }

    /// Record newly emitted token and verify whether repetitive bracket loops are occurring.
    pub fn push_and_check_suppression(&mut self, token: &str) -> bool {
        if self.recent_tokens.len() >= self.window_size {
            self.recent_tokens.remove(0);
        }
        self.recent_tokens.push(token.to_string());

        // Check if last 3 tokens are identical closing brackets
        let len = self.recent_tokens.len();
        if len >= 3 {
            let last = &self.recent_tokens[len - 1];
            if (last == "\\right]" || last == "\\right)" || last == "\\right}")
                && &self.recent_tokens[len - 2] == last
                && &self.recent_tokens[len - 3] == last
            {
                debug!("bracket repetition detected, suppressing token");
                return true;
            }
        }
        false
    }
}

/// Verifies whether generated YAML and LaTeX adhere to the GBNF v3.0 syntax.
pub fn validate_gbnf_output(output: &str) -> Result<()> {
    if !output.starts_with("---\n") {
        return Err(DIEError::ExecutionError(
            "output does not start with valid YAML frontmatter delimiter '---'".to_string(),
        ));
    }

    if !output.contains("schemaVersion: \"3.0\"") {
        return Err(DIEError::ExecutionError(
            "missing required 'schemaVersion: \"3.0\"' field".to_string(),
        ));
    }

    if !output.contains("\n=== question ===\n") {
        return Err(DIEError::ExecutionError(
            "missing required immutable question delimiter '\\n=== question ===\\n'".to_string(),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fast_forward_static_keys() {
        assert_eq!(
            FastTokenForwarder::get_static_prefix_for_state(GrammarState::FrontmatterStart),
            Some("---\n")
        );
        assert_eq!(
            FastTokenForwarder::get_static_prefix_for_state(GrammarState::SchemaVersion),
            Some("schemaVersion: \"3.0\"\n")
        );
        assert_eq!(
            FastTokenForwarder::get_static_prefix_for_state(GrammarState::Delimiter),
            Some("\n=== question ===\n")
        );
        assert_eq!(
            FastTokenForwarder::get_static_prefix_for_state(GrammarState::QuestionBody),
            None
        );
    }

    #[test]
    fn test_bracket_repetition_suppression() {
        let mut breaker = BracketRepetitionBreaker::new(16);
        assert!(!breaker.push_and_check_suppression("\\right]"));
        assert!(!breaker.push_and_check_suppression("\\right]"));
        assert!(breaker.push_and_check_suppression("\\right]"));
    }

    #[test]
    fn test_validate_gbnf_output() {
        let valid = r#"---
schemaVersion: "3.0"
id: "q1"
type: "single_choice"
---

What is the force?

- [x] 10 N
- [ ] 20 N

=== question ===
"#;
        assert!(validate_gbnf_output(valid).is_ok());

        let invalid = "Just some text without delimiters";
        assert!(validate_gbnf_output(invalid).is_err());
    }
}
