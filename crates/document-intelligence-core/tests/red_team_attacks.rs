//! Red Team Adversarial Attack Suite for Document Intelligence Engine.
//!
//! Evaluates security, memory safety, numeric limits, concurrent state isolation,
//! and graceful degradation against adverse and malicious inputs.

use document_intelligence_core::coordinator::EngineCoordinator;
use document_intelligence_core::error::DIEError;
use document_intelligence_core::serializers::get_serializer;
use document_intelligence_core::types::*;
use std::io::Cursor;

fn create_valid_test_png(w: u32, h: u32) -> Vec<u8> {
    let mut img = image::RgbImage::new(w, h);
    for y in 0..h {
        for x in 0..w {
            if (x + y) % 3 == 0 {
                img.put_pixel(x, y, image::Rgb([0, 0, 0]));
            } else {
                img.put_pixel(x, y, image::Rgb([255, 255, 255]));
            }
        }
    }
    let mut bytes = Vec::new();
    img.write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png).unwrap();
    bytes
}

#[test]
fn test_red_team_sql_injection_defense() {
    let coordinator = EngineCoordinator::new().unwrap();

    let malicious_session_id = "sess'; DROP TABLE session_questions; --";
    let malicious_section_id = "sec' OR '1'='1";
    let img_bytes = create_valid_test_png(120, 120);

    // Ingest with injection payloads
    let res = coordinator.ingest_page(malicious_session_id, malicious_section_id, 1, &img_bytes, None);
    assert!(res.is_ok(), "SQL injection payload should be sanitized by parameterized queries");

    // Verify session_questions table still exists and was not dropped
    let questions = coordinator
        .session_db()
        .get_questions_for_session(malicious_session_id)
        .expect("table must remain intact after injection attempt");

    assert!(!questions.is_empty(), "questions should be isolated under the exact string key");
    assert_eq!(questions[0].session_id.0, malicious_session_id);
}

#[test]
fn test_red_team_corrupted_and_zero_byte_images() {
    let coordinator = EngineCoordinator::new().unwrap();

    // Attack 1: Zero-byte buffer
    let zero_bytes: [u8; 0] = [];
    let res_zero = coordinator.ingest_page("sess_corrupt", "sec", 1, &zero_bytes, None);
    assert!(matches!(res_zero, Err(DIEError::ImageError(_))));

    // Attack 2: Random garbage bytes
    let garbage_bytes = [0xDE, 0xAD, 0xBE, 0xEF, 0x00, 0xFF, 0x42, 0x99];
    let res_garbage = coordinator.ingest_page("sess_corrupt", "sec", 1, &garbage_bytes, None);
    assert!(matches!(res_garbage, Err(DIEError::ImageError(_))));

    // Attack 3: Fake PNG magic header but truncated
    let fake_png_header = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00];
    let res_fake = coordinator.ingest_page("sess_corrupt", "sec", 1, &fake_png_header, None);
    assert!(matches!(res_fake, Err(DIEError::ImageError(_))));
}

#[test]
fn test_red_team_extreme_1x1_and_flat_images() {
    let coordinator = EngineCoordinator::new().unwrap();

    // Attack: 1x1 image - must be rejected by triage without panicking on convolution borders
    let mut img = image::RgbImage::new(1, 1);
    img.put_pixel(0, 0, image::Rgb([128, 128, 128]));
    let mut bytes = Vec::new();
    img.write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png).unwrap();

    let res = coordinator.ingest_page("sess_tiny", "sec", 1, &bytes, None);
    assert!(
        matches!(res, Err(DIEError::UnrecoverableBlur { .. })),
        "1x1 flat image must be rejected by blur gate"
    );
}

#[test]
fn test_red_team_unicode_and_adversarial_latex_serialization() {
    let q = QuestionRecord {
        schema_version: "3.0".to_string(),
        id: QuestionUid::from("q_malicious_math"),
        session_id: SessionId::from("sess_math"),
        section_id: "sec_math".to_string(),
        page_number: 1,
        question_numeral: "42".to_string(),
        question_type: QuestionType::SingleChoice,
        subject: "Physics \u{1F525} \u{0000} & Math".to_string(),
        topic: "Quantum \n---\nschemaVersion: \"FAKE\"\n---".to_string(),
        difficulty: Difficulty::Hard,
        marks: 4.0,
        negative_marks: -1.0,
        tags: vec!["<script>alert('xss')</script>".to_string()],
        answer_resolution: AnswerResolution::default(),
        correct_value: None,
        tolerance_absolute: None,
        unit: None,
        allow_partial_credit: None,
        stem_latex: "Evaluate $\\frac{\\sqrt{-1}}{0}$ and \\right] \\right] \\right]".to_string(),
        options: vec![
            OptionItem {
                id: "A".to_string(),
                text: "Undefined".to_string(),
                is_correct: true,
                is_strike_out: false,
            },
        ],
        continuation_state: ContinuationState::Complete,
    };

    let serializer = get_serializer("yaml_frontmatter_v3").unwrap();
    let serialized = serializer.serialize(&[q]).unwrap();

    // Assert that the injected frontmatter did not break the immutable delimiter structure
    assert!(serialized.starts_with("---\n"));
    assert!(serialized.contains("=== question ==="));

    let cbt_serializer = get_serializer("takemock_cbt_json").unwrap();
    let json_serialized = cbt_serializer.serialize(&[]).unwrap();
    assert!(json_serialized.contains("\"totalQuestions\": 0"));
}

