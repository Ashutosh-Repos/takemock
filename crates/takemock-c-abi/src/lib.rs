pub mod pipeline;
pub use pipeline::*;

use std::collections::HashMap;
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_void};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
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
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
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

#[derive(Clone, Copy)]
struct SendCallback {
    callback: EngineProgressCallback,
    user_data: usize,
}
unsafe impl Send for SendCallback {}
unsafe impl Sync for SendCallback {}

impl SendCallback {
    fn notify(&self, p: &EngineProgress) {
        if let Some(cb) = self.callback {
            cb(p, self.user_data as *mut c_void);
        }
    }
}

pub struct EngineContext {
    pub db: Arc<Mutex<Database>>,
    pub storage_dir: PathBuf,
    pub profile: HardwareProfile,
    pub active_jobs: Arc<Mutex<HashMap<u64, Arc<AtomicBool>>>>,
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
        active_jobs: Arc::new(Mutex::new(HashMap::new())),
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

    let mut paths = Vec::new();
    for i in 0..num_questions as usize {
        let p_ptr = *question_image_paths.add(i);
        if !p_ptr.is_null() {
            if let Ok(s) = CStr::from_ptr(p_ptr).to_str() {
                paths.push(PathBuf::from(s));
            }
        }
    }

    if paths.is_empty() {
        return 0;
    }

    let job_id_num = JOB_COUNTER.fetch_add(1, Ordering::SeqCst);
    let job_id_str = format!("job-{}", job_id_num);
    let c = &*ctx;

    if let Ok(db) = c.db.lock() {
        let _ = db.insert_job(&job_id_str, paths.len() as u32);
    }

    let cancel_token = Arc::new(AtomicBool::new(false));
    if let Ok(mut map) = c.active_jobs.lock() {
        map.insert(job_id_num, Arc::clone(&cancel_token));
    }

    let inputs: Vec<InputImage> = paths.into_iter().map(InputImage::Path).collect();
    let db_clone = Arc::clone(&c.db);
    let storage_dir = c.storage_dir.clone();
    let active_jobs_clone = Arc::clone(&c.active_jobs);
    let cancel_token_clone = Arc::clone(&cancel_token);
    let profile = c.profile;
    let send_cb = SendCallback {
        callback,
        user_data: user_data as usize,
    };

    let job_id_str_clone = job_id_str.clone();

    std::thread::spawn(move || {
        let config = PipelineConfig {
            storage_dir,
            use_vlm: matches!(profile, HardwareProfile::ProfileStandard | HardwareProfile::ProfilePro),
            ..Default::default()
        };

        let res = PipelineEngine::run(
            inputs,
            config,
            &job_id_str_clone,
            db_clone.clone(),
            cancel_token_clone,
            |p| {
                let stage_c = CString::new(p.stage_name).unwrap_or_default();
                let err_c = p.error_message.as_ref().map(|s| CString::new(s.as_str()).unwrap_or_default());
                let ep = EngineProgress {
                    progress_percentage: p.percentage,
                    current_page: p.current_page,
                    total_pages: p.total_pages,
                    current_stage: stage_c.as_ptr(),
                    error_message: err_c.as_ref().map(|c| c.as_ptr()).unwrap_or(std::ptr::null()),
                };
                send_cb.notify(&ep);
            },
        );

        if let Err(e) = res {
            let err_msg = e.to_string();
            if let Ok(db_guard) = db_clone.lock() {
                let _ = db_guard.update_job_status(&job_id_str_clone, "ERROR", Some(&err_msg));
            }
            let stage_c = CString::new("ERROR").unwrap();
            let err_c = CString::new(err_msg).unwrap();
            let ep = EngineProgress {
                progress_percentage: 100,
                current_page: 0,
                total_pages: num_questions,
                current_stage: stage_c.as_ptr(),
                error_message: err_c.as_ptr(),
            };
            send_cb.notify(&ep);
        }

        if let Ok(mut map) = active_jobs_clone.lock() {
            map.remove(&job_id_num);
        }
    });

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

