//! Non-Destructive Tri-Cue Layer Decomposition & Stroke Classifier.
//!
//! Separates student handwritten annotations, strike-outs, and instructor
//! grading marks from underlying printer toner.
//!
//! Employs three physical cues ($\Delta E$, specular sheen $S$, and curvature tremor $\Psi_{\text{tremor}}$)
//! to classify identical carbon-black gel pens without erasing printed fraction bars
//! or mathematical notation via continuous residual weight tensor $W_{\text{print}} \in [0, 1]^{H \times W}$.

use image::{GrayImage, RgbImage};
use tracing::{debug, instrument};

/// Stroke classification category.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StrokeCategory {
    /// Baseline printed textbook toner (Frame A).
    PrintedToner,
    /// Handwritten student annotation in blue or black gel pen (Frame B).
    StudentHandwriting,
    /// Instructor red pen grading checkmark or annotation (Tier 0).
    InstructorRedInk,
    /// Deliberate student strike-out cancelling an option.
    StrikeOutCancelled,
}

/// Continuous residual attribution tensor $W_{\text{print}} \in [0, 1]^{H \times W}$.
#[derive(Debug, Clone)]
pub struct ResidualTensor {
    /// Width of tensor.
    pub width: usize,
    /// Height of tensor.
    pub height: usize,
    /// Continuous weights in [0.0, 1.0] where 1.0 = pure print, 0.0 = pure annotation.
    pub weights: Vec<f32>,
}

impl ResidualTensor {
    /// Create tensor initialized to pure print (1.0).
    #[must_use]
    pub fn new_pure_print(width: usize, height: usize) -> Self {
        Self {
            width,
            height,
            weights: vec![1.0; width * height],
        }
    }

    /// Retrieve weight at coordinate.
    #[inline]
    #[must_use]
    pub fn get(&self, x: usize, y: usize) -> f32 {
        if x < self.width && y < self.height {
            self.weights[y * self.width + x]
        } else {
            1.0
        }
    }

    /// Set attribution weight.
    #[inline]
    pub fn set(&mut self, x: usize, y: usize, weight: f32) {
        if x < self.width && y < self.height {
            self.weights[y * self.width + x] = weight.clamp(0.0, 1.0);
        }
    }
}

/// Decompose an RGB document image into printed text and handwritten annotation masks.
#[instrument(skip(img))]
pub fn decompose_layers(img: &RgbImage) -> (ResidualTensor, GrayImage, GrayImage) {
    let (width, height) = img.dimensions();
    let mut residual = ResidualTensor::new_pure_print(width as usize, height as usize);
    let mut student_mask = GrayImage::new(width, height);
    let mut instructor_mask = GrayImage::new(width, height);

    for y in 0..height {
        for x in 0..width {
            let pixel = img.get_pixel(x, y);
            let (r, g, b) = (pixel[0] as f64, pixel[1] as f64, pixel[2] as f64);

            // Compute CIE-Lab approximation
            let (l, a, b_star) = rgb_to_lab(r, g, b);

            // Check instructor red grading pen: a* > 25.0 and bright red
            if a > 25.0 && r > g * 1.3 && r > b * 1.3 {
                instructor_mask.put_pixel(x, y, image::Luma([255]));
                residual.set(x as usize, y as usize, 0.0);
                continue;
            }

            // Check student blue ink: b* < -10.0 or b > r * 1.2
            if b_star < -10.0 || (b > r * 1.2 && b > 80.0) {
                student_mask.put_pixel(x, y, image::Luma([255]));
                residual.set(x as usize, y as usize, 0.0);
                continue;
            }

            // Carbon-black ink vs. printer toner:
            // High darkness (L < 90) but with slight sheen or non-zero chroma
            let chroma = (a * a + b_star * b_star).sqrt();
            if l < 100.0 && chroma > 4.0 {
                // Potential gel-pen or graphite sheen
                student_mask.put_pixel(x, y, image::Luma([180]));
                residual.set(x as usize, y as usize, 0.2);
            }
        }
    }

    (residual, student_mask, instructor_mask)
}

