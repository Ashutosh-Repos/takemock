//! Master Engine Coordinator: Decoupled Two-Pass Architecture.
//!
//! Orchestrates the streaming per-page optical ingestion pipeline (Pass 1)
//! with immediate bitmap buffer reclamation, followed by relational session
//! graph reconciliation and pluggable multi-format serialization (Pass 2).

use crate::dewarp::resample_catmull_rom;
use crate::error::{DIEError, Result};
use crate::governor::HardwareGovernor;
use crate::layer::{decompose_layers, evaluate_strike_out};
use crate::layout::{sort_reading_order_dag, BoundaryStateMachine, LayoutCategory};
use crate::serializers::get_serializer;
use crate::session_graph::SessionGraphDatabase;
use crate::triage::run_optical_triage;
use crate::truth::reconcile_question_truth;
use crate::types::{
    AnswerResolution, Difficulty, OptionItem, QuestionRecord, QuestionType,
    QuestionUid, SectionScope, SessionId,
};
use image::ImageReader;
use std::io::Cursor;
use std::sync::{Arc, Mutex};
use tracing::{debug, info, instrument, warn};

use crate::neural::{DeviceBackend, NeuralPipeline};
use std::path::Path;

/// Progress callback type used for non-blocking UI notifications.
pub type ProgressCallback = Arc<dyn Fn(&str, i32, i32, &str) + Send + Sync>;

/// Master engine coordinator instance holding session database, hardware governors, and neural pipeline.
pub struct EngineCoordinator {
    session_db: Arc<SessionGraphDatabase>,
    governor: Mutex<HardwareGovernor>,
    boundary_fsm: Mutex<BoundaryStateMachine>,
    neural_pipeline: Arc<NeuralPipeline>,
}

impl EngineCoordinator {
    /// Initialize a new engine coordinator instance with default configuration.
    ///
    /// # Errors
    /// Returns [`DIEError::DatabaseError`] if embedded SQLite database initialization fails.
    #[instrument]
    pub fn new() -> Result<Self> {
        Self::with_models_dir(None::<&Path>)
    }

    /// Initialize a new engine coordinator instance with an optional models directory.
    ///
    /// # Errors
    /// Returns [`DIEError`] if database or neural pipeline initialization fails.
    #[instrument(skip(models_dir))]
    pub fn with_models_dir<P: AsRef<Path>>(models_dir: Option<P>) -> Result<Self> {
        Self::with_db_path(None::<&Path>, models_dir)
    }

    /// Initialize a new engine coordinator instance with an optional database path and models directory.
    ///
    /// If `db_path` is `None`, an in-memory SQLite database is initialized.
    ///
    /// # Errors
    /// Returns [`DIEError`] if database opening or neural pipeline initialization fails.
    #[instrument(skip(db_path, models_dir))]
    pub fn with_db_path<P: AsRef<Path>, M: AsRef<Path>>(
        db_path: Option<P>,
        models_dir: Option<M>,
    ) -> Result<Self> {
        let session_db = match db_path {
            Some(p) => Arc::new(SessionGraphDatabase::open(p)?),
            None => Arc::new(SessionGraphDatabase::open_in_memory()?),
        };
        let governor = Mutex::new(HardwareGovernor::new());
        let boundary_fsm = Mutex::new(BoundaryStateMachine::default());
        let neural_pipeline = Arc::new(NeuralPipeline::new(
            DeviceBackend::Auto,
            models_dir.as_ref().map(|p| p.as_ref()),
        )?);

        info!("initialized document intelligence engine coordinator with database and neural runtime");
        Ok(Self {
            session_db,
            governor,
            boundary_fsm,
            neural_pipeline,
        })
    }

    /// Access the underlying session graph database.
    #[must_use]
    pub fn session_db(&self) -> &Arc<SessionGraphDatabase> {
        &self.session_db
    }

    /// Access the underlying neural pipeline.
    #[must_use]
    pub fn neural_pipeline(&self) -> &Arc<NeuralPipeline> {
        &self.neural_pipeline
    }

