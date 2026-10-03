use anyhow::Result;
use regex::Regex;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use takemock_core::{ConstraintValidator, Database, ReconstructedQuestion, SourceProvenance};
use takemock_cv::{orientation::OrientationDetector, ImageProcessor};
use takemock_layout::{ColumnProcessor, QuestionSegmenter, RawQuestionSegment, TsvParser};
use takemock_solver::{AnswerKeyParser, AssociationSolver, RawAnswerItem};
use takemock_vlm::VlmRunner;

#[derive(Debug, Clone)]
pub enum InputImage {
    Path(PathBuf),
    Memory {
        bytes: Vec<u8>,
        hint: String,
    },
}

use crate::IngestionMode;

#[derive(Debug, Clone)]
pub struct PipelineConfig {
    pub mode: IngestionMode,
    pub storage_dir: PathBuf,
    pub use_vlm: bool,
    pub vlm_model_path: PathBuf,
    pub vlm_mmproj_path: PathBuf,
    pub answer_key_path: Option<PathBuf>,
    pub external_answers: Vec<RawAnswerItem>,
    pub answer_inputs: Vec<InputImage>,
    pub solution_inputs: Vec<InputImage>,
}

impl Default for PipelineConfig {
    fn default() -> Self {
        Self {
            mode: IngestionMode::Mode1Decoupled,
            storage_dir: PathBuf::from("output"),
            use_vlm: false,
            vlm_model_path: PathBuf::from("models/Qwen2-VL-2B-Instruct-Q4_K_M.gguf"),
            vlm_mmproj_path: PathBuf::from("models/mmproj-Qwen2-VL-2B-Instruct-f16.gguf"),
            answer_key_path: None,
            external_answers: Vec::new(),
            answer_inputs: Vec::new(),
            solution_inputs: Vec::new(),
        }
    }
}

fn extract_text_from_input(input: &InputImage, temp_dir: &Path) -> Result<String> {
    let (raw_img, rot) = match input {
        InputImage::Path(ref p) => {
            let rot = OrientationDetector::detect_angle_from_file(p).unwrap_or(0);
            let img = ImageProcessor::load_image(p)?;
            (img, rot)
        }
        InputImage::Memory { ref bytes, hint: _ } => {
            let img = image::load_from_memory(bytes)?;
            let temp_input = temp_dir.join(format!("takemock_mem_helper_{}.png", uuid::Uuid::new_v4()));
            let rot = if img.save(&temp_input).is_ok() {
                let r = OrientationDetector::detect_angle_from_file(&temp_input).unwrap_or(0);
                let _ = std::fs::remove_file(&temp_input);
                r
            } else {
                0
            };
            (img, rot)
        }
    };

    let oriented_img = ImageProcessor::rotate(&raw_img, rot);
    let enhanced = ImageProcessor::enhance_for_ocr(&oriented_img);
    let temp_page = temp_dir.join(format!("takemock_extract_{}.png", uuid::Uuid::new_v4()));
    enhanced.save(&temp_page)?;

    let lines = TsvParser::parse_lines_psm6(&temp_page).unwrap_or_default();
    let _ = std::fs::remove_file(&temp_page);

    let ordered = ColumnProcessor::order_lines_in_reading_order(lines);
    let full_text = ordered.iter().map(|l| l.text.as_str()).collect::<Vec<_>>().join("\n");
    Ok(full_text)
}

fn parse_solutions_from_text(text: &str) -> Vec<(String, String)> {
    let anchor_re = Regex::new(r"(?im)^\s*(?:Sol(?:ution)?\.?|Exp(?:lanation)?\.?|Ans(?:wer)?\.?|Q\.?)\s*(\d{1,3})\s*[:\.\)]?\s*").unwrap();
    let matches: Vec<_> = anchor_re.find_iter(text).collect();
    let mut results = Vec::new();
    if matches.is_empty() {
        return results;
    }

    for (i, m) in matches.iter().enumerate() {
        let label = anchor_re.captures(m.as_str())
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string())
            .unwrap_or_default();

        let start = m.end();
        let end = if i + 1 < matches.len() {
            matches[i + 1].start()
        } else {
            text.len()
        };

        let sol_body = text[start..end].trim().to_string();
        if !label.is_empty() && !sol_body.is_empty() {
            results.push((label, sol_body));
        }
    }
    results
}

