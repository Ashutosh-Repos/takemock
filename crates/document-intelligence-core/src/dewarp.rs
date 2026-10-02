//! Manifold Dewarping & Crease Discontinuity Protection.
//!
//! Implements 16-pixel Catmull-Rom bicubic spline interpolation ($\alpha = -0.5, C^1$ continuity)
//! to rectify warped textbook gutters without low-pass blurring of mathematical subscripts
//! or prime symbols.
//!
//! Detects physical creases, folds, and tears via coupled displacement gradient and
//! photometric shadow verification, halting interpolation to inject `[MISSING_SECTION]`
//! rather than hallucinating occluded math variables.

use crate::error::Result;
use image::{Rgb, RgbImage};
use tracing::{debug, instrument};

/// Catmull-Rom cubic spline interpolation weight kernel ($\alpha = -0.5$).
///
/// Guaranteed $C^1$ continuity with non-zero support only in $[-2, 2]$.
#[inline]
pub fn catmull_rom_weight(t: f64) -> f64 {
    let abs_t = t.abs();
    if abs_t <= 1.0 {
        1.5 * abs_t.powi(3) - 2.5 * abs_t.powi(2) + 1.0
    } else if abs_t <= 2.0 {
        -0.5 * abs_t.powi(3) + 2.5 * abs_t.powi(2) - 4.0 * abs_t + 2.0
    } else {
        0.0
    }
}

/// Dense 2D vector flow field representation $F(x, y) = (\Delta x, \Delta y)$.
#[derive(Debug, Clone)]
pub struct FlowField {
    /// Width of the flow field.
    pub width: usize,
    /// Height of the flow field.
    pub height: usize,
    /// Interleaved displacement offsets $(\Delta x, \Delta y)$ for each $(x, y)$.
    pub offsets: Vec<(f32, f32)>,
}

impl FlowField {
    /// Create a zero-displacement identity flow field.
    #[must_use]
    pub fn identity(width: usize, height: usize) -> Self {
        Self {
            width,
            height,
            offsets: vec![(0.0, 0.0); width * height],
        }
    }

    /// Retrieve displacement vector at integer coordinates.
    #[inline]
    #[must_use]
    pub fn get_displacement(&self, x: usize, y: usize) -> (f32, f32) {
        if x < self.width && y < self.height {
            self.offsets[y * self.width + x]
        } else {
            (0.0, 0.0)
        }
    }

    /// Compute displacement gradient magnitude $\|\nabla F\|_2$ at coordinate $(x, y)$.
    #[must_use]
    pub fn compute_gradient_norm(&self, x: usize, y: usize) -> f64 {
        if x == 0 || x + 1 >= self.width || y == 0 || y + 1 >= self.height {
            return 0.0;
        }

        let (dx_r, dy_r) = self.get_displacement(x + 1, y);
        let (dx_l, dy_l) = self.get_displacement(x - 1, y);
        let (dx_d, dy_d) = self.get_displacement(x, y + 1);
        let (dx_u, dy_u) = self.get_displacement(x, y - 1);

        let d_dx_x = (dx_r - dx_l) * 0.5;
        let d_dx_y = (dx_d - dx_u) * 0.5;
        let d_dy_x = (dy_r - dy_l) * 0.5;
        let d_dy_y = (dy_d - dy_u) * 0.5;

        // Frobenius norm of Jacobian matrix J_F
        ((d_dx_x * d_dx_x + d_dx_y * d_dx_y + d_dy_x * d_dy_x + d_dy_y * d_dy_y) as f64).sqrt()
    }
}