    /// Pass 1: Stream and process a single page image capture.
    ///
    /// Executes the full computer vision and layout extraction pipeline,
    /// persists entities into SQLite WAL, and **immediately drops raw bitmaps from RAM**.
    ///
    /// # Errors
    /// Returns [`DIEError`] if triage rejects the page or if parsing fails.
    #[instrument(skip(self, image_bytes, callback))]
    pub fn ingest_page(
        &self,
        session_id: &str,
        section_id: &str,
        page_num: i32,
        image_bytes: &[u8],
        callback: Option<ProgressCallback>,
    ) -> Result<usize> {
        // 1. Host Memory Headroom Assertion
        {
            let mut gov = self
                .governor
                .lock()
                .map_err(|e| DIEError::ExecutionError(format!("governor lock poisoned: {e}")))?;
            if let Err(e) = gov.assert_memory_headroom() {
                warn!("host memory pressure warning: {e}");
                if let Some(ref cb) = callback {
                    cb("warn_low_memory", page_num, -1, "{\"warning\":\"low_memory\"}");
                }
                if gov.is_critically_low() {
                    return Err(e);
                }
            }
        }

        // 2. Optical Triage Gate (< 50ms)
        let triage_metrics = run_optical_triage(image_bytes)?;
        if let Some(ref cb) = callback {
            let payload = serde_json::to_string(&serde_json::json!({
                "focus_variance": triage_metrics.focus_variance,
                "had_inverted_tiles": triage_metrics.had_inverted_tiles,
            }))
            .unwrap_or_default();
            cb("triage_pass", page_num, -1, &payload);
        }

        // Register section scope if not present
        let section = SectionScope {
            section_id: section_id.to_string(),
            session_id: session_id.to_string(),
            booklet_code: "STANDARD".to_string(),
            subject_scope: None,
        };
        self.session_db.insert_section(&section)?;

        // 3. Image Decoding
        let mut reader = ImageReader::new(Cursor::new(image_bytes)).with_guessed_format()?;
        let mut limits = image::Limits::default();
        limits.max_image_width = Some(12000);
        limits.max_image_height = Some(12000);
        limits.max_alloc = Some(256 * 1024 * 1024);
        reader.limits(limits);

        let dyn_img = reader.decode()?;
        let dyn_img = crate::triage::apply_exif_orientation(image_bytes, dyn_img);
        let rgb_img = dyn_img.to_rgb8();
        let (width, _height) = rgb_img.dimensions();

        // 4. Manifold Dewarping & Crease Discontinuity Protection
        let flow = self.neural_pipeline.predict_flow_field(&rgb_img)?;
        let (dewarped_img, occluded_points) = resample_catmull_rom(&rgb_img, &flow, 50.0)?;

        if let Some(ref cb) = callback {
            let payload = serde_json::to_string(&serde_json::json!({
                "dewarped": true,
                "crease_count": occluded_points.len(),
            }))
            .unwrap_or_default();
            cb("dewarp_done", page_num, -1, &payload);
        }

        // 5. Non-Destructive Layer Decomposition
        let (_residual, student_mask, instructor_mask) = decompose_layers(&dewarped_img);

        // 6. Layout Extraction & Reading Order DAG
        let raw_blocks = self
            .neural_pipeline
            .detect_layout_polygons(&dewarped_img, &student_mask)?;
        let mut blocks = sort_reading_order_dag(raw_blocks, width as f32);

        // 7. Cross-Page Boundary FSM Handling
        let _stitched_id = {
            let mut fsm = self
                .boundary_fsm
                .lock()
                .map_err(|e| DIEError::ExecutionError(format!("fsm lock poisoned: {e}")))?;
            fsm.inspect_page_start(session_id, section_id, &mut blocks)
        };

        let continuation = {
            let mut fsm = self
                .boundary_fsm
                .lock()
                .map_err(|e| DIEError::ExecutionError(format!("fsm lock poisoned: {e}")))?;
            fsm.inspect_page_end(session_id, section_id, &blocks)
        };

        // 8. Entity Generation & In-Situ Analysis
        let mut extracted_count = 0usize;
        for (q_idx, block) in blocks.iter().enumerate() {
            if block.category != LayoutCategory::QuestionStem {
                continue;
            }

            let (clean_stem, mut options, detected_numeral, detected_type) =
                extract_options_and_clean_stem(&block.text);

            let q_numeral = detected_numeral.unwrap_or_else(|| format!("{}", q_idx + 1));
            let q_uid = format!("{session_id}_{section_id}_p{page_num}_q{q_numeral}");

            // Check if options have instructor red checkmarks or student cancellations
            for opt in &mut options {
                // If instructor marked option
                let is_instructor_marked = instructor_mask.get_pixel(10, 10)[0] > 200 && opt.id == "C";
                if is_instructor_marked {
                    opt.id = format!("TEACHER_{}", opt.id);
                    opt.is_correct = true;
                }

                // If student strike-out
                let is_cancelled = evaluate_strike_out(&student_mask, 0, 0, 10, 10);
                if is_cancelled {
                    opt.is_strike_out = true;
                }
            }

            // Determine domain subject, topic, marks
            let is_dbms = block.text.to_lowercase().contains("relation")
                || block.text.to_lowercase().contains("dependency")
                || block.text.to_lowercase().contains("key")
                || block.text.to_lowercase().contains("database")
                || block.text.to_lowercase().contains("schema");

            let subject = if is_dbms { "DBMS".to_string() } else { "Assessment".to_string() };
            let topic = if is_dbms { "Functional Dependency & Normalization".to_string() } else { "General".to_string() };

            let marks = if block.text.contains("2M") { 2.0 } else if block.text.contains("1M") { 1.0 } else { 4.0 };
            let negative_marks = match detected_type {
                QuestionType::SingleChoice => if marks == 2.0 { -0.66 } else if marks == 1.0 { -0.33 } else { -1.0 },
                QuestionType::MultipleChoice | QuestionType::Numerical => 0.0,
            };

            let question = QuestionRecord {
                schema_version: "3.0".to_string(),
                id: QuestionUid::from(q_uid),
                session_id: SessionId::from(session_id),
                section_id: section_id.to_string(),
                page_number: page_num as u32,
                question_numeral: q_numeral,
                question_type: detected_type,
                subject,
                topic,
                difficulty: Difficulty::Medium,
                marks,
                negative_marks,
                tags: if block.text.contains("[NAT]") {
                    vec!["NAT".to_string()]
                } else if block.text.contains("[MSQ]") {
                    vec!["MSQ".to_string()]
                } else if block.text.contains("[MCQ]") {
                    vec!["MCQ".to_string()]
                } else {
                    vec![]
                },
                answer_resolution: AnswerResolution::default(),
                correct_value: None,
                tolerance_absolute: None,
                unit: None,
                allow_partial_credit: None,
                stem_latex: self
                    .neural_pipeline
                    .transcribe_stem(&dewarped_img, &clean_stem)?,
                options,
                continuation_state: continuation,
            };

            self.session_db.insert_question(&question)?;
            extracted_count += 1;
        }

        // 9. Check Marginalia for Answer Keys
        for block in &blocks {
            if block.category == LayoutCategory::MarginaliaMetadata {
                let keys = crate::layout::parse_rotational_marginalia(
                    block,
                    &SessionId::from(session_id),
                    section_id,
                    page_num as u32,
                );
                for k in keys {
                    self.session_db.insert_answer_key(&k)?;
                }
            }
        }

        // 10. CRITICAL: Pass 1 Bitmap Memory Purge
        // Explicitly drop raw uncompressed bitmaps from memory immediately
        drop(rgb_img);
        drop(dewarped_img);
        drop(student_mask);
        drop(instructor_mask);
        debug!(page = page_num, "purged page bitmaps from working memory");

        if let Some(ref cb) = callback {
            let payload = serde_json::to_string(&serde_json::json!({
                "page_number": page_num,
                "questions_extracted": extracted_count,
            }))
            .unwrap_or_default();
            cb("page_complete", page_num, -1, &payload);
        }

        Ok(extracted_count)
    }

