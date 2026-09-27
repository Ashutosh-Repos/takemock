#[cfg(target_os = "macos")]
pub fn start_dock_icon_sync() {
  sync_dock_icon();

  // Watch for appearance / icon style changes in background
  std::thread::spawn(|| {
    let mut last_mode = get_icon_mode();
    loop {
      std::thread::sleep(std::time::Duration::from_millis(1000));
      let current_mode = get_icon_mode();
      if current_mode != last_mode {
        last_mode = current_mode;
        apply_dock_icon(current_mode);
      }
    }
  });
}

#[cfg(target_os = "macos")]
pub fn sync_dock_icon() {
  let mode = get_icon_mode();
  apply_dock_icon(mode);
}

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
enum IconMode {
  Dark,    // User chose "Dark" icon style (RegularDark)
  Default, // User chose "Default", "Clear", or "Tinted" -> let macOS handle natively with default icon
}

#[cfg(target_os = "macos")]
fn get_icon_mode() -> IconMode {
  use std::process::Command;

  let icon_theme = Command::new("defaults")
    .args(["read", "-g", "AppleIconAppearanceTheme"])
    .output()
    .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    .unwrap_or_default();

  // In macOS Tahoe:
  // - "Dark": AppleIconAppearanceTheme = RegularDark
  // - "Default": AppleIconAppearanceTheme = RegularLight or (empty)
  // - "Clear": AppleIconAppearanceTheme = ClearLight, ClearDark, ClearAutomatic
  // - "Tinted": AppleIconAppearanceTheme = TintedLight, TintedDark, TintedAutomatic
  //
  // ONLY in RegularDark do we set the explicit dark icon.
  // For Clear, Tinted, and Default, passing nil restores the bundle's default icon,
  // enabling macOS to natively apply Liquid Glass (Clear) and Tinting shaders to it!
  if icon_theme == "RegularDark" {
    IconMode::Dark
  } else {
    IconMode::Default
  }
}

#[cfg(target_os = "macos")]
fn apply_dock_icon(mode: IconMode) {
  unsafe {
    use objc2::{class, msg_send, runtime::AnyObject};

    let ns_app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
    if ns_app.is_null() {
      return;
    }

    match mode {
      IconMode::Dark => {
        let icon_bytes: &[u8] = include_bytes!("../icons/icon.png");
        let ns_data: *mut AnyObject = msg_send![
          class!(NSData),
          dataWithBytes: icon_bytes.as_ptr()
          length: icon_bytes.len()
        ];
        if !ns_data.is_null() {
          let ns_image_alloc: *mut AnyObject = msg_send![class!(NSImage), alloc];
          let ns_image: *mut AnyObject = msg_send![ns_image_alloc, initWithData: ns_data];
          if !ns_image.is_null() {
            let _: () = msg_send![ns_app, setApplicationIconImage: ns_image];
            let _: () = msg_send![ns_image, release];
            let dock_tile: *mut AnyObject = msg_send![ns_app, dockTile];
            if !dock_tile.is_null() {
              let _: () = msg_send![dock_tile, display];
            }
            eprintln!("[TakeMock] Set Dark Dock icon");
          }
        }
      }
      IconMode::Default => {
        // Pass nil to restore the bundle's default icon (icon.icns / icon-light.png).
        // This is REQUIRED so macOS can apply Default, Clear (Liquid Glass), and Tinted shaders!
        let nil_img: *mut AnyObject = std::ptr::null_mut();
        let _: () = msg_send![ns_app, setApplicationIconImage: nil_img];
        let dock_tile: *mut AnyObject = msg_send![ns_app, dockTile];
        if !dock_tile.is_null() {
          let _: () = msg_send![dock_tile, display];
        }
        eprintln!("[TakeMock] Restored default bundle icon for macOS (handles Default, Clear, Tinted)");
      }
    }
  }
}
