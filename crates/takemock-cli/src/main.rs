use anyhow::Result;
use clap::{Parser, Subcommand};
use colored::*;
use indicatif::{ProgressBar, ProgressStyle};
use std::path::{Path, PathBuf};
use takemock_core::{Database, ReconstructedQuestion};
use takemock_cv::{orientation::OrientationDetector, ImageProcessor};
use takemock_layout::{ColumnProcessor, QuestionSegmenter, TsvParser};
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
        Commands::Process { input, output, db } => {
            process_pages(&input, &output, &db).await?;
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

    for (c_idx, (col_img, col_rect)) in columns.iter().enumerate() {
        let temp_col = temp_dir.join(format!("takemock_col_{}.jpg", c_idx));
        col_img.save(&temp_col)?;

        let mut blocks = TsvParser::parse_image(&temp_col)?;
        for b in &mut blocks {
            b.rect.x += col_rect.x;
            b.rect.y += col_rect.y;
            for l in &mut b.lines {
                l.rect.x += col_rect.x;
                l.rect.y += col_rect.y;
            }
        }

        let ordered = ColumnProcessor::order_blocks_in_reading_order(blocks, col_img.width());
        let segs = QuestionSegmenter::segment_questions(&ordered, rotated.width(), rotated.height());
        all_segments.extend(segs);
        let _ = std::fs::remove_file(temp_col);
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

async fn process_pages(input: &Path, output: &Path, db_path: &Path) -> Result<()> {
    println!("{}", "\n🚀 Starting EvidGraph Desktop Offline Pipeline...".green().bold());

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

    let _vlm = VlmRunner::new(
        "models/Qwen2-VL-2B-Instruct-Q4_K_M.gguf",
        "models/mmproj-Qwen2-VL-2B-Instruct-f16.gguf",
    );

    let mut all_questions: Vec<ReconstructedQuestion> = Vec::new();
    let pb = ProgressBar::new(images.len() as u64);
    pb.set_style(
        ProgressStyle::default_bar()
            .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}/{len} ({eta}) {msg}")
            .unwrap(),
    );

    for (page_idx, img_path) in images.iter().enumerate() {
        pb.set_message(format!("Processing {:?}", img_path.file_name().unwrap_or_default()));

        // 1. Orientation
        let rot = OrientationDetector::detect_angle_from_file(img_path).unwrap_or(0);
        let raw_img = match ImageProcessor::load_image(img_path) {
            Ok(img) => img,
            Err(_) => continue,
        };
        let oriented_img = ImageProcessor::rotate(&raw_img, rot);

        // 2. Column Partitions
        let columns = ImageProcessor::split_columns(&oriented_img);
        let temp_dir = std::env::temp_dir();

        for (c_idx, (col_img, col_rect)) in columns.iter().enumerate() {
            let temp_col = temp_dir.join(format!("takemock_col_{}_{}.jpg", page_idx, c_idx));
            let _ = col_img.save(&temp_col);

            let mut blocks = TsvParser::parse_image(&temp_col).unwrap_or_default();
            for b in &mut blocks {
                b.rect.x += col_rect.x;
                b.rect.y += col_rect.y;
                for l in &mut b.lines {
                    l.rect.x += col_rect.x;
                    l.rect.y += col_rect.y;
                }
            }

            let ordered = ColumnProcessor::order_blocks_in_reading_order(blocks, col_img.width());
            let segments = QuestionSegmenter::segment_questions(&ordered, oriented_img.width(), oriented_img.height());

            for seg in segments {
                // 3. Crop Question Sub-region at high sensor resolution
                let crop = ImageProcessor::crop_subregion(&oriented_img, seg.bounding_box);
                let crop_filename = format!("q_{}_p{}_c{}.webp", seg.label, page_idx + 1, c_idx + 1);
                let crop_path = crops_dir.join(&crop_filename);
                let _ = ImageProcessor::save_crop(&crop, &crop_path);

                // 4. Options & Math Extraction
                let (clean_text, options) = VlmRunner::parse_text_options(&seg.text);

                let q = ReconstructedQuestion {
                    id: format!("q-{}-{}-{}", page_idx + 1, c_idx + 1, seg.label),
                    label: seg.label.clone(),
                    raw_index: seg.raw_index,
                    exam_metadata: seg.metadata,
                    question_type: seg.question_type,
                    question_text: clean_text,
                    math_latex: None,
                    options,
                    answer_key: None,
                    explanation: None,
                    diagram_crop_path: Some(crop_path.to_string_lossy().to_string()),
                    competing_hypotheses: Vec::new(),
                    confidence_score: 0.95,
                    source_page_numbers: vec![(page_idx + 1) as u32],
                };

                db.save_question(&job_id, &q)?;
                all_questions.push(q);
            }

            let _ = std::fs::remove_file(temp_col);
        }

        pb.inc(1);
    }

    pb.finish_with_message("Done processing pages!");

    // Save final output JSON
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
