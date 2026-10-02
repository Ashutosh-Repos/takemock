use anyhow::Result;
use clap::{Parser, Subcommand};
use colored::*;
use indicatif::{ProgressBar, ProgressStyle};
use std::path::{Path, PathBuf};
use takemock_core::{ConstraintValidator, Database, ReconstructedQuestion};
use takemock_cv::{orientation::OrientationDetector, ImageProcessor};
use takemock_layout::{ColumnProcessor, QuestionSegmenter, RawQuestionSegment, TsvParser};
use takemock_solver::{AnswerKeyParser, AssociationSolver};
use takemock_vlm::VlmRunner;

#[derive(Parser)]
#[command(name = "takemock")]
#[command(about = "EvidGraph 100% Offline CBT Question Reconstruction Engine", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Process a page or directory of pages and reconstruct questions
    Process {
        /// Path to an image file or directory of pages
        #[arg(short, long)]
        input: PathBuf,

        /// Output path for structured JSON
        #[arg(short, long, default_value = "output/questions.json")]
        output: PathBuf,

        /// Path to SQLite database
        #[arg(long, default_value = "takemock.db")]
        db: PathBuf,

        /// Enable deep local VLM reasoning on question crops via llama.cpp Metal
        #[arg(long, default_value_t = false)]
        use_vlm: bool,

        /// Optional path to answer key text file
        #[arg(long)]
        answer_key: Option<PathBuf>,
    },
    /// Inspect orientation and layout of a single page
    Inspect {
        /// Path to page image
        #[arg(short, long)]
        image: PathBuf,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();
    let cli = Cli::parse();

    match cli.command {
        Commands::Inspect { image } => {
            inspect_page(&image).await?;
        }
        Commands::Process {
            input,
            output,
            db,
            use_vlm,
            answer_key,
        } => {
            process_pages(&input, &output, &db, use_vlm, answer_key.as_deref()).await?;
        }
    }

    Ok(())
}

async fn inspect_page(image_path: &Path) -> Result<()> {
    println!("{}", format!("\n=== Inspecting Page: {:?} ===", image_path).cyan().bold());

    let rot = OrientationDetector::detect_angle_from_file(image_path)?;
    println!("Detected Orientation Correction: {}°", format!("{}", rot).yellow().bold());

    let img = ImageProcessor::load_image(image_path)?;
    let (w, h) = (img.width(), img.height());
    println!("Sensor Dimensions: {}x{}", w, h);

    let rotated = ImageProcessor::rotate(&img, rot);
    let columns = ImageProcessor::split_columns(&rotated);
    println!("Detected {} column partition(s)", columns.len().to_string().cyan().bold());

    let temp_dir = std::env::temp_dir();
    let mut all_segments = Vec::new();
    let mut pending: Option<RawQuestionSegment> = None;

    for (c_idx, (col_img, col_rect)) in columns.iter().enumerate() {
        let enhanced = ImageProcessor::enhance_for_ocr(col_img);
        let temp_col = temp_dir.join(format!("takemock_inspect_col_{}.png", c_idx));
        enhanced.save(&temp_col)?;

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
        let base_idx = pending.as_ref().map(|p| p.raw_index).unwrap_or_else(|| {
            all_segments.last().map(|s: &RawQuestionSegment| s.raw_index).unwrap_or(0)
        });
        let (segs, new_pending) = QuestionSegmenter::segment_lines_with_continuation(
            &ordered_lines,
            rotated.width(),
            rotated.height(),
            pending,
            base_idx,
        );
        println!("Col {}: found {} segments, pending: {:?}", c_idx, segs.len(), new_pending.as_ref().map(|p| &p.label));
        for s in &segs {
            println!("   -> seg Q{} ({} lines, bbox: y={}..{}, fragments={})", s.label, s.text.lines().count(), s.bounding_box.y, s.bounding_box.y + s.bounding_box.height, s.fragments.len());
        }
        all_segments.extend(segs);
        pending = new_pending;
        let _ = std::fs::remove_file(temp_col);
    }

    if let Some(p) = pending {
        all_segments.push(p);
    }

    println!("\n{}", format!("=== Segmented Questions ({}) ===", all_segments.len()).green().bold());
    for s in &all_segments {
        println!(
            "-> Q{} [{:?}] at bbox ({}, {}, {}x{}):",
            s.label.cyan().bold(),
            s.question_type,
            s.bounding_box.x,
            s.bounding_box.y,
            s.bounding_box.width,
            s.bounding_box.height
        );
        let preview = s.text.lines().take(2).collect::<Vec<_>>().join(" ");
        println!("   Preview: {}\n", preview);
    }

    Ok(())
}

