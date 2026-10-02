use crate::tsv::TsvBlock;
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
}

pub struct QuestionSegmenter;

impl QuestionSegmenter {
    pub fn segment_questions(blocks: &[TsvBlock], page_width: u32, page_height: u32) -> Vec<RawQuestionSegment> {
        let anchor_prefix_re = Regex::new(r"(?m)(?:^|\n)\s*(\d{1,3})\s*[\.\)]\s*(?:\[(MCQ|MSQ|NAT)\])?").unwrap();
        let q_prefix_re = Regex::new(r"(?m)(?:^|\n)\s*Q(?:uestion)?\.?\s*(\d{1,3})").unwrap();
        let standalone_qtype_re = Regex::new(r"\[(MCQ|MSQ|NAT)\]").unwrap();
        let exam_info_re = Regex::new(r"\[(GATE|JEE|CAT|NEET)[-\s]*(\d{4})?\s*[:\-]\s*([0-9\.]+)M?\]").unwrap();

        let mut segments: Vec<RawQuestionSegment> = Vec::new();
        let mut current_label: Option<String> = None;
        let mut current_index = 0u32;
        let mut current_type = QuestionType::Unknown;
        let mut current_metadata: Option<ExamMetadata> = None;
        let mut current_text = String::new();
        let mut current_rect: Option<PixelRect> = None;

        for block in blocks {
            let block_text = &block.text;
            let mut detected_num: Option<String> = None;
            let mut detected_type = QuestionType::Unknown;

            // Pattern 1: "1. [NAT]" or "1." at start of line
            if let Some(caps) = anchor_prefix_re.captures(block_text) {
                if let Some(num_match) = caps.get(1) {
                    let n: u32 = num_match.as_str().parse().unwrap_or(0);
                    if n > 0 && n <= 100 {
                        detected_num = Some(n.to_string());
                        if let Some(t_match) = caps.get(2) {
                            detected_type = match t_match.as_str() {
                                "MCQ" => QuestionType::Mcq,
                                "MSQ" => QuestionType::Msq,
                                "NAT" => QuestionType::Nat,
                                _ => QuestionType::Unknown,
                            };
                        }
                    }
                }
            }

            // Pattern 2: "Q1" or "Question 2"
            if detected_num.is_none() {
                if let Some(caps) = q_prefix_re.captures(block_text) {
                    if let Some(num_match) = caps.get(1) {
                        let n: u32 = num_match.as_str().parse().unwrap_or(0);
                        if n > 0 && n <= 100 {
                            detected_num = Some(n.to_string());
                        }
                    }
                }
            }

            // Detect standalone Question Type if not already set
            if detected_type == QuestionType::Unknown {
                if let Some(caps) = standalone_qtype_re.captures(block_text) {
                    let t_str = caps.get(1).map(|m| m.as_str()).unwrap_or("");
                    detected_type = match t_str {
                        "MCQ" => QuestionType::Mcq,
                        "MSQ" => QuestionType::Msq,
                        "NAT" => QuestionType::Nat,
                        _ => QuestionType::Unknown,
                    };
                }
            }

            // Detect Exam Metadata: [GATE-2026 : 1M] or [GATE-2013 - 2M]
            let mut metadata: Option<ExamMetadata> = None;
            if let Some(caps) = exam_info_re.captures(block_text) {
                let exam = caps.get(1).map(|m| m.as_str().to_string());
                let year = caps.get(2).and_then(|m| m.as_str().parse::<u32>().ok());
                let marks = caps.get(3).and_then(|m| m.as_str().parse::<f32>().ok());
                metadata = Some(ExamMetadata {
                    exam_name: exam,
                    year,
                    marks,
                    section: None,
                    subject: None,
                });
            }

            if let Some(num_str) = detected_num {
                // Finalize previous segment
                if let (Some(label), Some(rect)) = (current_label.take(), current_rect.take()) {
                    segments.push(RawQuestionSegment {
                        label,
                        raw_index: current_index,
                        question_type: current_type,
                        metadata: current_metadata,
                        text: current_text.trim().to_string(),
                        bounding_box: rect,
                    });
                }

                current_index = num_str.parse::<u32>().unwrap_or(current_index + 1);
                current_label = Some(num_str);
                current_type = if detected_type != QuestionType::Unknown {
                    detected_type
                } else {
                    QuestionType::Mcq
                };
                current_metadata = metadata;
                current_text = block_text.clone();
                current_rect = Some(block.rect);
            } else {
                // Continuation of current question
                if current_label.is_some() {
                    current_text.push('\n');
                    current_text.push_str(block_text);

                    if let Some(ref mut rect) = current_rect {
                        let x1 = rect.x.min(block.rect.x);
                        let y1 = rect.y.min(block.rect.y);
                        let x2 = (rect.x + rect.width).max(block.rect.x + block.rect.width);
                        let y2 = (rect.y + rect.height).max(block.rect.y + block.rect.height);

                        rect.x = x1;
                        rect.y = y1;
                        rect.width = x2.saturating_sub(x1);
                        rect.height = y2.saturating_sub(y1);
                    } else {
                        current_rect = Some(block.rect);
                    }
                }
            }
        }

        // Push final segment
        if let (Some(label), Some(rect)) = (current_label.take(), current_rect.take()) {
            segments.push(RawQuestionSegment {
                label,
                raw_index: current_index,
                question_type: current_type,
                metadata: current_metadata,
                text: current_text.trim().to_string(),
                bounding_box: rect,
            });
        }

        // Add safety padding to bounding boxes so options or exponents aren't clipped
        for s in &mut segments {
            let pad_x = 25u32;
            let pad_y = 20u32;

            s.bounding_box.x = s.bounding_box.x.saturating_sub(pad_x);
            s.bounding_box.y = s.bounding_box.y.saturating_sub(pad_y);
            s.bounding_box.width = (s.bounding_box.width + pad_x * 2).min(page_width.saturating_sub(s.bounding_box.x));
            s.bounding_box.height = (s.bounding_box.height + pad_y * 2).min(page_height.saturating_sub(s.bounding_box.y));
        }

        segments
    }
}
