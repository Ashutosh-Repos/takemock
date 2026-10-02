//! Universal C-ABI interface for the Document Intelligence Engine (`document_intelligence_engine`).
//!
//! Provides a standardized, thread-safe C99 API enabling seamless integration
//! into native desktop GUI frontends (Swift/SwiftUI on macOS, C#/WinUI 3 on Windows,
//! and C++/Qt6 on Linux).

use document_intelligence_core::coordinator::EngineCoordinator;
use std::ffi::{c_char, c_void, CStr, CString};
use std::panic::catch_unwind;
use std::sync::Arc;
use tracing::{error, info};

/// Opaque engine instance handle.
pub struct DIEEngineHandle {
    coordinator: EngineCoordinator,
}

/// Asynchronous progress callback invoked during optical and neural stages.
pub type DIEProgressCallback = Option<
    unsafe extern "C" fn(
        event_type: *const c_char,
        current_page: i32,
        total_pages: i32,
        payload_json: *const c_char,
        user_data: *mut c_void,
    ),
>;

/// Initialize a new Document Intelligence Engine instance.
///
/// # Safety
/// If `models_dir` or `config_json` are non-null, they must point to valid,
/// null-terminated C strings.
#[no_mangle]
pub unsafe extern "C" fn die_engine_init(
    _models_dir: *const c_char,
    _config_json: *const c_char,
) -> *mut DIEEngineHandle {
    let result = catch_unwind(|| {
        let models_path = if !_models_dir.is_null() {
            let path_str = unsafe { CStr::from_ptr(_models_dir).to_string_lossy() };
            if path_str.trim().is_empty() {
                None
            } else {
                Some(std::path::PathBuf::from(path_str.as_ref()))
            }
        } else {
            None
        };

        match EngineCoordinator::with_models_dir(models_path) {
            Ok(coordinator) => {
                info!("successfully initialized DIE engine instance with neural runtime via C-ABI");
                let handle = Box::new(DIEEngineHandle { coordinator });
                Box::into_raw(handle)
            }
            Err(e) => {
                error!("failed to initialize engine coordinator: {e}");
                std::ptr::null_mut()
            }
        }
    });

    result.unwrap_or(std::ptr::null_mut())
}

/// Destroy an engine instance and reclaim allocated resources.
///
/// # Safety
/// `handle` must be a valid pointer returned by [`die_engine_init`], or null.
#[no_mangle]
pub unsafe extern "C" fn die_engine_destroy(handle: *mut DIEEngineHandle) {
    if handle.is_null() {
        return;
    }

    let _ = catch_unwind(|| {
        // SAFETY: The handle is checked for non-null and was allocated via Box::into_raw in die_engine_init.
        let _boxed = unsafe { Box::from_raw(handle) };
        info!("destroyed DIE engine instance via C-ABI");
    });
}

/// Pass 1: Ingest and process an assessment page image capture.
///
/// # Safety
/// - `handle` must point to a valid [`DIEEngineHandle`].
/// - `session_id`, `section_id` must point to valid null-terminated C strings.
/// - `image_bytes` must point to a valid byte array of at least `image_len` bytes.
#[no_mangle]
pub unsafe extern "C" fn die_session_ingest_page(
    handle: *mut DIEEngineHandle,
    session_id: *const c_char,
    section_id: *const c_char,
    page_num: i32,
    image_bytes: *const u8,
    image_len: usize,
    callback: DIEProgressCallback,
    user_data: *mut c_void,
) -> i32 {
    if handle.is_null() || session_id.is_null() || section_id.is_null() || image_bytes.is_null() {
        return -1;
    }

    let result = catch_unwind(|| {
        // SAFETY: Pointers are verified non-null above.
        let sess_str = unsafe { CStr::from_ptr(session_id).to_string_lossy() };
        let sec_str = unsafe { CStr::from_ptr(section_id).to_string_lossy() };
        let slice = unsafe { std::slice::from_raw_parts(image_bytes, image_len) };
        let engine = unsafe { &*handle };

type ProgressBridgeFn = Arc<dyn Fn(&str, i32, i32, &str) + Send + Sync>;

        // Construct Rust progress callback bridging to C function pointer
        let cb_bridge = callback.map(|cb| {
            let u_data = user_data as usize;
            let bridge: ProgressBridgeFn = Arc::new(
                move |event: &str, cur: i32, total: i32, payload: &str| {
                    if let (Ok(c_event), Ok(c_payload)) = (CString::new(event), CString::new(payload)) {
                        // SAFETY: Invoking C callback function pointer with valid CStrings.
                        unsafe {
                            cb(
                                c_event.as_ptr(),
                                cur,
                                total,
                                c_payload.as_ptr(),
                                u_data as *mut c_void,
                            );
                        }
                    }
                },
            );
            bridge
        });

        match engine
            .coordinator
            .ingest_page(&sess_str, &sec_str, page_num, slice, cb_bridge)
        {
            Ok(count) => count as i32,
            Err(e) => {
                error!("error in die_session_ingest_page: {e}");
                -1
            }
        }
    });

    result.unwrap_or(-1)
}

