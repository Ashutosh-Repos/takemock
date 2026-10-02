use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_float, c_int};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use takemock_core::Database;

pub struct EngineInstance {
    pub db: Arc<Mutex<Database>>,
    pub models_dir: PathBuf,
    pub cache_dir: PathBuf,
}

#[no_mangle]
pub unsafe extern "C" fn takemock_engine_create(
    db_path: *const c_char,
    models_dir: *const c_char,
    cache_dir: *const c_char,
) -> *mut EngineInstance {
    let db_str = if db_path.is_null() {
        "takemock.db"
    } else {
        CStr::from_ptr(db_path).to_str().unwrap_or("takemock.db")
    };

    let models_str = if models_dir.is_null() {
        "models"
    } else {
        CStr::from_ptr(models_dir).to_str().unwrap_or("models")
    };

    let cache_str = if cache_dir.is_null() {
        "scratch"
    } else {
        CStr::from_ptr(cache_dir).to_str().unwrap_or("scratch")
    };

    let db = match Database::open(db_str) {
        Ok(d) => d,
        Err(_) => return std::ptr::null_mut(),
    };

    let engine = Box::new(EngineInstance {
        db: Arc::new(Mutex::new(db)),
        models_dir: PathBuf::from(models_str),
        cache_dir: PathBuf::from(cache_str),
    });

    Box::into_raw(engine)
}

#[no_mangle]
pub unsafe extern "C" fn takemock_engine_destroy(engine: *mut EngineInstance) {
    if !engine.is_null() {
        drop(Box::from_raw(engine));
    }
}

#[no_mangle]
pub unsafe extern "C" fn takemock_engine_submit_job(
    engine: *mut EngineInstance,
    image_paths: *const *const c_char,
    count: u32,
    out_job_id: *mut c_char,
    out_len: usize,
) -> c_int {
    if engine.is_null() || image_paths.is_null() || count == 0 {
        return -1;
    }

    let job_id = uuid::Uuid::new_v4().to_string();
    let eng = &*engine;

    if let Ok(db) = eng.db.lock() {
        if db.insert_job(&job_id, count).is_err() {
            return -2;
        }
    }

    if !out_job_id.is_null() && out_len > 0 {
        let c_job_id = CString::new(job_id.clone()).unwrap_or_default();
        let bytes = c_job_id.as_bytes_with_nul();
        let copy_len = bytes.len().min(out_len);
        std::ptr::copy_nonoverlapping(bytes.as_ptr() as *const c_char, out_job_id, copy_len);
    }

    0
}

#[no_mangle]
pub unsafe extern "C" fn takemock_engine_get_progress(
    _engine: *mut EngineInstance,
    _job_id: *const c_char,
) -> c_float {
    1.0
}

#[no_mangle]
pub unsafe extern "C" fn takemock_engine_get_results_json(
    engine: *mut EngineInstance,
    job_id: *const c_char,
    out_buf: *mut c_char,
    max_len: usize,
) -> c_int {
    if engine.is_null() || job_id.is_null() || out_buf.is_null() || max_len == 0 {
        return -1;
    }

    let j_str = CStr::from_ptr(job_id).to_str().unwrap_or("");
    let eng = &*engine;

    let questions = match eng.db.lock() {
        Ok(db) => match db.get_questions_for_job(j_str) {
            Ok(q) => q,
            Err(_) => return -2,
        },
        Err(_) => return -3,
    };

    let json_bytes = match serde_json::to_vec(&questions) {
        Ok(b) => b,
        Err(_) => return -4,
    };

    if json_bytes.len() + 1 > max_len {
        return -5; // Buffer too small
    }

    std::ptr::copy_nonoverlapping(json_bytes.as_ptr() as *const c_char, out_buf, json_bytes.len());
    *out_buf.add(json_bytes.len()) = 0; // null-terminator

    0
}

#[no_mangle]
pub unsafe extern "C" fn takemock_engine_cancel_job(
    engine: *mut EngineInstance,
    job_id: *const c_char,
) -> c_int {
    if engine.is_null() || job_id.is_null() {
        return -1;
    }
    let j_str = CStr::from_ptr(job_id).to_str().unwrap_or("");
    let eng = &*engine;
    if let Ok(db) = eng.db.lock() {
        let _ = db.update_job_status(j_str, "CANCELLED", None);
    }
    0
}
