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
        use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};

        if let Some(window) = app.get_webview_window("main") {
          use objc2_app_kit::{NSColor, NSWindow};

          if let Ok(ptr) = window.ns_window() {
            unsafe {
              let ns_window = ptr as *mut NSWindow;
              if let Some(ns_win) = ns_window.as_ref() {
                ns_win.setOpaque(false);
                ns_win.setBackgroundColor(Some(&NSColor::clearColor()));
              }
            }
          }

          let res = window_vibrancy::apply_vibrancy(
            &window,
            window_vibrancy::NSVisualEffectMaterial::UnderWindowBackground,
            Some(window_vibrancy::NSVisualEffectState::FollowsWindowActiveState),
            Some(12.0),
          );
          eprintln!("Applied macOS adaptive vibrancy: {:?}", res);
        }

        // App Menu
        let app_menu = SubmenuBuilder::new(app, "TakeMock")
          .about(Some(tauri::menu::AboutMetadata {
            name: Some("TakeMock".into()),
            version: Some("0.1.0".into()),
            authors: Some(vec!["TakeMock Team".into()]),
            comments: Some("High-Performance Local-First Exam Suite".into()),
            ..Default::default()
          }))
          .separator()
          .item(&MenuItemBuilder::with_id("preferences", "Preferences...")
            .accelerator("CmdOrCtrl+,")
            .build(app)?)
          .separator()
          .services()
          .separator()
          .hide()
          .hide_others()
          .show_all()
          .separator()
          .quit()
          .build()?;

        // File Menu
        let file_menu = SubmenuBuilder::new(app, "File")
          .item(&MenuItemBuilder::with_id("new_paper", "New Paper")
            .accelerator("CmdOrCtrl+N")
            .build(app)?)
          .item(&MenuItemBuilder::with_id("import_paper", "Import Question Pack...")
            .accelerator("CmdOrCtrl+O")
            .build(app)?)
          .separator()
          .close_window()
          .build()?;

        // Edit Menu
        let edit_menu = SubmenuBuilder::new(app, "Edit")
          .undo()
          .redo()
          .separator()
          .cut()
          .copy()
          .paste()
          .select_all()
          .build()?;

        // View Menu
        let view_menu = SubmenuBuilder::new(app, "View")
          .item(&MenuItemBuilder::with_id("toggle_sidebar", "Toggle Sidebar")
            .accelerator("CmdOrCtrl+B")
            .build(app)?)
          .separator()
          .item(&MenuItemBuilder::with_id("nav_library", "Library")
            .accelerator("CmdOrCtrl+1")
            .build(app)?)
          .item(&MenuItemBuilder::with_id("nav_practice", "Quick Drill")
            .accelerator("CmdOrCtrl+2")
            .build(app)?)
          .item(&MenuItemBuilder::with_id("nav_builder", "Builder")
            .accelerator("CmdOrCtrl+3")
            .build(app)?)
          .item(&MenuItemBuilder::with_id("nav_analysis", "Performance Analytics")
            .accelerator("CmdOrCtrl+4")
            .build(app)?)
          .item(&MenuItemBuilder::with_id("nav_mistakes", "Mistake Vault")
            .accelerator("CmdOrCtrl+5")
            .build(app)?)
          .separator()
          .fullscreen()
          .build()?;

        // Window Menu
        let window_menu = SubmenuBuilder::new(app, "Window")
          .minimize()
          .separator()
          .bring_all_to_front()
          .build()?;

        // Assemble Root Menu Bar
        let root_menu = MenuBuilder::new(app)
          .items(&[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu])
          .build()?;

        app.set_menu(root_menu)?;
      }

      Ok(())
    })
    .on_menu_event(|app, event| {
      use tauri::Emitter;
      let id = event.id().as_ref();
      match id {
        "preferences" => {
          let _ = app.emit("native-menu-action", "open-preferences");
        }
        "new_paper" => {
          let _ = app.emit("native-menu-navigate", "/builder");
        }
        "import_paper" => {
          let _ = app.emit("native-menu-action", "import-paper");
        }
        "toggle_sidebar" => {
          let _ = app.emit("native-menu-action", "toggle-sidebar");
        }
        "nav_library" => {
          let _ = app.emit("native-menu-navigate", "/");
        }
        "nav_practice" => {
          let _ = app.emit("native-menu-navigate", "/practice");
        }
        "nav_builder" => {
          let _ = app.emit("native-menu-navigate", "/builder");
        }
        "nav_analysis" => {
          let _ = app.emit("native-menu-navigate", "/analysis");
        }
        "nav_mistakes" => {
          let _ = app.emit("native-menu-navigate", "/mistakes");
        }
        _ => {}
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