/// Pass 2: Reconcile session questions and export into requested format.
///
/// Returns a newly allocated null-terminated C string on success, or null on error.
/// Caller MUST free the returned string using [`die_string_free`].
///
/// # Safety
/// - `handle` must point to a valid [`DIEEngineHandle`].
/// - `session_id`, `target_format` must point to valid null-terminated C strings.
#[no_mangle]
pub unsafe extern "C" fn die_session_export(
    handle: *mut DIEEngineHandle,
    session_id: *const c_char,
    target_format: *const c_char,
) -> *mut c_char {
    if handle.is_null() || session_id.is_null() || target_format.is_null() {
        return std::ptr::null_mut();
    }

    let result = catch_unwind(|| {
        // SAFETY: Pointers are verified non-null above.
        let sess_str = unsafe { CStr::from_ptr(session_id).to_string_lossy() };
        let format_str = unsafe { CStr::from_ptr(target_format).to_string_lossy() };
        let engine = unsafe { &*handle };

        match engine.coordinator.export_session(&sess_str, &format_str, false) {
            Ok(payload) => match CString::new(payload) {
                Ok(c_str) => c_str.into_raw(),
                Err(e) => {
                    error!("CString conversion error: {e}");
                    std::ptr::null_mut()
                }
            },
            Err(e) => {
                error!("export error: {e}");
                std::ptr::null_mut()
            }
        }
    });

    result.unwrap_or(std::ptr::null_mut())
}

/// Free a string previously allocated by [`die_session_export`].
///
/// # Safety
/// `ptr` must be a pointer returned by [`die_session_export`], or null.
#[no_mangle]
pub unsafe extern "C" fn die_string_free(ptr: *mut c_char) {
    if ptr.is_null() {
        return;
    }

    let _ = catch_unwind(|| {
        // SAFETY: `ptr` was allocated via CString::into_raw.
        unsafe {
            drop(CString::from_raw(ptr));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn test_c_abi_lifecycle() {
        unsafe {
            let handle = die_engine_init(std::ptr::null(), std::ptr::null());
            assert!(!handle.is_null());

            // Create sample test image bytes
            let mut img = image::RgbImage::new(100, 100);
            for y in 0..100 {
                for x in 0..100 {
                    if (x + y) % 3 == 0 {
                        img.put_pixel(x, y, image::Rgb([0, 0, 0]));
                    } else {
                        img.put_pixel(x, y, image::Rgb([255, 255, 255]));
                    }
                }
            }
            let mut bytes = Vec::new();
            img.write_to(&mut Cursor::new(&mut bytes), image::ImageFormat::Png).unwrap();

            let sess_c = CString::new("c_sess_1").unwrap();
            let sec_c = CString::new("sec_a").unwrap();

            let count = die_session_ingest_page(
                handle,
                sess_c.as_ptr(),
                sec_c.as_ptr(),
                1,
                bytes.as_ptr(),
                bytes.len(),
                None,
                std::ptr::null_mut(),
            );
            assert!(count >= 1);

            // Export to YAML v3
            let fmt_yaml = CString::new("yaml_frontmatter_v3").unwrap();
            let yaml_ptr = die_session_export(handle, sess_c.as_ptr(), fmt_yaml.as_ptr());
            assert!(!yaml_ptr.is_null());
            let yaml_str = CStr::from_ptr(yaml_ptr).to_str().unwrap();
            assert!(yaml_str.contains("schemaVersion: \"3.0\""));
            die_string_free(yaml_ptr);

            // Export to CBT JSON
            let fmt_json = CString::new("takemock_cbt_json").unwrap();
            let json_ptr = die_session_export(handle, sess_c.as_ptr(), fmt_json.as_ptr());
            assert!(!json_ptr.is_null());
            let json_str = CStr::from_ptr(json_ptr).to_str().unwrap();
            assert!(json_str.contains("examSession"));
            die_string_free(json_ptr);

            die_engine_destroy(handle);
        }
    }
}
