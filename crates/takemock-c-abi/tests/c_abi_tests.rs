use std::ffi::{CStr, CString};
use std::os::raw::c_void;
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use takemock_c_abi::*;

#[test]
fn test_c_abi_init_and_destroy() {
    let temp_dir = std::env::temp_dir().join(format!("takemock_c_abi_test_{}", uuid::Uuid::new_v4()));
    let temp_dir_c = CString::new(temp_dir.to_str().unwrap()).unwrap();

    unsafe {
        let ctx = takemock_engine_init(temp_dir_c.as_ptr(), HardwareProfile::ProfileStandard);
        assert!(!ctx.is_null());
        takemock_engine_destroy(ctx);
    }

    let _ = std::fs::remove_dir_all(temp_dir);
}

static TEST_PROGRESS_STAGE: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());
static TEST_COMPLETED: AtomicBool = AtomicBool::new(false);
static TEST_PROGRESS_PCT: AtomicI32 = AtomicI32::new(0);

extern "C" fn test_callback(progress: *const EngineProgress, _user_data: *mut c_void) {
    if !progress.is_null() {
        unsafe {
            let p = &*progress;
            TEST_PROGRESS_PCT.store(p.progress_percentage, Ordering::SeqCst);
            if !p.current_stage.is_null() {
                if let Ok(s) = CStr::from_ptr(p.current_stage).to_str() {
                    if let Ok(mut g) = TEST_PROGRESS_STAGE.lock() {
                        *g = s.to_string();
                    }
                    if s == "COMPLETED" || p.progress_percentage == 100 {
                        TEST_COMPLETED.store(true, Ordering::SeqCst);
                    }
                }
            }
        }
    }
}

#[test]
fn test_c_abi_submit_job_and_retrieve_json() {
    let temp_dir = std::env::temp_dir().join(format!("takemock_c_abi_run_{}", uuid::Uuid::new_v4()));
    let temp_dir_c = CString::new(temp_dir.to_str().unwrap()).unwrap();

    // Create a small test image
    let test_img_path = temp_dir.join("test_page.png");
    std::fs::create_dir_all(&temp_dir).unwrap();
    let img = image::RgbImage::from_pixel(800, 1000, image::Rgb([255, 255, 255]));
    img.save(&test_img_path).unwrap();

    let path_c = CString::new(test_img_path.to_str().unwrap()).unwrap();
    let paths_array = [path_c.as_ptr()];

    unsafe {
        let ctx = takemock_engine_init(temp_dir_c.as_ptr(), HardwareProfile::ProfileEco);
        assert!(!ctx.is_null());

        let job_id = takemock_engine_submit_job(
            ctx,
            IngestionMode::Mode1Decoupled,
            paths_array.as_ptr(),
            1,
            std::ptr::null(),
            0,
            std::ptr::null(),
            0,
            Some(test_callback),
            std::ptr::null_mut(),
        );

        assert!(job_id > 0);

        // Wait for pipeline execution to complete
        for _ in 0..50 {
            if TEST_COMPLETED.load(Ordering::SeqCst) {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }

        // Retrieve result JSON
        let json_ptr = takemock_engine_get_result_json(ctx, job_id);
        assert!(!json_ptr.is_null());
        let json_str = CStr::from_ptr(json_ptr).to_str().unwrap();
        // Valid JSON array
        assert!(json_str.starts_with('[') && json_str.ends_with(']'));

        takemock_engine_free_string(json_ptr);
        takemock_engine_destroy(ctx);
    }

    let _ = std::fs::remove_dir_all(temp_dir);
}

#[test]
fn test_c_abi_memory_job_and_cancellation() {
    let temp_dir = std::env::temp_dir().join(format!("takemock_mem_test_{}", uuid::Uuid::new_v4()));
    let temp_dir_c = CString::new(temp_dir.to_str().unwrap()).unwrap();

    let img = image::RgbImage::from_pixel(600, 800, image::Rgb([255, 255, 255]));
    let mut png_bytes = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut png_bytes), image::ImageFormat::Png).unwrap();

    let hint_c = CString::new("test_mem.png").unwrap();
    let mem_buf = MemoryBuffer {
        bytes: png_bytes.as_ptr(),
        byte_count: png_bytes.len(),
        filename_hint: hint_c.as_ptr(),
    };

    unsafe {
        let ctx = takemock_engine_init(temp_dir_c.as_ptr(), HardwareProfile::ProfileEco);
        assert!(!ctx.is_null());

        let job_id = takemock_engine_submit_memory_job(
            ctx,
            IngestionMode::Mode1Decoupled,
            &mem_buf as *const MemoryBuffer,
            1,
            std::ptr::null(),
            0,
            std::ptr::null(),
            0,
            None,
            std::ptr::null_mut(),
        );

        assert!(job_id > 0);

        // Cancel job
        let cancelled = takemock_engine_cancel_job(ctx, job_id);
        assert!(cancelled);

        takemock_engine_destroy(ctx);
    }

    let _ = std::fs::remove_dir_all(temp_dir);
}
