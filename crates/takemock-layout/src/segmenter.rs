use crate::tsv::{TsvBlock, TsvLine};
use regex::Regex;
use takemock_core::{ExamMetadata, PixelRect, QuestionType};

#[derive(Debug, Clone)]
pub struct RawQuestionSegment {
    pub label: String,
    pub raw_index: u32,
    pub question_type: QuestionType,
    pub metadata: Option<ExamMetadata>,
    pub text: String,
    pub bounding_box: PixelRect,
    pub fragments: Vec<PixelRect>,
    pub stimulus_id: Option<String>,
    pub stimulus_text: Option<String>,
}

#[derive(Debug, Clone)]
struct ActiveStimulus {
    id: String,
    start: u32,
    end: u32,
    text: String,
    is_collecting: bool,
}

pub struct QuestionSegmenter;

impl QuestionSegmenter {
    pub fn segment_questions(blocks: &[TsvBlock], page_width: u32, page_height: u32) -> Vec<RawQuestionSegment> {
        let (segs, pending) = Self::segment_questions_with_continuation(blocks, page_width, page_height, None, 0);
        let mut all = segs;
        if let Some(p) = pending {
            all.push(p);
        }
        all
    }

    pub fn segment_questions_with_continuation(
        blocks: &[TsvBlock],
        page_width: u32,
        page_height: u32,
        pending_question: Option<RawQuestionSegment>,
        base_index: u32,
    ) -> (Vec<RawQuestionSegment>, Option<RawQuestionSegment>) {
        let mut lines = Vec::new();
        for b in blocks {
            for l in &b.lines {
                lines.push(l.clone());
            }
        }
        Self::segment_lines_with_continuation(&lines, page_width, page_height, pending_question, base_index)
    }

