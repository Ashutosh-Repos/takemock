//! Embedded Relational Session Graph Subsystem.
//!
//! Manages in-memory and disk-backed SQLite instances in WAL mode,
//! maintaining strict section-scoped isolation for multi-section assessments
//! (e.g. Set A vs Set B, Physics vs Chemistry) to guarantee zero key collisions.

use crate::error::{DIEError, Result};
use crate::types::{
    AnswerResolution, AnswerResolutionState, ConflictAudit, ContinuationState, Difficulty,
    KeyLocality, OptionItem, QuestionRecord, QuestionType, QuestionUid, ScopedAnswerKey,
    SectionScope, SessionId,
};
use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::Mutex;
use tracing::{debug, info, instrument};

/// Thread-safe wrapper around an embedded SQLite session database.
pub struct SessionGraphDatabase {
    conn: Mutex<Connection>,
}

impl SessionGraphDatabase {
    /// Initialize an in-memory session graph database with WAL pragmas.
    ///
    /// # Errors
    /// Returns [`DIEError::DatabaseError`] if SQLite initialization fails.
    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory()?;
        Self::apply_pragmas(&conn)?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.create_tables()?;
        info!("initialized in-memory session graph database in WAL mode");
        Ok(db)
    }

    /// Open or create a file-backed session graph database.
    ///
    /// # Errors
    /// Returns [`DIEError::DatabaseError`] if file cannot be opened or migrated.
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;
        Self::apply_pragmas(&conn)?;
        let db = Self {
            conn: Mutex::new(conn),
        };
        db.create_tables()?;
        Ok(db)
    }

    fn apply_pragmas(conn: &Connection) -> Result<()> {
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA temp_store = MEMORY;
            PRAGMA foreign_keys = ON;
            PRAGMA busy_timeout = 5000;
            "#,
        )?;
        Ok(())
    }

    /// Initialize relational tables and composite indexes.
    ///
    /// # Errors
    /// Returns [`DIEError::DatabaseError`] if DDL execution fails.
    #[instrument(skip(self))]
    pub fn create_tables(&self) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| DIEError::ExecutionError(format!("mutex lock poisoned: {e}")))?;

        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS session_sections (
                section_id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                booklet_code TEXT DEFAULT 'STANDARD',
                subject_scope TEXT
            );

            CREATE TABLE IF NOT EXISTS session_questions (
                question_uid TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                section_id TEXT NOT NULL,
                page_number INTEGER NOT NULL,
                question_numeral TEXT NOT NULL,
                question_type TEXT CHECK(question_type IN ('single_choice', 'multiple_choice', 'numerical')),
                subject TEXT NOT NULL,
                topic TEXT NOT NULL,
                difficulty TEXT NOT NULL,
                marks REAL NOT NULL,
                negative_marks REAL NOT NULL,
                tags_json TEXT,
                stem_text_latex TEXT NOT NULL,
                options_json TEXT,
                resolution_state TEXT NOT NULL,
                resolution_confidence REAL NOT NULL,
                resolution_source_ref TEXT,
                conflict_audit_json TEXT,
                correct_value REAL,
                tolerance_absolute REAL,
                unit TEXT,
                allow_partial_credit INTEGER,
                continuation_state TEXT DEFAULT 'COMPLETE',
                FOREIGN KEY(section_id) REFERENCES session_sections(section_id)
            );

            CREATE TABLE IF NOT EXISTS scoped_answer_keys (
                key_uid TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                section_id TEXT NOT NULL,
                question_numeral TEXT NOT NULL,
                target_value TEXT NOT NULL,
                source_page INTEGER NOT NULL,
                key_locality TEXT CHECK(key_locality IN ('PAGE_FOOTER', 'MARGIN_CALLOUT', 'END_MATRIX')),
                confidence REAL DEFAULT 1.0
            );

            CREATE INDEX IF NOT EXISTS idx_questions_lookup 
                ON session_questions (session_id, section_id, question_numeral);

            CREATE INDEX IF NOT EXISTS idx_keys_lookup 
                ON scoped_answer_keys (session_id, section_id, question_numeral);
            "#,
        )?;

        debug!("session graph tables and indices verified");
        Ok(())
    }

    /// Insert or replace a section scope record.
    ///
    /// # Errors
    /// Returns [`DIEError::DatabaseError`] on SQL execution failure.
    pub fn insert_section(&self, section: &SectionScope) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| DIEError::ExecutionError(format!("mutex lock poisoned: {e}")))?;

        conn.execute(
            r#"
            INSERT OR REPLACE INTO session_sections 
                (section_id, session_id, booklet_code, subject_scope)
            VALUES (?1, ?2, ?3, ?4)
            "#,
            params![
                section.section_id,
                section.session_id.to_string(),
                section.booklet_code,
                section.subject_scope,
            ],
        )?;

        Ok(())
    }

    /// Insert or replace a question record harvested during Pass 1.
    ///
    /// # Errors
    /// Returns [`DIEError::DatabaseError`] on SQL execution failure.
    pub fn insert_question(&self, q: &QuestionRecord) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| DIEError::ExecutionError(format!("mutex lock poisoned: {e}")))?;

        let options_json = serde_json::to_string(&q.options)?;
        let tags_json = serde_json::to_string(&q.tags)?;
        let conflict_audit_json = q
            .answer_resolution
            .conflict_audit
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;

        conn.execute(
            r#"
            INSERT OR REPLACE INTO session_questions (
                question_uid, session_id, section_id, page_number, question_numeral,
                question_type, subject, topic, difficulty, marks, negative_marks,
                tags_json, stem_text_latex, options_json, resolution_state,
                resolution_confidence, resolution_source_ref, conflict_audit_json,
                correct_value, tolerance_absolute, unit, allow_partial_credit,
                continuation_state
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14,
                ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23
            )
            "#,
            params![
                q.id.to_string(),
                q.session_id.to_string(),
                q.section_id,
                q.page_number,
                q.question_numeral,
                q.question_type.as_str(),
                q.subject,
                q.topic,
                q.difficulty.as_str(),
                q.marks,
                q.negative_marks,
                tags_json,
                q.stem_latex,
                options_json,
                q.answer_resolution.state.as_str(),
                q.answer_resolution.confidence,
                q.answer_resolution.source_ref,
                conflict_audit_json,
                q.correct_value,
                q.tolerance_absolute,
                q.unit,
                q.allow_partial_credit.map(|b| if b { 1 } else { 0 }),
                q.continuation_state.as_str(),
            ],
        )?;

        Ok(())
    }

    /// Insert or replace an answer key harvested from footers, margins, or distant matrices.
    ///
    /// # Errors
    /// Returns [`DIEError::DatabaseError`] on SQL execution failure.
    pub fn insert_answer_key(&self, key: &ScopedAnswerKey) -> Result<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| DIEError::ExecutionError(format!("mutex lock poisoned: {e}")))?;

        conn.execute(
            r#"
            INSERT OR REPLACE INTO scoped_answer_keys (
                key_uid, session_id, section_id, question_numeral,
                target_value, source_page, key_locality, confidence
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            "#,
            params![
                key.key_uid,
                key.session_id.to_string(),
                key.section_id,
                key.question_numeral,
                key.target_value,
                key.source_page,
                key.key_locality.as_str(),
                key.confidence,
            ],
        )?;

        Ok(())
    }

    /// Retrieve all question entities for an active session, ordered by section and page.
    ///
    /// Following `rust-backend` best practices, columns are explicitly enumerated rather than `SELECT *`.
    ///
    /// # Errors
    /// Returns [`DIEError::DatabaseError`] or [`DIEError::JsonError`] if mapping fails.
    pub fn get_questions_for_session(&self, session_id: &str) -> Result<Vec<QuestionRecord>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| DIEError::ExecutionError(format!("mutex lock poisoned: {e}")))?;

        let mut stmt = conn.prepare(
            r#"
            SELECT 
                question_uid, session_id, section_id, page_number, question_numeral,
                question_type, subject, topic, difficulty, marks, negative_marks,
                tags_json, stem_text_latex, options_json, resolution_state,
                resolution_confidence, resolution_source_ref, conflict_audit_json,
                correct_value, tolerance_absolute, unit, allow_partial_credit,
                continuation_state
            FROM session_questions
            WHERE session_id = ?1
            ORDER BY section_id ASC, page_number ASC, question_uid ASC
            "#,
        )?;

        let rows = stmt.query_map(params![session_id], |row| {
            let question_uid: String = row.get(0)?;
            let session_id_str: String = row.get(1)?;
            let section_id: String = row.get(2)?;
            let page_number: u32 = row.get(3)?;
            let question_numeral: String = row.get(4)?;
            let question_type_str: String = row.get(5)?;
            let subject: String = row.get(6)?;
            let topic: String = row.get(7)?;
            let difficulty_str: String = row.get(8)?;
            let marks: f64 = row.get(9)?;
            let negative_marks: f64 = row.get(10)?;
            let tags_json: String = row.get(11)?;
            let stem_text_latex: String = row.get(12)?;
            let options_json: String = row.get(13)?;
            let resolution_state_str: String = row.get(14)?;
            let resolution_confidence: f64 = row.get(15)?;
            let resolution_source_ref: Option<String> = row.get(16)?;
            let conflict_audit_json: Option<String> = row.get(17)?;
            let correct_value: Option<f64> = row.get(18)?;
            let tolerance_absolute: Option<f64> = row.get(19)?;
            let unit: Option<String> = row.get(20)?;
            let allow_partial_credit_int: Option<i32> = row.get(21)?;
            let continuation_state_str: String = row.get(22)?;

            Ok((
                question_uid,
                session_id_str,
                section_id,
                page_number,
                question_numeral,
                question_type_str,
                subject,
                topic,
                difficulty_str,
                marks,
                negative_marks,
                tags_json,
                stem_text_latex,
                options_json,
                resolution_state_str,
                resolution_confidence,
                resolution_source_ref,
                conflict_audit_json,
                correct_value,
                tolerance_absolute,
                unit,
                allow_partial_credit_int,
                continuation_state_str,
            ))
        })?;

        let mut records = Vec::new();
        for row in rows {
            let (
                question_uid,
                session_id_str,
                section_id,
                page_number,
                question_numeral,
                question_type_str,
                subject,
                topic,
                difficulty_str,
                marks,
                negative_marks,
                tags_json,
                stem_text_latex,
                options_json,
                resolution_state_str,
                resolution_confidence,
                resolution_source_ref,
                conflict_audit_json,
                correct_value,
                tolerance_absolute,
                unit,
                allow_partial_credit_int,
                continuation_state_str,
            ) = row?;

            let question_type = match question_type_str.as_str() {
                "multiple_choice" => QuestionType::MultipleChoice,
                "numerical" => QuestionType::Numerical,
                _ => QuestionType::SingleChoice,
            };

            let difficulty = match difficulty_str.as_str() {
                "easy" => Difficulty::Easy,
                "hard" => Difficulty::Hard,
                _ => Difficulty::Medium,
            };

            let resolution_state = match resolution_state_str.as_str() {
                "explicit_key" => AnswerResolutionState::ExplicitKey,
                "human_selection" => AnswerResolutionState::HumanSelection,
                "teacher_graded" => AnswerResolutionState::TeacherGraded,
                "model_inferred" => AnswerResolutionState::ModelInferred,
                _ => AnswerResolutionState::Unresolved,
            };

            let continuation_state = match continuation_state_str.as_str() {
                "PENDING_NEXT_PAGE" => ContinuationState::PendingNextPage,
                "STITCHED_FROM_PREVIOUS" => ContinuationState::StitchedFromPrevious,
                _ => ContinuationState::Complete,
            };

            let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
            let options: Vec<OptionItem> = serde_json::from_str(&options_json).unwrap_or_default();
            let conflict_audit: Option<ConflictAudit> = conflict_audit_json
                .as_deref()
                .and_then(|s| serde_json::from_str(s).ok());

            records.push(QuestionRecord {
                schema_version: "3.0".to_string(),
                id: QuestionUid::from(question_uid),
                session_id: SessionId::from(session_id_str),
                section_id,
                page_number,
                question_numeral,
                question_type,
                subject,
                topic,
                difficulty,
                marks,
                negative_marks,
                tags,
                answer_resolution: AnswerResolution {
                    state: resolution_state,
                    confidence: resolution_confidence,
                    source_ref: resolution_source_ref,
                    conflict_audit,
                },
                correct_value,
                tolerance_absolute,
                unit,
                allow_partial_credit: allow_partial_credit_int.map(|i| i == 1),
                stem_latex: stem_text_latex,
                options,
                continuation_state,
            });
        }

        Ok(records)
    }

    /// Retrieve all harvested scoped answer keys for an active session.
    ///
    /// # Errors
    /// Returns [`DIEError::DatabaseError`] on SQL execution failure.
    pub fn get_answer_keys_for_session(&self, session_id: &str) -> Result<Vec<ScopedAnswerKey>> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| DIEError::ExecutionError(format!("mutex lock poisoned: {e}")))?;

        let mut stmt = conn.prepare(
            r#"
            SELECT 
                key_uid, session_id, section_id, question_numeral,
                target_value, source_page, key_locality, confidence
            FROM scoped_answer_keys
            WHERE session_id = ?1
            ORDER BY section_id ASC, question_numeral ASC
            "#,
        )?;

        let rows = stmt.query_map(params![session_id], |row| {
            let key_uid: String = row.get(0)?;
            let session_id_str: String = row.get(1)?;
            let section_id: String = row.get(2)?;
            let question_numeral: String = row.get(3)?;
            let target_value: String = row.get(4)?;
            let source_page: u32 = row.get(5)?;
            let key_locality_str: String = row.get(6)?;
            let confidence: f64 = row.get(7)?;

            let key_locality = match key_locality_str.as_str() {
                "PAGE_FOOTER" => KeyLocality::PageFooter,
                "MARGIN_CALLOUT" => KeyLocality::MarginCallout,
                _ => KeyLocality::EndMatrix,
            };

            Ok(ScopedAnswerKey {
                key_uid,
                session_id: SessionId::from(session_id_str),
                section_id,
                question_numeral,
                target_value,
                source_page,
                key_locality,
                confidence,
            })
        })?;

        let mut keys = Vec::new();
        for r in rows {
            keys.push(r?);
        }
        Ok(keys)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_graph_isolation_across_sections() -> Result<()> {
        let db = SessionGraphDatabase::open_in_memory()?;

        let section_a = SectionScope {
            section_id: "SEC_A".to_string(),
            session_id: "SESSION_101".to_string(),
            booklet_code: "SET_A".to_string(),
            subject_scope: Some("Physics".to_string()),
        };
        let section_b = SectionScope {
            section_id: "SEC_B".to_string(),
            session_id: "SESSION_101".to_string(),
            booklet_code: "SET_B".to_string(),
            subject_scope: Some("Chemistry".to_string()),
        };

        db.insert_section(&section_a)?;
        db.insert_section(&section_b)?;

        // Insert Q1 in Section A
        let q1_a = QuestionRecord {
            schema_version: "3.0".to_string(),
            id: QuestionUid::from("q_a_1"),
            session_id: SessionId::from("SESSION_101"),
            section_id: "SEC_A".to_string(),
            page_number: 1,
            question_numeral: "1".to_string(),
            question_type: QuestionType::SingleChoice,
            subject: "Physics".to_string(),
            topic: "Mechanics".to_string(),
            difficulty: Difficulty::Medium,
            marks: 4.0,
            negative_marks: -1.0,
            tags: vec!["kinematics".to_string()],
            answer_resolution: AnswerResolution::default(),
            correct_value: None,
            tolerance_absolute: None,
            unit: None,
            allow_partial_credit: None,
            stem_latex: "A projectile is fired at angle $\\theta$.".to_string(),
            options: vec![
                OptionItem {
                    id: "A".to_string(),
                    text: "$v_0 \\cos\\theta$".to_string(),
                    is_correct: false,
                    is_strike_out: false,
                },
                OptionItem {
                    id: "B".to_string(),
                    text: "$v_0 \\sin\\theta$".to_string(),
                    is_correct: true,
                    is_strike_out: false,
                },
            ],
            continuation_state: ContinuationState::Complete,
        };

        // Insert Q1 in Section B with the same numeral "1"
        let q1_b = QuestionRecord {
            schema_version: "3.0".to_string(),
            id: QuestionUid::from("q_b_1"),
            session_id: SessionId::from("SESSION_101"),
            section_id: "SEC_B".to_string(),
            page_number: 1,
            question_numeral: "1".to_string(),
            question_type: QuestionType::SingleChoice,
            subject: "Chemistry".to_string(),
            topic: "Thermodynamics".to_string(),
            difficulty: Difficulty::Hard,
            marks: 4.0,
            negative_marks: -1.0,
            tags: vec!["entropy".to_string()],
            answer_resolution: AnswerResolution::default(),
            correct_value: None,
            tolerance_absolute: None,
            unit: None,
            allow_partial_credit: None,
            stem_latex: "Calculate the change in entropy $\\Delta S$.".to_string(),
            options: vec![
                OptionItem {
                    id: "A".to_string(),
                    text: "Zero".to_string(),
                    is_correct: true,
                    is_strike_out: false,
                },
                OptionItem {
                    id: "B".to_string(),
                    text: "Positive".to_string(),
                    is_correct: false,
                    is_strike_out: false,
                },
            ],
            continuation_state: ContinuationState::Complete,
        };

        db.insert_question(&q1_a)?;
        db.insert_question(&q1_b)?;

        let questions = db.get_questions_for_session("SESSION_101")?;
        assert_eq!(questions.len(), 2);
        assert_eq!(questions[0].id.0, "q_a_1");
        assert_eq!(questions[1].id.0, "q_b_1");

        // Insert answer key for Q1 in Section A (Ans: B) and Section B (Ans: A)
        let key_a = ScopedAnswerKey {
            key_uid: "key_a_1".to_string(),
            session_id: SessionId::from("SESSION_101"),
            section_id: "SEC_A".to_string(),
            question_numeral: "1".to_string(),
            target_value: "B".to_string(),
            source_page: 1,
            key_locality: KeyLocality::PageFooter,
            confidence: 1.0,
        };
        let key_b = ScopedAnswerKey {
            key_uid: "key_b_1".to_string(),
            session_id: SessionId::from("SESSION_101"),
            section_id: "SEC_B".to_string(),
            question_numeral: "1".to_string(),
            target_value: "A".to_string(),
            source_page: 8,
            key_locality: KeyLocality::EndMatrix,
            confidence: 1.0,
        };

        db.insert_answer_key(&key_a)?;
        db.insert_answer_key(&key_b)?;

        let keys = db.get_answer_keys_for_session("SESSION_101")?;
        assert_eq!(keys.len(), 2);
        assert_eq!(keys[0].target_value, "B");
        assert_eq!(keys[1].target_value, "A");

        Ok(())
    }
}