    let mut inputs = Vec::new();
    for i in 0..num_questions as usize {
        let buf = &*question_buffers.add(i);
        if !buf.bytes.is_null() && buf.byte_count > 0 {
            let slice = std::slice::from_raw_parts(buf.bytes, buf.byte_count);
            let hint = if !buf.filename_hint.is_null() {
                CStr::from_ptr(buf.filename_hint).to_str().unwrap_or("image.png")
            } else {
                "image.png"
            };
            inputs.push(InputImage::Memory {
                bytes: slice.to_vec(),
                hint: hint.to_string(),
            });
        }
    }

    if inputs.is_empty() {
        return 0;
    }

    let job_id_num = JOB_COUNTER.fetch_add(1, Ordering::SeqCst);
    let job_id_str = format!("mem-job-{}", job_id_num);
    let c = &*ctx;

    if let Ok(db) = c.db.lock() {
        let _ = db.insert_job(&job_id_str, inputs.len() as u32);
    }

    let cancel_token = Arc::new(AtomicBool::new(false));
    if let Ok(mut map) = c.active_jobs.lock() {
        map.insert(job_id_num, Arc::clone(&cancel_token));
    }

    let db_clone = Arc::clone(&c.db);
    let storage_dir = c.storage_dir.clone();
    let active_jobs_clone = Arc::clone(&c.active_jobs);
    let cancel_token_clone = Arc::clone(&cancel_token);
    let profile = c.profile;
    let send_cb = SendCallback {
        callback,
        user_data: user_data as usize,
    };

    let job_id_str_clone = job_id_str.clone();

    std::thread::spawn(move || {
        let config = PipelineConfig {
            storage_dir,
            use_vlm: matches!(profile, HardwareProfile::ProfileStandard | HardwareProfile::ProfilePro),
            ..Default::default()
        };

        let res = PipelineEngine::run(
            inputs,
            config,
            &job_id_str_clone,
            db_clone.clone(),
            cancel_token_clone,
            |p| {
                let stage_c = CString::new(p.stage_name).unwrap_or_default();
                let err_c = p.error_message.as_ref().map(|s| CString::new(s.as_str()).unwrap_or_default());
                let ep = EngineProgress {
                    progress_percentage: p.percentage,
                    current_page: p.current_page,
                    total_pages: p.total_pages,
                    current_stage: stage_c.as_ptr(),
                    error_message: err_c.as_ref().map(|c| c.as_ptr()).unwrap_or(std::ptr::null()),
                };
                send_cb.notify(&ep);
            },
        );

        if let Err(e) = res {
            let err_msg = e.to_string();
            if let Ok(db_guard) = db_clone.lock() {
                let _ = db_guard.update_job_status(&job_id_str_clone, "ERROR", Some(&err_msg));
            }
            let stage_c = CString::new("ERROR").unwrap();
            let err_c = CString::new(err_msg).unwrap();
            let ep = EngineProgress {
                progress_percentage: 100,
                current_page: 0,
                total_pages: num_questions,
                current_stage: stage_c.as_ptr(),
                error_message: err_c.as_ptr(),
            };
            send_cb.notify(&ep);
        }

        if let Ok(mut map) = active_jobs_clone.lock() {
            map.remove(&job_id_num);
        }
    });

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
    let c = &*ctx;
    let job_id_str = format!("job-{}", job_id);
    let mem_job_id_str = format!("mem-job-{}", job_id);

    if let Ok(map) = c.active_jobs.lock() {
        if let Some(token) = map.get(&job_id) {
            token.store(true, Ordering::SeqCst);
        }
    }
    if let Ok(db) = c.db.lock() {
        let _ = db.update_job_status(&job_id_str, "CANCELLED", Some("Cancelled by user"));
        let _ = db.update_job_status(&mem_job_id_str, "CANCELLED", Some("Cancelled by user"));
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
    let filename = if id_str.ends_with(".webp") {
        id_str.to_string()
    } else {
        format!("{}.webp", id_str)
    };
    let full_path = c.storage_dir.join("crops").join(&filename);
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

    let c = &*ctx;
    let job_id_str = format!("job-{}", job_id);
    let mem_job_id_str = format!("mem-job-{}", job_id);

    let questions = match c.db.lock() {
        Ok(db) => {
            let mut q = db.get_questions_for_job(&job_id_str).unwrap_or_default();
            if q.is_empty() {
                q = db.get_questions_for_job(&mem_job_id_str).unwrap_or_default();
            }
            q
        }
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

