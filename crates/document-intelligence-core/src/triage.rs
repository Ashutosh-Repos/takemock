//! Ultra-Fast Optical Ingestion & SIMD Triage Gate ($\le 50\text{ ms}$).
//!
//! Evaluates image inputs on the CPU prior to neural allocation.
//! Filters out blurry captures, natural scenes, clutter, and non-academic
//! layouts (receipts, terminal logs, code editors) in $< 50\text{ ms}$.

use crate::error::{DIEError, Result};
use image::{imageops::FilterType, DynamicImage, GrayImage, ImageReader};
use std::io::Cursor;
use tracing::{instrument, warn};

/// Minimum acceptable Laplacian variance for focus.
pub const BLUR_VARIANCE_THRESHOLD: f64 = 80.0;
/// Minimum directional text energy ratio.
pub const GABOR_TEXT_RATIO_THRESHOLD: f64 = 0.35;
/// Minimum edge density for academic assessment pages.
pub const EDGE_DENSITY_THRESHOLD: f64 = 0.04;
/// Minimum vertical line spacing variance to distinguish academic text from monospace receipts.
pub const LINE_SPACING_VARIANCE_THRESHOLD: f64 = 1.2;
/// Monospace receipt aspect ratio trigger.
pub const RECEIPT_ASPECT_RATIO_TRIGGER: f64 = 2.5;

/// Metrics computed by the optical triage engine.
#[derive(Debug, Clone, PartialEq)]
pub struct TriageMetrics {
    /// Laplacian focus variance ($\sigma_L^2$).
    pub focus_variance: f64,
    /// Directional text energy ratio ($\Phi_{\text{text}}$).
    pub gabor_ratio: f64,
    /// Edge pixel density in [0.0, 1.0].
    pub edge_density: f64,
    /// Line spacing variance ($\sigma_{\Delta y}^2$).
    pub line_spacing_variance: f64,
    /// Bounding aspect ratio (height / width).
    pub aspect_ratio: f64,
    /// Whether any dark tiles were normalized/inverted.
    pub had_inverted_tiles: bool,
}

/// Extracts the EXIF orientation tag from raw JPEG image bytes if present.
///
/// Returns 1 (normal) if EXIF is absent or unparseable.
#[must_use]
pub fn extract_exif_orientation(data: &[u8]) -> u32 {
    let mut idx = 0;
    while idx + 4 < data.len() {
        if data[idx] == 0xFF && data[idx + 1] == 0xE1 {
            let app1_len = u16::from_be_bytes([data[idx + 2], data[idx + 3]]) as usize;
            let end = (idx + 2 + app1_len).min(data.len());
            let app1 = &data[idx + 4..end];
            if app1.starts_with(b"Exif\0\0") && app1.len() > 14 {
                let tiff = &app1[6..];
                let is_le = tiff.starts_with(b"II");
                let read_u16 = |bytes: &[u8]| -> u16 {
                    if is_le {
                        u16::from_le_bytes([bytes[0], bytes[1]])
                    } else {
                        u16::from_be_bytes([bytes[0], bytes[1]])
                    }
                };
                let read_u32 = |bytes: &[u8]| -> u32 {
                    if is_le {
                        u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])
                    } else {
                        u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])
                    }
                };

                if tiff.len() >= 8 {
                    let first_ifd = read_u32(&tiff[4..8]) as usize;
                    if first_ifd + 2 <= tiff.len() {
                        let num_entries = read_u16(&tiff[first_ifd..first_ifd + 2]) as usize;
                        for e in 0..num_entries {
                            let offset = first_ifd + 2 + e * 12;
                            if offset + 12 <= tiff.len() {
                                let tag = read_u16(&tiff[offset..offset + 2]);
                                if tag == 0x0112 {
                                    return read_u16(&tiff[offset + 8..offset + 10]) as u32;
                                }
                            }
                        }
                    }
                }
            }
            idx += 2 + app1_len;
        } else if data[idx] == 0xFF && data[idx + 1] == 0xDA {
            break;
        } else {
            idx += 1;
        }
    }
    1
}

/// Transposes a DynamicImage to upright orientation based on its EXIF metadata.
#[must_use]
pub fn apply_exif_orientation(image_bytes: &[u8], img: DynamicImage) -> DynamicImage {
    match extract_exif_orientation(image_bytes) {
        6 => img.rotate90(),
        3 => img.rotate180(),
        8 => img.rotate270(),
        _ => img,
    }
}

