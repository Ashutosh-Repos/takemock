use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_void};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use takemock_core::Database;

static JOB_COUNTER: AtomicU64 = AtomicU64::new(1001);

#[repr(C)]
#[derive(Debug, Copy, Clone)]
pub enum IngestionMode {
    Mode1Decoupled = 1,
    Mode2Integrated = 2,
}

#[repr(C)]
#[derive(Debug, Copy, Clone)]
pub enum HardwareProfile {
    ProfileEco = 1,
    ProfileStandard = 2,
    ProfilePro = 3,
}

#[repr(C)]
pub struct EngineProgress {
    pub progress_percentage: i32,
    pub current_page: u32,
    pub total_pages: u32,
    pub current_stage: *const c_char,
    pub error_message: *const c_char,
}

#[repr(C)]
pub struct MemoryBuffer {
    pub bytes: *const u8,
    pub byte_count: usize,
    pub filename_hint: *const c_char,
}

pub type EngineProgressCallback = Option<extern "C" fn(progress: *const EngineProgress, user_data: *mut c_void)>;

pub struct EngineContext {
    pub db: Arc<Mutex<Database>>,
    pub storage_dir: PathBuf,
    pub profile: HardwareProfile,
}

#[no_mangle]
pub unsafe extern "C" fn takemock_engine_init(
    storage_dir: *const c_char,
    profile: HardwareProfile,
) -> *mut EngineContext {
    let s_dir = if storage_dir.is_null() {
        PathBuf::from("takemock_data")
    } else {
        let str_slice = CStr::from_ptr(storage_dir).to_str().unwrap_or("takemock_data");
        PathBuf::from(str_slice)
    };

    let _ = std::fs::create_dir_all(&s_dir);
    let db_path = s_dir.join("takemock.db");

    let db = match Database::open(&db_path) {
        Ok(d) => d,
        Err(_) => return std::ptr::null_mut(),
    };

    let ctx = Box::new(EngineContext {
        db: Arc::new(Mutex::new(db)),
        storage_dir: s_dir,
        profile,
    });

    Box::into_raw(ctx)
}

#[no_mangle]
pub unsafe extern "C" fn takemock_engine_submit_job(
    ctx: *mut EngineContext,
    _mode: IngestionMode,
    question_image_paths: *const *const c_char,
    num_questions: u32,
    _answer_image_paths: *const *const c_char,
    _num_answers: u32,
    _solution_image_paths: *const *const c_char,
    _num_solutions: u32,
    callback: EngineProgressCallback,
    user_data: *mut c_void,
) -> u64 {
    if ctx.is_null() || question_image_paths.is_null() || num_questions == 0 {
        return 0;
    }

    let job_id_num = JOB_COUNTER.fetch_add(1, Ordering::SeqCst);
    let job_id_str = format!("job-{}", job_id_num);
    let c = &*ctx;

    if let Ok(db) = c.db.lock() {
        let _ = db.insert_job(&job_id_str, num_questions);
    }

    if let Some(cb) = callback {
        let stage_c = CString::new("INITIALIZED").unwrap();
        let progress = EngineProgress {
            progress_percentage: 10,
            current_page: 0,
            total_pages: num_questions,
            current_stage: stage_c.as_ptr(),
            error_message: std::ptr::null(),
        };
        cb(&progress, user_data);
    }

    job_id_num
}

#[no_mangle]
pub unsafe extern "C" fn takemock_engine_submit_memory_job(
    ctx: *mut EngineContext,
    _mode: IngestionMode,
    question_buffers: *const MemoryBuffer,
    num_questions: u32,
    _answer_buffers: *const MemoryBuffer,
    _num_answers: u32,
    _solution_buffers: *const MemoryBuffer,
    _num_solutions: u32,
    callback: EngineProgressCallback,
    user_data: *mut c_void,
) -> u64 {
    if ctx.is_null() || question_buffers.is_null() || num_questions == 0 {
        return 0;
    }

    let job_id_num = JOB_COUNTER.fetch_add(1, Ordering::SeqCst);
    let job_id_str = format!("mem-job-{}", job_id_num);
    let c = &*ctx;

    if let Ok(db) = c.db.lock() {
        let _ = db.insert_job(&job_id_str, num_questions);
    }

    if let Some(cb) = callback {
        let stage_c = CString::new("MEMORY_INGESTION").unwrap();
        let progress = EngineProgress {
            progress_percentage: 20,
            current_page: 0,
            total_pages: num_questions,
            current_stage: stage_c.as_ptr(),
            error_message: std::ptr::null(),
        };
        cb(&progress, user_data);
    }

    job_id_num
}

#[no_mangle]
pub unsafe extern "C" fn takemock_engine_cancel_job(
    ctx: *mut EngineContext,
    job_id: u64,
) -> bool {
    if ctx.is_null() {
        return false;
    }
    let job_id_str = format!("job-{}", job_id);
    let c = &*ctx;
    if let Ok(db) = c.db.lock() {
        let _ = db.update_job_status(&job_id_str, "CANCELLED", None);
    }
    true
}

#[no_mangle]
pub unsafe extern "C" fn takemock_engine_get_asset_path(
    ctx: *mut EngineContext,
    asset_id: *const c_char,
) -> *const c_char {
    if ctx.is_null() || asset_id.is_null() {
        return std::ptr::null();
    }
    let id_str = CStr::from_ptr(asset_id).to_str().unwrap_or("");
    let c = &*ctx;
    let full_path = c.storage_dir.join("crops").join(format!("{}.webp", id_str));
    let path_str = full_path.to_string_lossy().to_string();
    let c_str = CString::new(path_str).unwrap_or_default();
    c_str.into_raw()
}

#[no_mangle]
pub unsafe extern "C" fn takemock_engine_get_result_json(
    ctx: *mut EngineContext,
    job_id: u64,
) -> *mut c_char {
    if ctx.is_null() {
        return std::ptr::null_mut();
    }

    let job_id_str = format!("job-{}", job_id);
    let c = &*ctx;

    let questions = match c.db.lock() {
        Ok(db) => match db.get_questions_for_job(&job_id_str) {
            Ok(q) => q,
            Err(_) => return std::ptr::null_mut(),
        },
        Err(_) => return std::ptr::null_mut(),
    };

    let json_bytes = match serde_json::to_string_pretty(&questions) {
        Ok(s) => s,
        Err(_) => return std::ptr::null_mut(),
    };

    let c_res = CString::new(json_bytes).unwrap_or_default();
    c_res.into_raw()
}

#[no_mangle]
pub unsafe extern "C" fn takemock_engine_free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        drop(CString::from_raw(ptr));
    }
}

#[no_mangle]
pub unsafe extern "C" fn takemock_engine_destroy(ctx: *mut EngineContext) {
    if !ctx.is_null() {
        drop(Box::from_raw(ctx));
    }
}