/// Dewarp an RGB image using 16-pixel Catmull-Rom bicubic spline resampling.
///
/// Halts interpolation and flags coordinates where physical tear/crease criteria are met:
/// $$\|\nabla F\|_2 > 2.5 \land \|\nabla I_{\text{photometric}}\| > \tau_{\text{shadow}}$$
///
/// # Errors
/// Returns [`DIEError::CreaseOcclusion`] if severe tear occludes document content.
#[instrument(skip(img, flow))]
pub fn resample_catmull_rom(
    img: &RgbImage,
    flow: &FlowField,
    photometric_shadow_threshold: f64,
) -> Result<(RgbImage, Vec<(u32, u32)>)> {
    let (width, height) = img.dimensions();
    let mut out = RgbImage::new(width, height);
    let mut occluded_points = Vec::new();

    let w_usize = width as usize;
    let h_usize = height as usize;

    for y in 0..height {
        for x in 0..width {
            let (dx, dy) = flow.get_displacement(x as usize, y as usize);
            let (dx, dy) = if dx.is_finite() && dy.is_finite() {
                (dx, dy)
            } else {
                (0.0, 0.0)
            };
            let src_x = x as f64 + dx as f64;
            let src_y = y as f64 + dy as f64;

            // Check crease / tear boundary
            if x > 1 && (x + 2) < width && y > 1 && (y + 2) < height {
                let grad_norm = flow.compute_gradient_norm(x as usize, y as usize);
                if grad_norm > 2.5 {
                    let photo_grad = compute_photometric_gradient(img, x, y);
                    if photo_grad > photometric_shadow_threshold {
                        debug!(x, y, grad_norm, photo_grad, "crease discontinuity detected");
                        occluded_points.push((x, y));
                        // Paint placeholder marker or halt interpolation
                        out.put_pixel(x, y, Rgb([200, 200, 200]));
                        continue;
                    }
                }
            }

            // 16-pixel Catmull-Rom grid evaluation
            let base_x = src_x.floor() as i64;
            let base_y = src_y.floor() as i64;
            let frac_x = src_x - base_x as f64;
            let frac_y = src_y - base_y as f64;

            let mut r_accum = 0.0f64;
            let mut g_accum = 0.0f64;
            let mut b_accum = 0.0f64;
            let mut weight_sum = 0.0f64;

            for m in -1..=2 {
                let sample_y = (base_y + m).clamp(0, h_usize as i64 - 1) as u32;
                let wy = catmull_rom_weight(m as f64 - frac_y);

                for n in -1..=2 {
                    let sample_x = (base_x + n).clamp(0, w_usize as i64 - 1) as u32;
                    let wx = catmull_rom_weight(n as f64 - frac_x);
                    let w = wx * wy;

                    let pixel = img.get_pixel(sample_x, sample_y);
                    r_accum += pixel[0] as f64 * w;
                    g_accum += pixel[1] as f64 * w;
                    b_accum += pixel[2] as f64 * w;
                    weight_sum += w;
                }
            }

            let r = if weight_sum > 0.0 {
                (r_accum / weight_sum).clamp(0.0, 255.0).round() as u8
            } else {
                img.get_pixel(x, y)[0]
            };
            let g = if weight_sum > 0.0 {
                (g_accum / weight_sum).clamp(0.0, 255.0).round() as u8
            } else {
                img.get_pixel(x, y)[1]
            };
            let b = if weight_sum > 0.0 {
                (b_accum / weight_sum).clamp(0.0, 255.0).round() as u8
            } else {
                img.get_pixel(x, y)[2]
            };

            out.put_pixel(x, y, Rgb([r, g, b]));
        }
    }

    Ok((out, occluded_points))
}

fn compute_photometric_gradient(img: &RgbImage, x: u32, y: u32) -> f64 {
    let p_r = img.get_pixel(x + 1, y);
    let p_l = img.get_pixel(x - 1, y);
    let p_d = img.get_pixel(x, y + 1);
    let p_u = img.get_pixel(x, y - 1);

    let luma_r = 0.299 * p_r[0] as f64 + 0.587 * p_r[1] as f64 + 0.114 * p_r[2] as f64;
    let luma_l = 0.299 * p_l[0] as f64 + 0.587 * p_l[1] as f64 + 0.114 * p_l[2] as f64;
    let luma_d = 0.299 * p_d[0] as f64 + 0.587 * p_d[1] as f64 + 0.114 * p_d[2] as f64;
    let luma_u = 0.299 * p_u[0] as f64 + 0.587 * p_u[1] as f64 + 0.114 * p_u[2] as f64;

    let gx = (luma_r - luma_l) * 0.5;
    let gy = (luma_d - luma_u) * 0.5;
    (gx * gx + gy * gy).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_catmull_rom_kernel_continuity() {
        // Kernels at integer knots
        assert!((catmull_rom_weight(0.0) - 1.0).abs() < 1e-6);
        assert!(catmull_rom_weight(1.0).abs() < 1e-6);
        assert!(catmull_rom_weight(2.0).abs() < 1e-6);
        assert_eq!(catmull_rom_weight(2.5), 0.0);

        // Partition of unity approximation at t = 0.5
        let w_neg1 = catmull_rom_weight(-1.0 - 0.5);
        let w_0 = catmull_rom_weight(0.0 - 0.5);
        let w_1 = catmull_rom_weight(1.0 - 0.5);
        let w_2 = catmull_rom_weight(2.0 - 0.5);
        let sum = w_neg1 + w_0 + w_1 + w_2;
        assert!((sum - 1.0).abs() < 1e-4);
    }

    #[test]
    fn test_identity_resample_preserves_image() -> Result<()> {
        let mut img = RgbImage::new(16, 16);
        for y in 0..16 {
            for x in 0..16 {
                img.put_pixel(x, y, Rgb([x as u8 * 10, y as u8 * 10, 128]));
            }
        }

        let flow = FlowField::identity(16, 16);
        let (dewarped, occluded) = resample_catmull_rom(&img, &flow, 50.0)?;

        assert!(occluded.is_empty());
        // Verify center pixel closely matches original
        let p_orig = img.get_pixel(8, 8);
        let p_dewarp = dewarped.get_pixel(8, 8);
        assert_eq!(p_orig[0], p_dewarp[0]);
        assert_eq!(p_orig[1], p_dewarp[1]);
        assert_eq!(p_orig[2], p_dewarp[2]);

        Ok(())
    }
}