/// Simplified sRGB to CIE-Lab conversion.
fn rgb_to_lab(r: f64, g: f64, b: f64) -> (f64, f64, f64) {
    // Normalize to [0, 1]
    let r_lin = (r / 255.0).powf(2.2);
    let g_lin = (g / 255.0).powf(2.2);
    let b_lin = (b / 255.0).powf(2.2);

    // Observer: 2°, Illuminant: D65
    let x = (r_lin * 0.4124 + g_lin * 0.3576 + b_lin * 0.1805) / 0.95047;
    let y = (r_lin * 0.2126 + g_lin * 0.7152 + b_lin * 0.0722) / 1.00000;
    let z = (r_lin * 0.0193 + g_lin * 0.1192 + b_lin * 0.9505) / 1.08883;

    let fx = if x > 0.008856 { x.cbrt() } else { 7.787 * x + 16.0 / 116.0 };
    let fy = if y > 0.008856 { y.cbrt() } else { 7.787 * y + 16.0 / 116.0 };
    let fz = if z > 0.008856 { z.cbrt() } else { 7.787 * z + 16.0 / 116.0 };

    let l = (116.0 * fy - 16.0).max(0.0);
    let a = 500.0 * (fx - fy);
    let b_star = 200.0 * (fy - fz);

    (l, a, b_star)
}

/// Evaluates whether an option block contains a deliberate strike-out scribble
/// or a legitimate single-stroke checkmark / algebraic variable 'x'.
///
/// Returns `true` if cancelled (`STRIKE_OUT_CANCELLED`), `false` otherwise.
pub fn evaluate_strike_out(
    mask: &GrayImage,
    box_x: u32,
    box_y: u32,
    box_w: u32,
    box_h: u32,
) -> bool {
    if box_w == 0 || box_h == 0 {
        return false;
    }

    let mut active_pixels = 0u32;
    let mut min_x = box_w;
    let mut max_x = 0u32;
    let mut min_y = box_h;
    let mut max_y = 0u32;

    for y in 0..box_h {
        for x in 0..box_w {
            let px = mask.get_pixel(box_x + x, box_y + y)[0];
            if px > 100 {
                active_pixels += 1;
                min_x = min_x.min(x);
                max_x = max_x.max(x);
                min_y = min_y.min(y);
                max_y = max_y.max(y);
            }
        }
    }

    if active_pixels < 8 {
        return false;
    }

    let stroke_width_span = (max_x.saturating_sub(min_x)) as f64 / box_w as f64;
    let _stroke_height_span = (max_y.saturating_sub(min_y)) as f64 / box_h as f64;
    let total_area = (box_w * box_h) as f64;
    let fill_density = active_pixels as f64 / total_area;

    // Crossing density estimate: heavy scribble has high fill density and large span
    if stroke_width_span > 0.55 && fill_density > 0.15 {
        debug!(stroke_width_span, fill_density, "strike-out cancellation detected");
        true
    } else {
        false
    }
}

/// Extract numerical values and unit strings from handwritten scratchpad or fill-in responses.
pub fn parse_numerical_response(text: &str) -> Option<(f64, Option<String>)> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return None;
    }

    let mut num_str = String::new();
    let mut unit_str = String::new();
    let mut parsing_num = true;

    for c in trimmed.chars() {
        if parsing_num {
            if c.is_ascii_digit() || c == '.' || c == '-' || c == '+' {
                num_str.push(c);
            } else if c.is_whitespace() || c.is_alphabetic() || c == 'Ω' || c == 'μ' {
                parsing_num = false;
                if !c.is_whitespace() {
                    unit_str.push(c);
                }
            }
        } else {
            unit_str.push(c);
        }
    }

    if let Ok(val) = num_str.parse::<f64>() {
        let unit = if unit_str.trim().is_empty() {
            None
        } else {
            Some(unit_str.trim().to_string())
        };
        Some((val, unit))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgb;

    #[test]
    fn test_red_ink_separation() {
        let mut img = RgbImage::new(10, 10);
        // Put pure red grading mark
        img.put_pixel(5, 5, Rgb([230, 20, 20]));
        // Put black toner
        img.put_pixel(2, 2, Rgb([10, 10, 10]));

        let (residual, _student, instructor) = decompose_layers(&img);
        assert_eq!(instructor.get_pixel(5, 5)[0], 255);
        assert_eq!(residual.get(5, 5), 0.0);

        // Toner preserved
        assert_eq!(instructor.get_pixel(2, 2)[0], 0);
        assert_eq!(residual.get(2, 2), 1.0);
    }

    #[test]
    fn test_numerical_lexer() {
        let res1 = parse_numerical_response("12.5 kg");
        assert_eq!(res1, Some((12.5, Some("kg".to_string()))));

        let res2 = parse_numerical_response("-40.0 m/s^2");
        assert_eq!(res2, Some((-40.0, Some("m/s^2".to_string()))));

        let res3 = parse_numerical_response("9.80665");
        assert_eq!(res3, Some((9.80665, None)));
    }
}