async fn process_pages(
    input: &Path,
    output: &Path,
    db_path: &Path,
    use_vlm: bool,
    answer_key_path: Option<&Path>,
) -> Result<()> {
    println!("{}", "\n🚀 Starting EvidGraph Desktop Offline Pipeline...".green().bold());
    if use_vlm {
        println!("{}", "⚡ Local Multimodal VLM (Qwen2-VL Metal) reasoning enabled!".yellow().bold());
    }

    let mut images = Vec::new();
    if input.is_dir() {
        for entry in std::fs::read_dir(input)? {
            let entry = entry?;
            let path = entry.path();
            if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                let ext_lower = ext.to_lowercase();
                if ["jpg", "jpeg", "png", "webp"].contains(&ext_lower.as_str()) {
                    images.push(path);
                }
            }
        }
        images.sort();
    } else {
        images.push(input.to_path_buf());
    }

    if images.is_empty() {
        eprintln!("{}", "No image files found to process.".red());
        return Ok(());
    }

    println!("Found {} page(s) to process.", images.len().to_string().cyan().bold());

    let db = Database::open(db_path)?;
    let job_id = uuid::Uuid::new_v4().to_string();
    db.insert_job(&job_id, images.len() as u32)?;

    let crops_dir = PathBuf::from("output/crops");
    std::fs::create_dir_all(&crops_dir)?;

    let vlm = VlmRunner::new(
        "models/Qwen2-VL-2B-Instruct-Q4_K_M.gguf",
        "models/mmproj-Qwen2-VL-2B-Instruct-f16.gguf",
    );

    let mut all_questions: Vec<ReconstructedQuestion> = Vec::new();
    let mut pending_question: Option<RawQuestionSegment> = None;
    let mut discovered_answers = Vec::new();
    let mut last_seen_index: u32 = 0;

    let pb = ProgressBar::new(images.len() as u64);
    pb.set_style(
        ProgressStyle::default_bar()
            .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} ({eta}) {msg}")
            .unwrap(),
    );

    for (page_idx, img_path) in images.iter().enumerate() {
        pb.set_message(format!("Processing {:?}", img_path.file_name().unwrap_or_default()));

        // 1. Orientation Detection (0, 90, 180, 270)
        let rot = OrientationDetector::detect_angle_from_file(img_path).unwrap_or(0);
        let raw_img = match ImageProcessor::load_image(img_path) {
            Ok(img) => img,
            Err(_) => continue,
        };
        let oriented_img = ImageProcessor::rotate(&raw_img, rot);

        // 2. Adaptive Column Partitions (1 or 2 columns via background-adaptive ink projection)
        let columns = ImageProcessor::split_columns(&oriented_img);
        let temp_dir = std::env::temp_dir();

        for (c_idx, (col_img, col_rect)) in columns.iter().enumerate() {
            // Enhance contrast for OCR
            let enhanced = ImageProcessor::enhance_for_ocr(col_img);
            let temp_col = temp_dir.join(format!("takemock_col_{}_{}.png", page_idx, c_idx));
            let _ = enhanced.save(&temp_col);

            // Parse lines with PSM 6 (single uniform block for column)
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

            // Check if this column is an Answer Key section
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

                // 3. Crop Question Sub-region at sensor resolution WebP
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

                // 4. Options & Semantic Extraction (Local Multimodal VLM or Fast-Pass)
                let (clean_text, options, math_latex, qtype) = if use_vlm && vlm.is_available() {
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

                let provenance = takemock_core::SourceProvenance {
                    page_index: (page_idx + 1) as u32,
                    page_identifier: Some(format!("Page {}", page_idx + 1)),
                    bounding_box: [norm_ymin, norm_xmin, norm_ymax, norm_xmax],
                    source_modality: "PRINTED".to_string(),
                    extraction_method: if use_vlm { "VLM_SYNTHESIS" } else { "RULE_ENGINE" }.to_string(),
                    model_identifier: if use_vlm { Some("Qwen2-VL-2B-Q4_K_M".to_string()) } else { None },
                };

                let mut q = ReconstructedQuestion {
                    id: format!("q-{}-{}-{}", page_idx + 1, c_idx + 1, seg.label),
                    label: seg.label.clone(),
                    raw_index: seg.raw_index,
                    exam_metadata: seg.metadata,
                    question_type: qtype,
                    question_text: clean_text,
                    math_latex,
                    options,
                    answer_key: None,
                    explanation: None,
                    diagram_crop_path: Some(crop_path.to_string_lossy().to_string()),
                    provenance: Some(provenance),
                    competing_hypotheses: Vec::new(),
                    confidence_score: 1.0,
                    source_page_numbers: vec![(page_idx + 1) as u32],
                };

                // 5. Run Invariant Constraint Validation
                ConstraintValidator::validate_and_score(&mut q);

                all_questions.push(q);
            }

            let _ = std::fs::remove_file(temp_col);
        }

        pb.inc(1);
    }

    // Flush final pending question if any
    if let Some(seg) = pending_question {
        let (txt, opts) = VlmRunner::parse_text_options(&seg.text);
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
            confidence_score: 0.90,
            source_page_numbers: vec![images.len() as u32],
        };
        ConstraintValidator::validate_and_score(&mut q);
        all_questions.push(q);
    }

    pb.finish_with_message("Done processing pages!");

    // 6. Zero-Cascade Association Solver for Answer Keys
    if let Some(ak_path) = answer_key_path {
        if ak_path.exists() {
            let ak_text = std::fs::read_to_string(ak_path)?;
            let raw_answers = AnswerKeyParser::parse_answers(&ak_text);
            println!("Loaded {} external answer key entries.", raw_answers.len().to_string().cyan());
            AssociationSolver::associate(&mut all_questions, raw_answers)?;
        }
    } else if !discovered_answers.is_empty() {
        println!("Discovered {} answer key entries in document.", discovered_answers.len().to_string().cyan());
        AssociationSolver::associate(&mut all_questions, discovered_answers)?;
    }

    // Save questions into SQLite DB and Output JSON
    for q in &all_questions {
        db.save_question(&job_id, q)?;
    }

    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json_data = serde_json::to_string_pretty(&all_questions)?;
    std::fs::write(output, json_data)?;

    println!(
        "\n{} Extracted {} structured questions into {:?} and SQLite {:?}",
        "✓ SUCCESS:".green().bold(),
        all_questions.len().to_string().cyan().bold(),
        output,
        db_path
    );

    Ok(())
}