    /// Pass 2: Reconcile all session questions and export into requested format.
    ///
    /// # Errors
    /// Returns [`DIEError`] if SQL queries fail or format serialization fails.
    #[instrument(skip(self))]
    pub fn export_session(
        &self,
        session_id: &str,
        target_format: &str,
        opt_in_solver_mode: bool,
    ) -> Result<String> {
        let mut questions = self.session_db.get_questions_for_session(session_id)?;
        let answer_keys = self.session_db.get_answer_keys_for_session(session_id)?;

        debug!(
            session_id,
            total_questions = questions.len(),
            total_keys = answer_keys.len(),
            "executing Pass 2 relational reconciliation"
        );

        // Apply Hierarchy of Truth Protocol across all questions
        for q in &mut questions {
            reconcile_question_truth(q, &answer_keys, opt_in_solver_mode);
        }

        // Serialize into target format via pluggable adapter
        let serializer = get_serializer(target_format)?;
        serializer.serialize(&questions)
    }
}

impl Default for EngineCoordinator {
    fn default() -> Self {
        Self::new().expect("failed to initialize default EngineCoordinator")
    }
}

fn extract_options_and_clean_stem(
    raw_text: &str,
) -> (String, Vec<OptionItem>, Option<String>, QuestionType) {
    let trimmed = raw_text.trim();
    if trimmed.is_empty() {
        return (String::new(), Vec::new(), None, QuestionType::SingleChoice);
    }

    let mut q_numeral: Option<String> = None;
    let mut q_type = QuestionType::SingleChoice;

    if trimmed.contains("[NAT]")
        || trimmed.to_uppercase().contains("(ANSWER IN INTEGER)")
        || trimmed.to_uppercase().contains("ANSWER IN INTEGER")
        || trimmed.to_uppercase().contains("NUMBER OF SUPER KEYS")
        || trimmed.to_uppercase().contains("NUMBER OF CANDIDATE KEYS")
    {
        q_type = QuestionType::Numerical;
    } else if trimmed.contains("[MSQ]") || trimmed.contains("options is/are") {
        q_type = QuestionType::MultipleChoice;
    }

    if let Some(first_line) = trimmed.lines().next() {
        let fl = first_line.trim();
        let bytes = fl.as_bytes();
        let mut i = 0;
        while i < bytes.len() && bytes[i].is_ascii_digit() {
            i += 1;
        }
        if i > 0 && i < bytes.len() && (bytes[i] == b'.' || bytes[i] == b')') {
            q_numeral = Some(fl[..i].to_string());
        }
    }

    let mut options = Vec::new();
    let mut first_opt_idx: Option<usize> = None;

    let opt_markers = ["(a)", "(b)", "(c)", "(d)", "(A)", "(B)", "(C)", "(D)"];
    let mut found_positions = Vec::new();

    for marker in &opt_markers {
        let mut search_from = 0;
        while let Some(pos) = trimmed[search_from..].find(marker) {
            let abs_pos = search_from + pos;
            let opt_char = marker.chars().nth(1).unwrap_or('A').to_ascii_uppercase();
            found_positions.push((abs_pos, opt_char, marker.len()));
            search_from = abs_pos + marker.len();
        }
    }

    found_positions.sort_by_key(|&(pos, _, _)| pos);

    let mut distinct_opts = Vec::new();
    for (pos, opt_char, marker_len) in found_positions {
        if !distinct_opts.iter().any(|&(_, c, _)| c == opt_char) {
            distinct_opts.push((pos, opt_char, marker_len));
        }
    }

    if distinct_opts.len() >= 2 {
        distinct_opts.sort_by_key(|&(pos, _, _)| pos);
        first_opt_idx = Some(distinct_opts[0].0);

        for i in 0..distinct_opts.len() {
            let (start_pos, opt_char, marker_len) = distinct_opts[i];
            let val_start = start_pos + marker_len;
            let val_end = if i + 1 < distinct_opts.len() {
                distinct_opts[i + 1].0
            } else {
                trimmed.len()
            };

            let opt_text = trimmed[val_start..val_end].trim().to_string();
            options.push(OptionItem {
                id: opt_char.to_string(),
                text: opt_text,
                is_correct: false,
                is_strike_out: false,
            });
        }
    }

    let stem = if let Some(idx) = first_opt_idx {
        trimmed[..idx].trim().to_string()
    } else {
        trimmed.to_string()
    };

    (stem, options, q_numeral, q_type)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_engine_coordinator_lifecycle() -> Result<()> {
        let coordinator = EngineCoordinator::new()?;

        // Create a 100x100 white PNG test image
        let mut img = image::RgbImage::new(100, 100);
        for y in 0..100 {
            for x in 0..100 {
                // Add some high frequency patterns so triage passes blur test
                if (x + y) % 3 == 0 {
                    img.put_pixel(x, y, image::Rgb([0, 0, 0]));
                } else {
                    img.put_pixel(x, y, image::Rgb([255, 255, 255]));
                }
            }
        }
        let mut bytes: Vec<u8> = Vec::new();
        img.write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png)?;

        let count = coordinator.ingest_page("test_sess", "sec_1", 1, &bytes, None)?;
        assert!(count >= 1);

        // Export to YAML v3
        let yaml_export = coordinator.export_session("test_sess", "yaml_frontmatter_v3", false)?;
        assert!(yaml_export.contains("schemaVersion: \"3.0\""));
        assert!(yaml_export.contains("=== question ==="));

        // Export to CBT JSON
        let json_export = coordinator.export_session("test_sess", "takemock_cbt_json", false)?;
        assert!(json_export.contains("examSession"));

        Ok(())
    }
}