pub struct PipelineProgress {
    pub percentage: i32,
    pub current_page: u32,
    pub total_pages: u32,
    pub stage_name: &'static str,
    pub error_message: Option<String>,
}

pub struct PipelineEngine;

impl PipelineEngine {
    pub fn run<F>(
        inputs: Vec<InputImage>,
        config: PipelineConfig,
        job_id: &str,
        db: Arc<Mutex<Database>>,
        cancellation_token: Arc<AtomicBool>,
        progress: F,
    ) -> Result<Vec<ReconstructedQuestion>>
    where
        F: Fn(PipelineProgress),
    {
        let total_pages = inputs.len() as u32;
        progress(PipelineProgress {
            percentage: 5,
            current_page: 0,
            total_pages,
            stage_name: "INITIALIZING",
            error_message: None,
        });

        let crops_dir = config.storage_dir.join("crops");
        std::fs::create_dir_all(&crops_dir)?;

        let vlm = VlmRunner::new(&config.vlm_model_path, &config.vlm_mmproj_path);
        let temp_dir = std::env::temp_dir();

        let mut all_questions: Vec<ReconstructedQuestion> = Vec::new();
        let mut pending_question: Option<RawQuestionSegment> = None;
        let mut discovered_answers: Vec<RawAnswerItem> = Vec::new();
        let mut last_seen_index: u32 = 0;

        for (page_idx, input) in inputs.iter().enumerate() {
            if cancellation_token.load(Ordering::Relaxed) {
                anyhow::bail!("Job cancelled by user");
            }

            let pct_base = 10 + (page_idx as i32 * 70) / total_pages.max(1) as i32;

            progress(PipelineProgress {
                percentage: pct_base,
                current_page: (page_idx + 1) as u32,
                total_pages,
                stage_name: "GEOMETRIC_PREFLIGHT",
                error_message: None,
            });

            // 1. Load image and determine orientation
            let (raw_img, rot) = match input {
                InputImage::Path(ref p) => {
                    let rot = OrientationDetector::detect_angle_from_file(p).unwrap_or(0);
                    let img = match ImageProcessor::load_image(p) {
                        Ok(img) => img,
                        Err(e) => {
                            eprintln!("Failed to load image {:?}: {}", p, e);
                            continue;
                        }
                    };
                    (img, rot)
                }
                InputImage::Memory { ref bytes, ref hint } => {
                    let img = match image::load_from_memory(bytes) {
                        Ok(img) => img,
                        Err(e) => {
                            eprintln!("Failed to decode image from memory (hint: {}): {}", hint, e);
                            continue;
                        }
                    };
                    // Write to temp file for OSD detection
                    let temp_input = temp_dir.join(format!("takemock_mem_input_{}.png", uuid::Uuid::new_v4()));
                    let rot = if img.save(&temp_input).is_ok() {
                        let r = OrientationDetector::detect_angle_from_file(&temp_input).unwrap_or(0);
                        let _ = std::fs::remove_file(&temp_input);
                        r
                    } else {
                        0
                    };
                    (img, rot)
                }
            };

            let oriented_img = ImageProcessor::rotate(&raw_img, rot);

            progress(PipelineProgress {
                percentage: pct_base + 5,
                current_page: (page_idx + 1) as u32,
                total_pages,
                stage_name: "LAYOUT_SEGMENTATION",
                error_message: None,
            });

            // 2. Split into columns (adaptive projection profile + margin isolation)
            let columns = ImageProcessor::split_columns(&oriented_img);

            for (c_idx, (col_img, col_rect)) in columns.iter().enumerate() {
                if cancellation_token.load(Ordering::Relaxed) {
                    anyhow::bail!("Job cancelled by user");
                }

                let enhanced = ImageProcessor::enhance_for_ocr(col_img);
                let temp_col = temp_dir.join(format!("takemock_pipe_col_{}_{}_{}.png", job_id, page_idx, c_idx));
                let _ = enhanced.save(&temp_col);

                let mut lines = TsvParser::parse_lines_psm6(&temp_col).unwrap_or_default();
                for l in &mut lines {
                    l.rect.x += col_rect.x;
                    l.rect.y += col_rect.y;
                    for w in &mut l.words {
                        w.rect.x += col_rect.x;
                        w.rect.y += col_rect.y;
                    }
                }

                let ordered_lines = ColumnProcessor::order_lines_in_reading_order(lines);

                // Check for inline answer keys in column text
                let col_full_text = ordered_lines.iter().map(|l| l.text.as_str()).collect::<Vec<_>>().join("\n");
                if col_full_text.contains("ANSWER KEY") || col_full_text.contains("ANSWERS:") || col_full_text.contains("Answer Key") {
                    let answers = AnswerKeyParser::parse_answers(&col_full_text);
                    discovered_answers.extend(answers);
                }

                let base_idx = pending_question.as_ref().map(|p| p.raw_index).unwrap_or(last_seen_index);
                let (segments, new_pending) = QuestionSegmenter::segment_lines_with_continuation(
                    &ordered_lines,
                    oriented_img.width(),
                    oriented_img.height(),
                    pending_question,
                    base_idx,
                );
                pending_question = new_pending;

                for seg in segments {
                    last_seen_index = last_seen_index.max(seg.raw_index);

                    // 3. High-resolution crop / stitch
                    let crop = if seg.fragments.len() > 1 {
                        let sub_crops: Vec<_> = seg.fragments.iter()
                            .map(|r| ImageProcessor::crop_subregion(&oriented_img, *r))
                            .collect();
                        let refs: Vec<_> = sub_crops.iter().collect();
                        ImageProcessor::stitch_vertical(&refs)
                    } else {
                        ImageProcessor::crop_subregion(&oriented_img, seg.bounding_box)
                    };

                    let crop_filename = format!("q_{}_p{}_c{}.webp", seg.label, page_idx + 1, c_idx + 1);
                    let crop_path = crops_dir.join(&crop_filename);
                    let _ = ImageProcessor::save_crop(&crop, &crop_path);

                    // 4. Semantic reasoning (VLM or Fast Rule Dissector)
                    let (clean_text, options, math_latex, qtype) = if config.use_vlm && vlm.is_available() {
                        progress(PipelineProgress {
                            percentage: pct_base + 8,
                            current_page: (page_idx + 1) as u32,
                            total_pages,
                            stage_name: "VLM_REASONING",
                            error_message: None,
                        });
                        match vlm.infer_crop(&crop_path) {
                            Ok(res) => (res.question_text, res.options, res.math_latex, res.question_type),
                            Err(_) => {
                                let (txt, opts) = VlmRunner::parse_text_options(&seg.text);
                                (txt, opts, None, seg.question_type)
                            }
                        }
                    } else {
                        let (txt, opts) = VlmRunner::parse_text_options(&seg.text);
                        (txt, opts, None, seg.question_type)
                    };

                    let norm_ymin = seg.bounding_box.y as f32 / oriented_img.height() as f32;
                    let norm_xmin = seg.bounding_box.x as f32 / oriented_img.width() as f32;
                    let norm_ymax = (seg.bounding_box.y + seg.bounding_box.height) as f32 / oriented_img.height() as f32;
                    let norm_xmax = (seg.bounding_box.x + seg.bounding_box.width) as f32 / oriented_img.width() as f32;

                    let provenance = SourceProvenance {
                        page_index: (page_idx + 1) as u32,
                        page_identifier: Some(format!("Page {}", page_idx + 1)),
                        bounding_box: [norm_ymin, norm_xmin, norm_ymax, norm_xmax],
                        source_modality: "PRINTED".to_string(),
                        extraction_method: if config.use_vlm { "VLM_SYNTHESIS" } else { "RULE_ENGINE" }.to_string(),
                        model_identifier: if config.use_vlm { Some("Qwen2-VL-2B-Q4_K_M".to_string()) } else { None },
                    };

                    // Visual Option Slicing (C-16) for diagram-only options
                    let mut final_options = options;
                    if !final_options.is_empty() && final_options.iter().all(|o| o.text.trim().is_empty()) {
                        let (crop_w, crop_h) = (crop.width(), crop.height());
                        let opt_cnt = final_options.len() as u32;

                        // Calculate stem text height offset so Option A does not capture question stem
                        let total_lines = seg.text.lines().count().max(1);
                        let stem_lines = clean_text.lines().count().max(1);
                        let stem_ratio = (stem_lines as f32 / total_lines as f32).clamp(0.20, 0.60);
                        let stem_h = ((crop_h as f32) * stem_ratio) as u32;
                        let opt_area_y = stem_h.min(crop_h.saturating_sub(40));
                        let opt_area_h = crop_h.saturating_sub(opt_area_y);

                        // Check if 2x2 grid (for 4 options on wide crops) or vertical stack
                        let is_2x2 = opt_cnt == 4 && crop_w as f32 >= crop_h as f32 * 0.75;

                        for (o_idx, opt) in final_options.iter_mut().enumerate() {
                            let (sx, sy, sw, sh) = if is_2x2 {
                                let col = (o_idx % 2) as u32;
                                let row = (o_idx / 2) as u32;
                                let half_w = crop_w / 2;
                                let half_h = (opt_area_h / 2).max(1);
                                (
                                    col * half_w,
                                    opt_area_y + row * half_h,
                                    half_w.min(crop_w.saturating_sub(col * half_w)),
                                    half_h.min(opt_area_h.saturating_sub(row * half_h)),
                                )
                            } else {
                                let strip_h = (opt_area_h / opt_cnt.max(1)).max(1);
                                (
                                    0,
                                    opt_area_y + o_idx as u32 * strip_h,
                                    crop_w,
                                    strip_h.min(opt_area_h.saturating_sub(o_idx as u32 * strip_h)),
                                )
                            };

                            let opt_crop = crop.crop_imm(sx, sy, sw.max(1), sh.max(1));
                            let opt_filename = format!("opt_{:?}_{}_{}.webp", qtype, seg.label, opt.label);
                            let opt_path = crops_dir.join(&opt_filename);
                            let _ = ImageProcessor::save_crop(&opt_crop, &opt_path);
                            opt.visual_asset_crop = Some(opt_path.to_string_lossy().to_string());
                        }
                    }

                    let mut q = ReconstructedQuestion {
                        id: format!("q-{}-{}-{}", page_idx + 1, c_idx + 1, seg.label),
                        label: seg.label.clone(),
                        raw_index: seg.raw_index,
                        exam_metadata: seg.metadata,
                        question_type: qtype,
                        question_text: clean_text,
                        math_latex,
                        options: final_options,
                        answer_key: None,
                        explanation: None,
                        diagram_crop_path: Some(crop_path.to_string_lossy().to_string()),
                        provenance: Some(provenance),
                        competing_hypotheses: Vec::new(),
                        audit_issues: Vec::new(),
                        confidence_score: 1.0,
                        source_page_numbers: vec![(page_idx + 1) as u32],
                        stimulus_id: seg.stimulus_id,
                        stimulus_text: seg.stimulus_text,
                        stimulus_crop_path: None,
                        target_unit: None,
                        resolution_status: None,
                    };

                    if norm_xmin <= 0.015 || norm_xmax >= 0.985 {
                        q.audit_issues.push("OCCLUSION_NEAR_BOUNDARY".to_string());
                    }

                    // 5. Invariant constraint validation
                    ConstraintValidator::validate_and_score(&mut q);

                    // Persist question to DB immediately
                    if let Ok(db_guard) = db.lock() {
                        let _ = db_guard.save_question(job_id, &q);
                    }

                    all_questions.push(q);
                }

                let _ = std::fs::remove_file(temp_col);
            }
        }

        // Flush final pending question if any
        if let Some(seg) = pending_question {
            let (txt, opts) = VlmRunner::parse_text_options(&seg.text);
            let trimmed = txt.trim();
            let ends_with_punct = trimmed.ends_with('.') || trimmed.ends_with('?') || trimmed.ends_with(':');
            let is_truncated = !ends_with_punct && opts.is_empty();

            let mut q = ReconstructedQuestion {
                id: format!("q-final-{}", seg.label),
                label: seg.label.clone(),
                raw_index: seg.raw_index,
                exam_metadata: seg.metadata,
                question_type: seg.question_type,
                question_text: txt,
                math_latex: None,
                options: opts,
                answer_key: None,
                explanation: None,
                diagram_crop_path: None,
                provenance: None,
                competing_hypotheses: Vec::new(),
                audit_issues: if is_truncated { vec!["TRUNCATED_CONTINUATION".to_string()] } else { Vec::new() },
                confidence_score: if is_truncated { 0.65 } else { 0.90 },
                source_page_numbers: vec![total_pages],
                stimulus_id: seg.stimulus_id,
                stimulus_text: seg.stimulus_text,
                stimulus_crop_path: None,
                target_unit: None,
                resolution_status: None,
            };
            ConstraintValidator::validate_and_score(&mut q);
            if let Ok(db_guard) = db.lock() {
                let _ = db_guard.save_question(job_id, &q);
            }
            all_questions.push(q);
        }

        progress(PipelineProgress {
            percentage: 85,
            current_page: total_pages,
            total_pages,
            stage_name: "SOLVER_ASSOCIATION",
            error_message: None,
        });

        // 6. Zero-Cascade Association Solver for Answer Keys
        let answers_to_associate = match config.mode {
            IngestionMode::Mode2Integrated => {
                // Integrated mode: answers present inline within the question pages take priority
                if !discovered_answers.is_empty() {
                    discovered_answers
                } else if let Some(ref ak_path) = config.answer_key_path {
                    if ak_path.exists() {
                        let ak_text = std::fs::read_to_string(ak_path).unwrap_or_default();
                        AnswerKeyParser::parse_answers(&ak_text)
                    } else {
                        config.external_answers
                    }
                } else {
                    config.external_answers
                }
            }
            IngestionMode::Mode1Decoupled => {
                // Decoupled mode: separate answer sheets/files take priority
                if !config.answer_inputs.is_empty() {
                    let mut decoupled_answers = Vec::new();
                    for ans_input in &config.answer_inputs {
                        if let Ok(text) = extract_text_from_input(ans_input, &temp_dir) {
                            let parsed = AnswerKeyParser::parse_answers(&text);
                            decoupled_answers.extend(parsed);
                        }
                    }
                    if !decoupled_answers.is_empty() {
                        decoupled_answers
                    } else {
                        discovered_answers
                    }
                } else if let Some(ref ak_path) = config.answer_key_path {
                    if ak_path.exists() {
                        let ak_text = std::fs::read_to_string(ak_path).unwrap_or_default();
                        AnswerKeyParser::parse_answers(&ak_text)
                    } else {
                        discovered_answers
                    }
                } else if !discovered_answers.is_empty() {
                    discovered_answers
                } else {
                    config.external_answers
                }
            }
        };

        if !answers_to_associate.is_empty() {
            let _ = AssociationSolver::associate(&mut all_questions, answers_to_associate);
        }

        // Mode 1 Decoupled Ingestion: Parse solution / explanation sheets
        if !config.solution_inputs.is_empty() {
            for sol_input in &config.solution_inputs {
                if let Ok(text) = extract_text_from_input(sol_input, &temp_dir) {
                    let sol_pairs = parse_solutions_from_text(&text);
                    for (sol_label, sol_text) in sol_pairs {
                        for q in &mut all_questions {
                            if q.label.eq_ignore_ascii_case(&sol_label) {
                                q.explanation = Some(takemock_core::ExplanationBlock {
                                    full_text: sol_text.clone(),
                                    step_by_step: sol_text.lines().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect(),
                                    math_latex_blocks: Vec::new(),
                                    visual_asset_crops: Vec::new(),
                                });                            }
                        }
                    }
                }
            }
        }

        // Re-validate and update questions in DB
        if let Ok(db_guard) = db.lock() {
            for q in &mut all_questions {
                ConstraintValidator::validate_and_score(q);
                let _ = db_guard.save_question(job_id, q);
            }
        }

        // 7. Update job status to completed in DB
        if let Ok(db_guard) = db.lock() {
            let _ = db_guard.update_job_status(job_id, "COMPLETED", None);
        }

        progress(PipelineProgress {
            percentage: 100,
            current_page: total_pages,
            total_pages,
            stage_name: "COMPLETED",
            error_message: None,
        });

        Ok(all_questions)
    }
}