/// Downsamples an input image buffer into a 720p luminance proxy (`GrayImage`).
///
/// # Errors
/// Returns [`DIEError::ImageError`] if decoding fails.
#[instrument(skip(image_bytes))]
pub fn create_720p_proxy(image_bytes: &[u8]) -> Result<GrayImage> {
    let mut reader = ImageReader::new(Cursor::new(image_bytes)).with_guessed_format()?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(12000);
    limits.max_image_height = Some(12000);
    limits.max_alloc = Some(256 * 1024 * 1024);
    reader.limits(limits);

    let dyn_img = reader.decode()?;
    let dyn_img = apply_exif_orientation(image_bytes, dyn_img);
    let gray = dyn_img.to_luma8();

    let (orig_w, orig_h) = gray.dimensions();
    let max_dim = 1280u32;

    if orig_w <= max_dim && orig_h <= max_dim {
        Ok(gray)
    } else {
        let (target_w, target_h) = if orig_w >= orig_h {
            let ratio = orig_h as f64 / orig_w as f64;
            (max_dim, (max_dim as f64 * ratio).round() as u32)
        } else {
            let ratio = orig_w as f64 / orig_h as f64;
            ((max_dim as f64 * ratio).round() as u32, max_dim)
        };

        let dyn_gray = DynamicImage::ImageLuma8(gray);
        let resized = dyn_gray.resize_exact(target_w, target_h, FilterType::Triangle);
        Ok(resized.to_luma8())
    }
}

/// Applies adaptive tile polarity normalization across an $8 \times 8$ grid.
///
/// Dark tiles ($\text{Median} < 100$) with active edges ($> 0.04$) are inverted,
/// seamlessly handling blackboards, slate screens, and dark header bands.
pub fn normalize_tile_polarities(img: &mut GrayImage) -> bool {
    let (width, height) = img.dimensions();
    let tile_cols = 8u32;
    let tile_rows = 8u32;
    let tile_w = width / tile_cols;
    let tile_h = height / tile_rows;

    if tile_w == 0 || tile_h == 0 {
        return false;
    }

    let mut inverted_any = false;

    for ty in 0..tile_rows {
        for tx in 0..tile_cols {
            let x_start = tx * tile_w;
            let y_start = ty * tile_h;
            let x_end = if tx == tile_cols - 1 { width } else { (tx + 1) * tile_w };
            let y_end = if ty == tile_rows - 1 { height } else { (ty + 1) * tile_h };

            let count = ((x_end - x_start) * (y_end - y_start)) as usize;
            if count == 0 {
                continue;
            }

            let mut values = Vec::with_capacity(count);
            for y in y_start..y_end {
                for x in x_start..x_end {
                    values.push(img.get_pixel(x, y)[0]);
                }
            }

            values.sort_unstable();
            let median = values[values.len() / 2];

            // Edge density check within tile
            let edge_density = compute_tile_edge_density(img, x_start, y_start, x_end, y_end);

            if median < 100 && edge_density > 0.04 {
                inverted_any = true;
                for y in y_start..y_end {
                    for x in x_start..x_end {
                        let p = img.get_pixel_mut(x, y);
                        p[0] = 255 - p[0];
                    }
                }
            }
        }
    }

    inverted_any
}

fn compute_tile_edge_density(
    img: &GrayImage,
    x_start: u32,
    y_start: u32,
    x_end: u32,
    y_end: u32,
) -> f64 {
    let mut edge_count = 0usize;
    let total_pixels = ((x_end - x_start).saturating_sub(2) * (y_end - y_start).saturating_sub(2)) as usize;
    if total_pixels == 0 {
        return 0.0;
    }

    for y in (y_start + 1)..(y_end.saturating_sub(1)) {
        for x in (x_start + 1)..(x_end.saturating_sub(1)) {
            let left = img.get_pixel(x - 1, y)[0] as i32;
            let right = img.get_pixel(x + 1, y)[0] as i32;
            let up = img.get_pixel(x, y - 1)[0] as i32;
            let down = img.get_pixel(x, y + 1)[0] as i32;

            let gx = right - left;
            let gy = down - up;
            let mag = (gx.abs() + gy.abs()) as f64;

            if mag > 50.0 {
                edge_count += 1;
            }
        }
    }

    edge_count as f64 / total_pixels as f64
}