#[test]
fn test_red_team_concurrent_session_isolation() {
    use std::sync::Arc;
    use std::thread;

    let coordinator = Arc::new(EngineCoordinator::new().unwrap());
    let img_bytes = Arc::new(create_valid_test_png(100, 100));

    let mut handles = Vec::new();

    // Spawn 8 concurrent threads hammering separate sessions
    for session_idx in 0..8 {
        let coord = Arc::clone(&coordinator);
        let bytes = Arc::clone(&img_bytes);
        let handle = thread::spawn(move || {
            let session_id = format!("concurrent_sess_{session_idx}");
            for page in 1..=5 {
                let count = coord.ingest_page(&session_id, "sec_1", page, &bytes, None).unwrap();
                assert!(count >= 1);
            }
            let yaml = coord.export_session(&session_id, "yaml_frontmatter_v3", false).unwrap();
            assert!(yaml.contains("schemaVersion: \"3.0\""));
        });
        handles.push(handle);
    }

    for h in handles {
        h.join().expect("thread execution should not panic under high concurrency");
    }
}

#[test]
fn test_red_team_cross_session_fsm_boundary_isolation() {
    let mut fsm = document_intelligence_core::layout::BoundaryStateMachine::default();

    let sess_a = "session_alpha";
    let sess_b = "session_bravo";
    let sec = "sec_main";

    // Session A Page 1 ends with an incomplete stem
    let stem_a = document_intelligence_core::layout::LayoutBlock {
        id: "q_alpha_1".to_string(),
        category: document_intelligence_core::layout::LayoutCategory::QuestionStem,
        bbox: document_intelligence_core::layout::BoundingBox { x: 50.0, y: 800.0, width: 400.0, height: 40.0 },
        text: "The acceleration of particle A in vector form is:".to_string(),
        rotation_degrees: 0,
    };
    let state_a = fsm.inspect_page_end(sess_a, sec, &[stem_a]);
    assert_eq!(state_a, ContinuationState::PendingNextPage);
    assert_eq!(fsm.get_pending_id(sess_a, sec), Some("q_alpha_1"));

    // Red Team Attack: Session B Page 1 arrives with headless options
    // It must NOT stitch Session A's pending question!
    let mut b_blocks = vec![document_intelligence_core::layout::LayoutBlock {
        id: "opt_b_1".to_string(),
        category: document_intelligence_core::layout::LayoutCategory::OptionBlock,
        bbox: document_intelligence_core::layout::BoundingBox { x: 50.0, y: 100.0, width: 300.0, height: 30.0 },
        text: "- [ ] 5 m/s^2".to_string(),
        rotation_degrees: 0,
    }];
    let stitched_b = fsm.inspect_page_start(sess_b, sec, &mut b_blocks);
    assert_eq!(stitched_b, None, "Session B must not steal Session A's continuation state");
    assert_eq!(fsm.get_pending_id(sess_a, sec), Some("q_alpha_1"), "Session A continuation must remain intact");

    // Session A Page 2 arrives with options
    let mut a_blocks = vec![document_intelligence_core::layout::LayoutBlock {
        id: "opt_a_1".to_string(),
        category: document_intelligence_core::layout::LayoutCategory::OptionBlock,
        bbox: document_intelligence_core::layout::BoundingBox { x: 50.0, y: 100.0, width: 300.0, height: 30.0 },
        text: "- [ ] 9.8 m/s^2".to_string(),
        rotation_degrees: 0,
    }];
    let stitched_a = fsm.inspect_page_start(sess_a, sec, &mut a_blocks);
    assert_eq!(stitched_a, Some("q_alpha_1".to_string()), "Session A must successfully stitch its own continuation");
    assert!(!fsm.has_pending(sess_a, sec));
}

#[test]
fn test_red_team_nan_inf_displacement_dewarp_resilience() {
    let mut img = image::RgbImage::new(40, 40);
    for y in 0..40 {
        for x in 0..40 {
            img.put_pixel(x, y, image::Rgb([x as u8 * 5, y as u8 * 5, 128]));
        }
    }

    let mut flow = document_intelligence_core::dewarp::FlowField::identity(40, 40);
    // Malicious adversarial displacement: NaNs, Infinities, extreme magnitudes
    flow.offsets[0] = (f32::NAN, f32::NAN);
    flow.offsets[1] = (f32::INFINITY, 0.0);
    flow.offsets[2] = (0.0, f32::NEG_INFINITY);
    flow.offsets[3] = (1e12, -1e12);

    let res = document_intelligence_core::dewarp::resample_catmull_rom(&img, &flow, 50.0);
    assert!(res.is_ok(), "Catmull-Rom resampler must not panic or propagate NaNs on corrupted flow field");
    let (dewarped, _) = res.unwrap();
    assert_eq!(dewarped.dimensions(), (40, 40));

    // Verify image was produced with correct dimensions and valid non-empty buffer
    assert_eq!(dewarped.as_raw().len(), 40 * 40 * 3);
}

