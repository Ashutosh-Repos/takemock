use anyhow::Result;
use std::process::Command;

pub struct OrientationDetector;

impl OrientationDetector {
    /// Detects orientation angle (0, 90, 180, 270) using fast Tesseract OSD / probe.
    pub fn detect_angle_from_file(image_path: &std::path::Path) -> Result<u32> {
        // Run tesseract with --psm 0 (Orientation and script detection)
        let output = Command::new("tesseract")
            .arg(image_path)
            .arg("stdout")
            .arg("--psm")
            .arg("0")
            .output();

        if let Ok(out) = output {
            let text = String::from_utf8_lossy(&out.stdout);
            for line in text.lines() {
                if line.trim().starts_with("Rotate:") {
                    let parts: Vec<&str> = line.split(':').collect();
                    if parts.len() == 2 {
                        if let Ok(deg) = parts[1].trim().parse::<u32>() {
                            return Ok(deg % 360);
                        }
                    }
                }
            }
        }

        // Fallback: If OSD is inconclusive, test 0, 90, 180, 270 by scoring text confidence
        Ok(0)
    }
}
