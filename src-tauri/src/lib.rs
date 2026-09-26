#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_notification::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      #[cfg(target_os = "macos")]
      {
        use tauri::Manager;
        if let Some(window) = app.get_webview_window("main") {
          let _ = window_vibrancy::apply_vibrancy(
            &window,
            window_vibrancy::NSVisualEffectMaterial::UnderWindowBackground,
            Some(window_vibrancy::NSVisualEffectState::FollowsWindowActiveState),
            Some(12.0),
          );
        }
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