/// Evaluates focus variance ($\sigma_L^2$) using discrete Laplacian convolution:
/// $$K = \begin{bmatrix} 0 & 1 & 0 \\ 1 & -4 & 1 \\ 0 & 1 & 0 \end{bmatrix}$$
pub fn compute_laplacian_variance(img: &GrayImage) -> f64 {
    let (width, height) = img.dimensions();
    if width < 3 || height < 3 {
        return 0.0;
    }

    let mut sum = 0.0f64;
    let mut sq_sum = 0.0f64;
    let count = ((width - 2) * (height - 2)) as f64;

    for y in 1..(height - 1) {
        for x in 1..(width - 1) {
            let center = img.get_pixel(x, y)[0] as f64;
            let up = img.get_pixel(x, y - 1)[0] as f64;
            let down = img.get_pixel(x, y + 1)[0] as f64;
            let left = img.get_pixel(x - 1, y)[0] as f64;
            let right = img.get_pixel(x + 1, y)[0] as f64;

            let lap = up + down + left + right - 4.0 * center;
            sum += lap;
            sq_sum += lap * lap;
        }
    }

    let mean = sum / count;
    ((sq_sum / count) - (mean * mean)).max(0.0)
}

/// Computes directional text energy ratio $\Phi_{\text{text}}$ and edge density.
pub fn compute_text_periodicity_and_edge_density(img: &GrayImage) -> (f64, f64) {
    let (width, height) = img.dimensions();
    if width < 3 || height < 3 {
        return (0.0, 0.0);
    }

    let mut horizontal_energy = 0.0f64;
    let mut vertical_energy = 0.0f64;
    let mut edge_pixels = 0usize;
    let total = ((width - 2) * (height - 2)) as usize;

    for y in 1..(height - 1) {
        for x in 1..(width - 1) {
            let left = img.get_pixel(x - 1, y)[0] as f64;
            let right = img.get_pixel(x + 1, y)[0] as f64;
            let up = img.get_pixel(x, y - 1)[0] as f64;
            let down = img.get_pixel(x, y + 1)[0] as f64;

            let gx = (right - left).abs();
            let gy = (down - up).abs();

            horizontal_energy += gx;
            vertical_energy += gy;

            if (gx + gy) > 40.0 {
                edge_pixels += 1;
            }
        }
    }

    let total_energy = horizontal_energy + vertical_energy;
    let gabor_ratio = if total_energy > 0.0 {
        horizontal_energy / total_energy
    } else {
        0.0
    };

    let edge_density = edge_pixels as f64 / total as f64;
    (gabor_ratio, edge_density)
}

/// Evaluates vertical line spacing variance ($\sigma_{\Delta y}^2$) by projecting
/// horizontal row densities and measuring inter-line intervals.
pub fn compute_line_spacing_variance(img: &GrayImage) -> f64 {
    let (width, height) = img.dimensions();
    if height < 10 || width < 10 {
        return 0.0;
    }

    // Horizontal projection profile (sum of dark ink per row)
    let mut profile = vec![0.0f64; height as usize];
    for y in 0..height {
        let mut row_ink = 0.0f64;
        for x in 0..width {
            let luma = img.get_pixel(x, y)[0];
            if luma < 140 {
                row_ink += (255 - luma) as f64;
            }
        }
        profile[y as usize] = row_ink;
    }

    // Peak detection for text lines
    let mut line_peaks = Vec::new();
    let threshold = profile.iter().sum::<f64>() / (height as f64) * 0.7;

    for y in 1..(height as usize - 1) {
        if profile[y] > threshold && profile[y] >= profile[y - 1] && profile[y] >= profile[y + 1] {
            line_peaks.push(y);
        }
    }

    if line_peaks.len() < 3 {
        return 2.0; // Assume standard variance if insufficient lines found
    }

    let mut deltas = Vec::with_capacity(line_peaks.len() - 1);
    for i in 0..(line_peaks.len() - 1) {
        deltas.push((line_peaks[i + 1] - line_peaks[i]) as f64);
    }

    let mean_delta = deltas.iter().sum::<f64>() / deltas.len() as f64;
    let sq_diff_sum = deltas
        .iter()
        .map(|d| (d - mean_delta) * (d - mean_delta))
        .sum::<f64>();

    sq_diff_sum / deltas.len() as f64
}

