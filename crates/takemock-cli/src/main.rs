use anyhow::Result;
use clap::{Parser, Subcommand};
use colored::*;
use indicatif::{ProgressBar, ProgressStyle};
use std::path::{Path, PathBuf};
use takemock_c_abi::{InputImage, PipelineConfig, PipelineEngine};
use takemock_core::Database;
use takemock_cv::{orientation::OrientationDetector, ImageProcessor};
use takemock_layout::{ColumnProcessor, QuestionSegmenter, RawQuestionSegment, TsvParser};

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

        /// Optional path(s) to decoupled answer sheet images
        #[arg(long, num_args = 1..)]
        answers: Vec<PathBuf>,

        /// Optional path(s) to decoupled solution sheet images
        #[arg(long, num_args = 1..)]
        solutions: Vec<PathBuf>,
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
            answers,
            solutions,
        } => {
            process_pages(&input, &output, &db, use_vlm, answer_key.as_deref(), answers, solutions).await?;
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
    answers: Vec<PathBuf>,
    solutions: Vec<PathBuf>,
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
    if !answers.is_empty() {
        println!("Loaded {} decoupled answer sheet(s).", answers.len().to_string().cyan().bold());
    }
    if !solutions.is_empty() {
        println!("Loaded {} decoupled solution sheet(s).", solutions.len().to_string().cyan().bold());
    }

    let db = Database::open(db_path)?;
    let job_id = uuid::Uuid::new_v4().to_string();
    db.insert_job(&job_id, images.len() as u32)?;
    let db_arc = std::sync::Arc::new(std::sync::Mutex::new(db));

    let pb = ProgressBar::new(100);
    pb.set_style(
        ProgressStyle::default_bar()
            .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos}% {msg}")
            .unwrap(),
    );

    let pb_clone = pb.clone();
    let cancel_token = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));

    let inputs: Vec<InputImage> = images.into_iter().map(InputImage::Path).collect();
    let ans_inputs: Vec<InputImage> = answers.into_iter().map(InputImage::Path).collect();
    let sol_inputs: Vec<InputImage> = solutions.into_iter().map(InputImage::Path).collect();

    let config = PipelineConfig {
        storage_dir: PathBuf::from("output"),
        use_vlm,
        answer_key_path: answer_key_path.map(|p| p.to_path_buf()),
        answer_inputs: ans_inputs,
        solution_inputs: sol_inputs,
        ..Default::default()
    };

    let questions = PipelineEngine::run(
        inputs,
        config,
        &job_id,
        db_arc,
        cancel_token,
        move |p| {
            pb_clone.set_position(p.percentage as u64);
            pb_clone.set_message(format!("[{}] Page {}/{}", p.stage_name, p.current_page, p.total_pages));
        },
    )?;

    pb.finish_with_message("Done processing pages!");

    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json_data = serde_json::to_string_pretty(&questions)?;
    std::fs::write(output, json_data)?;

    println!(
        "\n{} Extracted {} structured questions into {:?} and SQLite {:?}",
        "✓ SUCCESS:".green().bold(),
        questions.len().to_string().cyan().bold(),
        output,
        db_path
    );

    Ok(())
}

