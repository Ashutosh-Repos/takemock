use anyhow::Result;
use rusqlite::{params, Connection};
use std::path::Path;

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS evid_jobs (
                job_id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                status TEXT NOT NULL,
                total_pages INTEGER NOT NULL DEFAULT 0,
                processed_pages INTEGER NOT NULL DEFAULT 0,
                error_msg TEXT
            );

            CREATE TABLE IF NOT EXISTS evid_pages (
                page_id TEXT PRIMARY KEY,
                job_id TEXT NOT NULL REFERENCES evid_jobs(job_id) ON DELETE CASCADE,
                page_index INTEGER NOT NULL,
                image_path TEXT NOT NULL,
                rotation_angle INTEGER NOT NULL DEFAULT 0,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS evid_nodes (
                node_id TEXT PRIMARY KEY,
                job_id TEXT NOT NULL REFERENCES evid_jobs(job_id) ON DELETE CASCADE,
                page_id TEXT NOT NULL REFERENCES evid_pages(page_id) ON DELETE CASCADE,
                node_type TEXT NOT NULL,
                bbox_json TEXT NOT NULL,
                crop_path TEXT,
                raw_text TEXT,
                latex_text TEXT,
                reading_order_idx INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS evid_questions (
                question_id TEXT PRIMARY KEY,
                job_id TEXT NOT NULL REFERENCES evid_jobs(job_id) ON DELETE CASCADE,
                label TEXT NOT NULL,
                raw_index INTEGER NOT NULL,
                json_data TEXT NOT NULL,
                confidence_score REAL NOT NULL
            );
            ",
        )?;
        Ok(Self { conn })
    }

    pub fn insert_job(&self, job_id: &str, total_pages: u32) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO evid_jobs (job_id, created_at, status, total_pages, processed_pages) VALUES (?1, ?2, 'PROCESSING', ?3, 0)",
            params![job_id, now, total_pages],
        )?;
        Ok(())
    }

    pub fn update_job_status(&self, job_id: &str, status: &str, error_msg: Option<&str>) -> Result<()> {
        self.conn.execute(
            "UPDATE evid_jobs SET status = ?1, error_msg = ?2 WHERE job_id = ?3",
            params![status, error_msg, job_id],
        )?;
        Ok(())
    }

    pub fn save_question(&self, job_id: &str, q: &crate::types::ReconstructedQuestion) -> Result<()> {
        let json_str = serde_json::to_string(q)?;
        self.conn.execute(
            "INSERT OR REPLACE INTO evid_questions (question_id, job_id, label, raw_index, json_data, confidence_score) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![q.id, job_id, q.label, q.raw_index, json_str, q.confidence_score],
        )?;
        Ok(())
    }

    pub fn get_questions_for_job(&self, job_id: &str) -> Result<Vec<crate::types::ReconstructedQuestion>> {
        let mut stmt = self.conn.prepare(
            "SELECT json_data FROM evid_questions WHERE job_id = ?1 ORDER BY raw_index ASC",
        )?;
        let rows = stmt.query_map(params![job_id], |row| {
            let json_str: String = row.get(0)?;
            Ok(json_str)
        })?;

        let mut out = Vec::new();
        for r in rows {
            let json_str = r?;
            let q: crate::types::ReconstructedQuestion = serde_json::from_str(&json_str)?;
            out.push(q);
        }
        Ok(out)
    }
}