#[test]
fn test_red_team_pure_flat_color_and_extreme_aspect_ratios() {
    // Attack 1: Pure black 200x200
    let black_img = image::GrayImage::from_pixel(200, 200, image::Luma([0]));
    let var_black = document_intelligence_core::triage::compute_laplacian_variance(&black_img);
    assert!((0.0..1.0).contains(&var_black), "pure black must yield zero or near-zero variance");

    let (gabor, density) = document_intelligence_core::triage::compute_text_periodicity_and_edge_density(&black_img);
    assert_eq!(density, 0.0);
    assert_eq!(gabor, 0.0);

    // Attack 2: Pure white 200x200
    let white_img = image::GrayImage::from_pixel(200, 200, image::Luma([255]));
    let var_white = document_intelligence_core::triage::compute_laplacian_variance(&white_img);
    assert!((0.0..1.0).contains(&var_white), "pure white must yield zero or near-zero variance");

    // Attack 3: Receipt extreme aspect ratio 100x1200
    let receipt_img = image::GrayImage::from_pixel(100, 1200, image::Luma([128]));
    let spacing_var = document_intelligence_core::triage::compute_line_spacing_variance(&receipt_img);
    assert!(spacing_var >= 0.0);
}

#[test]
fn test_red_team_sliding_repetition_breaker_on_adversarial_stream() {
    let mut breaker = document_intelligence_core::decoder::BracketRepetitionBreaker::new(16);

    // Feed normal tokens
    assert!(!breaker.push_and_check_suppression("f(x)"));
    assert!(!breaker.push_and_check_suppression("="));
    assert!(!breaker.push_and_check_suppression("\\left["));
    assert!(!breaker.push_and_check_suppression("x"));
    assert!(!breaker.push_and_check_suppression("\\right]"));

    // Feed repetitive malicious closing brackets
    assert!(!breaker.push_and_check_suppression("\\right]")); // 2nd
    let triggered = breaker.push_and_check_suppression("\\right]"); // 3rd consecutive
    assert!(triggered, "3rd consecutive \\right] must trigger active repetition suppression");

    // Continues suppressing subsequent closing brackets
    assert!(breaker.push_and_check_suppression("\\right]"));
}

#[test]
fn test_red_team_sqlite_wal_concurrent_hammering() {
    use document_intelligence_core::session_graph::SessionGraphDatabase;
    use std::sync::Arc;
    use std::thread;

    let db = Arc::new(SessionGraphDatabase::open_in_memory().expect("in-memory sqlite should init"));
    let mut handles = Vec::new();

    // 10 concurrent threads inserting sections and questions simultaneously
    for thread_id in 0..10 {
        let db_clone = Arc::clone(&db);
        let handle = thread::spawn(move || {
            let session_id = format!("ham_sess_{thread_id}");
            let section_id = format!("sec_{thread_id}");

            let section = document_intelligence_core::types::SectionScope {
                section_id: section_id.clone(),
                session_id: session_id.clone(),
                booklet_code: "HAMMER".to_string(),
                subject_scope: None,
            };
            db_clone.insert_section(&section).expect("concurrent section insert");

            for q_idx in 1..=20 {
                let q = QuestionRecord {
                    schema_version: "3.0".to_string(),
                    id: QuestionUid::from(format!("{session_id}_{section_id}_q{q_idx}")),
                    session_id: SessionId::from(session_id.clone()),
                    section_id: section_id.clone(),
                    page_number: 1,
                    question_numeral: q_idx.to_string(),
                    question_type: QuestionType::SingleChoice,
                    subject: "Concurrency".to_string(),
                    topic: "WAL Test".to_string(),
                    difficulty: Difficulty::Easy,
                    marks: 1.0,
                    negative_marks: 0.0,
                    tags: vec![],
                    answer_resolution: AnswerResolution::default(),
                    correct_value: None,
                    tolerance_absolute: None,
                    unit: None,
                    allow_partial_credit: None,
                    stem_latex: format!("Question {q_idx}"),
                    options: vec![],
                    continuation_state: ContinuationState::Complete,
                };
                db_clone.insert_question(&q).expect("concurrent question insert");
            }

            let fetched = db_clone.get_questions_for_session(&session_id).expect("fetch session questions");
            assert_eq!(fetched.len(), 20, "each session must have exactly 20 questions without contamination");
        });
        handles.push(handle);
    }

    for h in handles {
        h.join().expect("SQLite WAL concurrent hammering thread must not panic or corrupt");
    }
}