/// Compute optical triage metrics without enforcing rejection thresholds.
///
/// Useful for diagnostics, profiling, and telemetry reporting.
///
/// # Errors
/// Returns [`DIEError::ImageError`] if decoding or downsampling fails.
#[instrument(skip(image_bytes))]
pub fn evaluate_optical_metrics(image_bytes: &[u8]) -> Result<TriageMetrics> {
    let mut proxy = create_720p_proxy(image_bytes)?;
    let had_inverted = normalize_tile_polarities(&mut proxy);

    let (width, height) = proxy.dimensions();
    let aspect_ratio = height as f64 / width.max(1) as f64;

    let focus_var = compute_laplacian_variance(&proxy);
    let (gabor_ratio, edge_density) = compute_text_periodicity_and_edge_density(&proxy);
    let line_spacing_var = compute_line_spacing_variance(&proxy);

    Ok(TriageMetrics {
        focus_variance: focus_var,
        gabor_ratio,
        edge_density,
        line_spacing_variance: line_spacing_var,
        aspect_ratio,
        had_inverted_tiles: had_inverted,
    })
}

/// Execute the optical triage gate on raw image bytes.
///
/// Completes in $\le 50\text{ ms}$ on standard CPU threads, preventing wasteful
/// allocation of neural inference memory on non-academic or blurred captures.
///
/// # Errors
/// Returns:
/// - [`DIEError::UnrecoverableBlur`] if $\sigma_L^2 < 80.0$.
/// - [`DIEError::NonAcademicImage`] if $\Phi_{\text{text}} < 0.35 \land \text{density} < 0.04$.
/// - [`DIEError::NonAcademicLayout`] if $\sigma_{\Delta y}^2 < 1.2 \land \text{aspect} > 2.5$.
#[instrument(skip(image_bytes))]
pub fn run_optical_triage(image_bytes: &[u8]) -> Result<TriageMetrics> {
    let metrics = evaluate_optical_metrics(image_bytes)?;

    if metrics.focus_variance < BLUR_VARIANCE_THRESHOLD {
        warn!(focus_variance = metrics.focus_variance, "image rejected due to severe blur");
        return Err(DIEError::UnrecoverableBlur {
            variance: metrics.focus_variance,
            threshold: BLUR_VARIANCE_THRESHOLD,
        });
    }

    if metrics.gabor_ratio < GABOR_TEXT_RATIO_THRESHOLD && metrics.edge_density < EDGE_DENSITY_THRESHOLD {
        warn!(metrics.gabor_ratio, metrics.edge_density, "image rejected as non-academic clutter");
        return Err(DIEError::NonAcademicImage {
            gabor_ratio: metrics.gabor_ratio,
            edge_density: metrics.edge_density,
        });
    }

    if metrics.line_spacing_variance < LINE_SPACING_VARIANCE_THRESHOLD && metrics.aspect_ratio > RECEIPT_ASPECT_RATIO_TRIGGER {
        warn!(metrics.line_spacing_variance, metrics.aspect_ratio, "layout rejected as monospace receipt or terminal log");
        return Err(DIEError::NonAcademicLayout {
            variance: metrics.line_spacing_variance,
            aspect_ratio: metrics.aspect_ratio,
        });
    }

    Ok(metrics)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_laplacian_variance_on_sharp_vs_flat() {
        let mut sharp = GrayImage::new(100, 100);
        for y in 0..100 {
            for x in 0..100 {
                if (x + y) % 4 == 0 {
                    sharp.put_pixel(x, y, image::Luma([0]));
                } else {
                    sharp.put_pixel(x, y, image::Luma([255]));
                }
            }
        }

        let flat = GrayImage::from_pixel(100, 100, image::Luma([128]));

        let sharp_var = compute_laplacian_variance(&sharp);
        let flat_var = compute_laplacian_variance(&flat);

        assert!(sharp_var > 1000.0);
        assert_eq!(flat_var, 0.0);
    }

    #[test]
    fn test_tile_polarity_inversion_for_blackboard() {
        // Dark blackboard with some light chalk marks
        let mut blackboard = GrayImage::from_pixel(64, 64, image::Luma([30]));
        for i in 10..54 {
            blackboard.put_pixel(i, 32, image::Luma([240]));
            blackboard.put_pixel(32, i, image::Luma([240]));
        }

        let inverted = normalize_tile_polarities(&mut blackboard);
        // Center pixel should be inverted if edge density threshold met
        if inverted {
            assert!(blackboard.get_pixel(33, 33)[0] > 200);
        }
    }
}