    pub fn segment_lines_with_continuation(
        lines: &[TsvLine],
        page_width: u32,
        page_height: u32,
        pending_question: Option<RawQuestionSegment>,
        base_index: u32,
    ) -> (Vec<RawQuestionSegment>, Option<RawQuestionSegment>) {
        let anchor_prefix_re = Regex::new(r"(?i)(?:^|[^\w\d])(?:Q(?:uestion)?\.?\s*)?(\d{1,3})\s*(?:\.|\s+[\[\{\(I|lj1]?(?:MCQ|MSQ|NAT|GATE))").unwrap();
        let q_prefix_re = Regex::new(r"(?i)^\s*(?:Q(?:uestion)?|Que\.?)\s*(\d{1,3})\b").unwrap();
        let standalone_qtype_re = Regex::new(r"(?i)[\[\{\(I|lj1]?\s*(MCQ|MSQ|NAT)\s*[\]\}\)1y\.,\s]").unwrap();
        let exam_info_re = Regex::new(r"(?i)[\[\{\(I|lj1]?\s*(?:a|A)?(GATE|JEE|CAT|NEET)[-\s]*(\d{4})?\s*[:;\-\*]\s*([0-9\.]+)M?").unwrap();
        let stimulus_header_re = Regex::new(r"(?i)(?:Statement\s+for\s+Linked(?:\s+Answer)?\s+Questions?|Common\s+Data\s+for\s+Questions?)\s*(?:Q\.?\s*)?(\d{1,3})\s*(?:to|and|&|-)\s*(\d{1,3})").unwrap();
        let match_re = Regex::new(r"(?i)\b(?:match\s+the\s+following|match\s+list|list-i\b|group-i\b)").unwrap();

        let mut segments: Vec<RawQuestionSegment> = Vec::new();
        let mut active_stimulus: Option<ActiveStimulus> = None;

        let (
            mut current_label,
            mut current_index,
            mut current_type,
            mut current_metadata,
            mut current_text,
            mut current_rect,
            mut current_fragments,
            mut current_line_count,
            mut current_stimulus_id,
            mut current_stimulus_text,
        ): (
            Option<String>,
            u32,
            QuestionType,
            Option<ExamMetadata>,
            String,
            Option<PixelRect>,
            Vec<PixelRect>,
            usize,
            Option<String>,
            Option<String>,
        ) = if let Some(p) = pending_question {
            (
                Some(p.label),
                p.raw_index,
                p.question_type,
                p.metadata,
                p.text,
                None,
                p.fragments,
                1usize,
                p.stimulus_id,
                p.stimulus_text,
            )
        } else {
            (None, base_index, QuestionType::Unknown, None, String::new(), None, Vec::new(), 0usize, None, None)
        };

        for line in lines {
            let line_text = line.text.trim();
            if line_text.is_empty() {
                continue;
            }

            // Check for Common Data / Statement for Linked Questions banner
            if let Some(caps) = stimulus_header_re.captures(line_text) {
                let q_start: u32 = caps.get(1).and_then(|m| m.as_str().parse().ok()).unwrap_or(0);
                let q_end: u32 = caps.get(2).and_then(|m| m.as_str().parse().ok()).unwrap_or(0);
                if q_start > 0 && q_end >= q_start {
                    // Finalize any previously open question
                    if let Some(label) = current_label.take() {
                        let mut frags = current_fragments;
                        if let Some(r) = current_rect.take() {
                            frags.push(r);
                        }
                        if !frags.is_empty() {
                            let primary_box = frags[0];
                            segments.push(RawQuestionSegment {
                                label,
                                raw_index: current_index,
                                question_type: current_type,
                                metadata: current_metadata.take(),
                                text: current_text.trim().to_string(),
                                bounding_box: primary_box,
                                fragments: frags,
                                stimulus_id: current_stimulus_id.take(),
                                stimulus_text: current_stimulus_text.take(),
                            });
                        }
                    }

                    active_stimulus = Some(ActiveStimulus {
                        id: format!("stim-{}-{}", q_start, q_end),
                        start: q_start,
                        end: q_end,
                        text: String::new(),
                        is_collecting: true,
                    });
                    current_rect = None;
                    current_fragments = Vec::new();
                    current_line_count = 0;
                    continue;
                }
            }

            // Skip chapter headers when no question is open yet
            if current_label.is_none() {
                let upper = line_text.to_uppercase();
                if upper.contains("CHAPTER") || upper.contains("FUNCTIONAL DEPENDENCY") || upper.contains("NORMALIZATION") {
                    continue;
                }
            }

            let mut detected_num: Option<String> = None;
            let mut detected_type = QuestionType::Unknown;
            let mut detected_metadata: Option<ExamMetadata> = None;

            // 1. Detect question type: [MCQ], [MSQ], [NAT], or Match
            if let Some(caps) = standalone_qtype_re.captures(line_text) {
                let t_str = caps.get(1).map(|m| m.as_str().to_uppercase()).unwrap_or_default();
                detected_type = match t_str.as_str() {
                    "MCQ" => QuestionType::Mcq,
                    "MSQ" => QuestionType::Msq,
                    "NAT" => QuestionType::Nat,
                    _ => QuestionType::Unknown,
                };
            }
            if detected_type == QuestionType::Unknown && match_re.is_match(line_text) {
                detected_type = QuestionType::Match;
            }

            // 2. Detect Exam Metadata: [GATE-2026 : 1M] or [GATE-2013 - 2M]
            if let Some(caps) = exam_info_re.captures(line_text) {
                let exam = caps.get(1).map(|m| m.as_str().to_uppercase());
                let year = caps.get(2).and_then(|m| m.as_str().parse::<u32>().ok());
                let marks = caps.get(3).and_then(|m| m.as_str().parse::<f32>().ok());
                detected_metadata = Some(ExamMetadata {
                    exam_name: exam,
                    year,
                    marks,
                    section: None,
                    subject: None,
                });
            }

            // 3. Detect Question Number Anchor: "1." or "Q2" or "4 INAT"
            if let Some(caps) = anchor_prefix_re.captures(line_text) {
                if let Some(num_match) = caps.get(1) {
                    let n: u32 = num_match.as_str().parse().unwrap_or(0);
                    let is_start = num_match.start() <= 6;
                    if n > 0 && n <= 200 && (is_start || detected_type != QuestionType::Unknown || detected_metadata.is_some()) {
                        // Check for clipped tens digit (e.g., "7." when expecting 17)
                        let corrected_n = if n <= current_index && current_index >= 10 && current_index < 100 {
                            let tens = (current_index / 10) * 10;
                            if tens + n == current_index + 1 {
                                tens + n
                            } else if tens + 10 + n == current_index + 1 {
                                tens + 10 + n
                            } else {
                                n
                            }
                        } else {
                            n
                        };

                        let is_explicit = detected_type != QuestionType::Unknown
                            || detected_metadata.is_some()
                            || active_stimulus.as_ref().map_or(false, |s| corrected_n >= s.start && corrected_n <= s.end);

                        if current_index == 0 {
                            if corrected_n <= 25 || is_explicit {
                                detected_num = Some(corrected_n.to_string());
                            }
                        } else if (corrected_n >= current_index && corrected_n <= current_index + 6) || is_explicit {
                            detected_num = Some(corrected_n.to_string());
                        }
                    }
                }
            }

            if detected_num.is_none() {
                if let Some(caps) = q_prefix_re.captures(line_text) {
                    if let Some(num_match) = caps.get(1) {
                        let n: u32 = num_match.as_str().parse().unwrap_or(0);
                        let is_explicit = detected_type != QuestionType::Unknown
                            || detected_metadata.is_some()
                            || active_stimulus.as_ref().map_or(false, |s| n >= s.start && n <= s.end);

                        if current_index == 0 {
                            if n <= 25 || is_explicit {
                                detected_num = Some(n.to_string());
                            }
                        } else if (n >= current_index && n <= current_index + 6) || is_explicit {
                            detected_num = Some(n.to_string());
                        }
                    }
                }
            }

            // Fallback: If exam metadata or archetype is detected:
            // - If no question is open yet, this starts the first question!
            // - If a question is open and has options or is NAT, this starts the next question!
            let y_distance = if let Some(r) = current_rect {
                line.rect.y.saturating_sub(r.y)
            } else {
                100u32
            };

            let has_options_so_far = current_text.contains("(c)") || current_text.contains("(d)") || current_text.contains("(D)") || current_text.contains("D.");
            let is_next_question_badge = (detected_metadata.is_some() || detected_type != QuestionType::Unknown)
                && (current_label.is_none()
                    || (y_distance >= 60 && current_line_count >= 2 && (has_options_so_far || current_type == QuestionType::Nat || current_line_count >= 5)));

            // If collecting stimulus passage and no question open, accumulate stimulus text
            if current_label.is_none() {
                if let Some(ref mut stim) = active_stimulus {
                    if stim.is_collecting && detected_num.is_none() && !is_next_question_badge {
                        stim.text.push_str(line_text);
                        stim.text.push('\n');
                        continue;
                    }
                }
            }

            let too_close = current_label.is_some() && current_line_count <= 2 && y_distance < 60;
            let starts_new_question = !too_close && (detected_num.is_some() || (is_next_question_badge && detected_num.is_none()));

            if starts_new_question {
                let num_str = detected_num.clone().unwrap_or_else(|| (current_index + 1).to_string());
                println!("   [SEG_DEBUG] Line y={}: STARTS Q{} (detected_num={:?}, badge={}): {}", line.rect.y, num_str, detected_num, is_next_question_badge, line_text);

                // Finalize previous segment
                if let Some(label) = current_label.take() {
                    let mut frags = current_fragments;
                    if let Some(r) = current_rect.take() {
                        frags.push(r);
                    }
                    if !frags.is_empty() {
                        let primary_box = frags[0];
                        segments.push(RawQuestionSegment {
                            label,
                            raw_index: current_index,
                            question_type: current_type,
                            metadata: current_metadata.take(),
                            text: current_text.trim().to_string(),
                            bounding_box: primary_box,
                            fragments: frags,
                            stimulus_id: current_stimulus_id.take(),
                            stimulus_text: current_stimulus_text.take(),
                        });
                    }
                }

                let num_str = detected_num.unwrap_or_else(|| (current_index + 1).to_string());
                current_index = num_str.parse::<u32>().unwrap_or(current_index + 1);
                current_label = Some(num_str);
                current_type = if detected_type != QuestionType::Unknown {
                    detected_type
                } else {
                    QuestionType::Mcq
                };
                current_metadata = detected_metadata;
                current_text = line_text.to_string();
                current_rect = Some(line.rect);
                current_fragments = Vec::new();
                current_line_count = 1;

                // Check stimulus association for this question
                if let Some(ref mut stim) = active_stimulus {
                    if current_index >= stim.start && current_index <= stim.end {
                        stim.is_collecting = false;
                        current_stimulus_id = Some(stim.id.clone());
                        current_stimulus_text = Some(stim.text.trim().to_string());
                    } else if current_index > stim.end {
                        active_stimulus = None;
                        current_stimulus_id = None;
                        current_stimulus_text = None;
                    } else {
                        current_stimulus_id = None;
                        current_stimulus_text = None;
                    }
                } else {
                    current_stimulus_id = None;
                    current_stimulus_text = None;
                }
            } else {
                // Continuation of current question
                if current_label.is_some() {
                    current_text.push('\n');
                    current_text.push_str(line_text);
                    current_line_count += 1;

                    if detected_metadata.is_some() && current_metadata.is_none() {
                        current_metadata = detected_metadata;
                    }
                    if detected_type != QuestionType::Unknown && current_type == QuestionType::Unknown {
                        current_type = detected_type;
                    } else if detected_type == QuestionType::Match {
                        current_type = QuestionType::Match;
                    }

                    if let Some(ref mut rect) = current_rect {
                        let x1 = rect.x.min(line.rect.x);
                        let y1 = rect.y.min(line.rect.y);
                        let x2 = (rect.x + rect.width).max(line.rect.x + line.rect.width);
                        let y2 = (rect.y + rect.height).max(line.rect.y + line.rect.height);

                        rect.x = x1;
                        rect.y = y1;
                        rect.width = x2.saturating_sub(x1);
                        rect.height = y2.saturating_sub(y1);
                    } else {
                        current_rect = Some(line.rect);
                    }
                }
            }
        }

        // Add safety padding to bounding boxes so options or exponents aren't clipped
        let pad_x = 25u32;
        let pad_y = 20u32;
        for s in &mut segments {
            for frag in &mut s.fragments {
                frag.x = frag.x.saturating_sub(pad_x);
                frag.y = frag.y.saturating_sub(pad_y);
                frag.width = (frag.width + pad_x * 2).min(page_width.saturating_sub(frag.x));
                frag.height = (frag.height + pad_y * 2).min(page_height.saturating_sub(frag.y));
            }
            if let Some(first) = s.fragments.first() {
                s.bounding_box = *first;
            }
        }

        // Evaluate whether the final question is incomplete and should continue
        let pending = if let Some(label) = current_label {
            let trimmed = current_text.trim();
            let ends_with_punct = trimmed.ends_with('.') || trimmed.ends_with('?') || trimmed.ends_with(':');
            let has_options = trimmed.contains("(b)") || trimmed.contains("(c)") || trimmed.contains("(d)") || trimmed.contains("(D)") || trimmed.contains("D.");

            let mut frags = current_fragments;
            if let Some(r) = current_rect {
                frags.push(r);
            }
            for frag in &mut frags {
                frag.x = frag.x.saturating_sub(pad_x);
                frag.y = frag.y.saturating_sub(pad_y);
                frag.width = (frag.width + pad_x * 2).min(page_width.saturating_sub(frag.x));
                frag.height = (frag.height + pad_y * 2).min(page_height.saturating_sub(frag.y));
            }

            let primary_box = frags.first().cloned().unwrap_or(PixelRect { x: 0, y: 0, width: 1, height: 1 });

            let final_seg = RawQuestionSegment {
                label,
                raw_index: current_index,
                question_type: current_type,
                metadata: current_metadata,
                text: current_text.trim().to_string(),
                bounding_box: primary_box,
                fragments: frags,
                stimulus_id: current_stimulus_id,
                stimulus_text: current_stimulus_text,
            };

            let is_complete = if current_type == QuestionType::Mcq || current_type == QuestionType::Msq {
                has_options
            } else {
                ends_with_punct || has_options
            };

            if !is_complete {
                Some(final_seg)
            } else {
                segments.push(final_seg);
                None
            }
        } else {
            None
        };

        (segments, pending)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_common_data_linked_passage_extraction() {
        let lines = vec![
            TsvLine {
                rect: PixelRect { x: 50, y: 100, width: 400, height: 20 },
                text: "Statement for Linked Answer Questions 52 and 53:".to_string(),
                words: Vec::new(),
            },
            TsvLine {
                rect: PixelRect { x: 50, y: 130, width: 400, height: 20 },
                text: "A 4-pole, 50 Hz, 3-phase induction motor has a rotor resistance of 0.04 ohm.".to_string(),
                words: Vec::new(),
            },
            TsvLine {
                rect: PixelRect { x: 50, y: 160, width: 400, height: 20 },
                text: "52. [MCQ] The slip at maximum torque is:".to_string(),
                words: Vec::new(),
            },
            TsvLine {
                rect: PixelRect { x: 50, y: 190, width: 400, height: 20 },
                text: "(A) 0.1 (B) 0.2 (C) 0.3 (D) 0.4".to_string(),
                words: Vec::new(),
            },
            TsvLine {
                rect: PixelRect { x: 50, y: 230, width: 400, height: 20 },
                text: "53. [MCQ] The starting torque as a percentage of maximum torque is:".to_string(),
                words: Vec::new(),
            },
            TsvLine {
                rect: PixelRect { x: 50, y: 260, width: 400, height: 20 },
                text: "(A) 25% (B) 38.4% (C) 50% (D) 72%".to_string(),
                words: Vec::new(),
            },
            TsvLine {
                rect: PixelRect { x: 50, y: 300, width: 400, height: 20 },
                text: "54. [NAT] Independent question not linked to motor:".to_string(),
                words: Vec::new(),
            },
        ];

        let (segments, _) = QuestionSegmenter::segment_lines_with_continuation(&lines, 1000, 1000, None, 0);
        assert_eq!(segments.len(), 3);

        // Q52
        let q52 = &segments[0];
        assert_eq!(q52.label, "52");
        assert_eq!(q52.stimulus_id.as_deref(), Some("stim-52-53"));
        assert!(q52.stimulus_text.as_ref().unwrap().contains("induction motor"));

        // Q53
        let q53 = &segments[1];
        assert_eq!(q53.label, "53");
        assert_eq!(q53.stimulus_id.as_deref(), Some("stim-52-53"));
        assert!(q53.stimulus_text.as_ref().unwrap().contains("induction motor"));

        // Q54 - Should NOT have stimulus
        let q54 = &segments[2];
        assert_eq!(q54.label, "54");
        assert!(q54.stimulus_id.is_none());
        assert!(q54.stimulus_text.is_none());
    }
}

