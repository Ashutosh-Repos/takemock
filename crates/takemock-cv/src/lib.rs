use anyhow::{Context, Result};
use image::{DynamicImage, GenericImageView};
use std::path::Path;
use takemock_core::PixelRect;

pub mod orientation;

pub struct ImageProcessor;

impl ImageProcessor {
    pub fn load_image<P: AsRef<Path>>(path: P) -> Result<DynamicImage> {
        let img = image::open(path.as_ref())
            .with_context(|| format!("Failed to open image at {:?}", path.as_ref()))?;
        Ok(img)
    }

    pub fn rotate(img: &DynamicImage, angle: u32) -> DynamicImage {
        match angle % 360 {
            90 => img.rotate90(),
            180 => img.rotate180(),
            270 => img.rotate270(),
            _ => img.clone(),
        }
    }

    pub fn crop_subregion(img: &DynamicImage, rect: PixelRect) -> DynamicImage {
        let (img_w, img_h) = img.dimensions();
        let x = rect.x.min(img_w);
        let y = rect.y.min(img_h);
        let w = rect.width.min(img_w - x);
        let h = rect.height.min(img_h - y);

        if w == 0 || h == 0 {
            return DynamicImage::new_rgba8(1, 1);
        }

        img.crop_imm(x, y, w, h)
    }

    /// Normalizes contrast and illumination for optimal Tesseract OCR extraction
    pub fn enhance_for_ocr(img: &DynamicImage) -> DynamicImage {
        let mut gray = img.to_luma8();
        let mut min_val = 255u8;
        let mut max_val = 0u8;

        for p in gray.pixels() {
            min_val = min_val.min(p[0]);
            max_val = max_val.max(p[0]);
        }

        if max_val > min_val + 10 {
            let range = (max_val - min_val) as f32;
            for p in gray.pixels_mut() {
                let scaled = ((p[0].saturating_sub(min_val)) as f32 / range * 255.0) as u8;
                p[0] = scaled;
            }
        }

        DynamicImage::ImageLuma8(gray)
    }

    pub fn find_column_gutter(img: &DynamicImage) -> Option<u32> {
        let gray = img.to_luma8();
        let (w, h) = gray.dimensions();

        // 2-column layout applies to portrait orientation book pages
        if h <= w || w < 1000 {
            return None;
        }

        let start_x = (w as f32 * 0.38) as u32;
        let end_x = (w as f32 * 0.62) as u32;
        let y_start = (h as f32 * 0.15) as u32;
        let y_end = (h as f32 * 0.85) as u32;
        let sample_step_y = 6u32;

        // Sample background illumination
        let mut sum_brightness = 0u64;
        let mut count = 0u64;
        for x in (start_x..end_x).step_by(8) {
            for y in (y_start..y_end).step_by(sample_step_y as usize * 2) {
                sum_brightness += gray.get_pixel(x, y)[0] as u64;
                count += 1;
            }
        }
        let mean_bg = (sum_brightness / count.max(1)) as u8;
        let ink_thresh = mean_bg.saturating_sub(40);

        let mut min_dark_count = u32::MAX;
        let mut best_x = w / 2;

        for x in (start_x..end_x).step_by(2) {
            let mut dark_count = 0u32;
            for y in (y_start..y_end).step_by(sample_step_y as usize) {
                if gray.get_pixel(x, y)[0] < ink_thresh {
                    dark_count += 1;
                }
            }

            if dark_count < min_dark_count {
                min_dark_count = dark_count;
                best_x = x;
            }
        }

        Some(best_x)
    }

    pub fn find_page_margins(gray: &image::GrayImage, gutter_x: u32) -> (u32, u32) {
        let (w, h) = gray.dimensions();
        let y_start = (h as f32 * 0.15) as u32;
        let y_end = (h as f32 * 0.85) as u32;
        let sample_step_y = 6usize;

        let mut sum_brightness = 0u64;
        let mut count = 0u64;
        for x in (gutter_x.saturating_sub(100)..gutter_x + 100).step_by(8) {
            for y in (y_start..y_end).step_by(sample_step_y * 2) {
                sum_brightness += gray.get_pixel(x, y)[0] as u64;
                count += 1;
            }
        }
        let mean_bg = (sum_brightness / count.max(1)) as u8;
        let ink_thresh = mean_bg.saturating_sub(40);

        // 1. Check left margin valley (between x=40 and x=search_left_end)
        let mut left_margin = 0u32;
        let search_left_end = (w as f32 * 0.16) as u32;
        if search_left_end > 50 {
            let mut min_left_ink = u32::MAX;
            let mut best_left_x = 0u32;
            for x in (40..search_left_end).step_by(2) {
                let mut dark_count = 0u32;
                for y in (y_start..y_end).step_by(sample_step_y) {
                    if gray.get_pixel(x, y)[0] < ink_thresh {
                        dark_count += 1;
                    }
                }
                if dark_count < min_left_ink {
                    min_left_ink = dark_count;
                    best_left_x = x;
                }
            }
            let mut left_ink_count = 0u32;
            for x in (10..best_left_x.saturating_sub(10)).step_by(4) {
                for y in (y_start..y_end).step_by(sample_step_y * 2) {
                    if gray.get_pixel(x, y)[0] < ink_thresh {
                        left_ink_count += 1;
                    }
                }
            }
            if left_ink_count > 30 && min_left_ink < 100 {
                left_margin = best_left_x;
            }
        }

        // 2. Check right margin valley
        let col_w = gutter_x.saturating_sub(left_margin);
        let right_start = gutter_x + (col_w as f32 * 0.80) as u32;
        let right_end = (gutter_x + (col_w as f32 * 1.08) as u32).min(w.saturating_sub(15));
        let mut right_margin = w;

        if right_end > right_start {
            let mut min_right_ink = u32::MAX;
            let mut best_right_x = w;
            for x in (right_start..right_end).step_by(2) {
                let mut dark_count = 0u32;
                for y in (y_start..y_end).step_by(sample_step_y) {
                    if gray.get_pixel(x, y)[0] < ink_thresh {
                        dark_count += 1;
                    }
                }
                if dark_count < min_right_ink {
                    min_right_ink = dark_count;
                    best_right_x = x;
                }
            }

            let mut right_ink_count = 0u32;
            for x in (best_right_x + 15..w).step_by(4) {
                for y in (y_start..y_end).step_by(sample_step_y * 2) {
                    if gray.get_pixel(x, y)[0] < ink_thresh {
                        right_ink_count += 1;
                    }
                }
            }
            if right_ink_count > 25 && min_right_ink < 100 {
                right_margin = best_right_x;
            }
        }

        (left_margin, right_margin)
    }

    pub fn split_columns(img: &DynamicImage) -> Vec<(DynamicImage, PixelRect)> {
        let (w, h) = img.dimensions();

        // Check for 2-column layout via adaptive projection profile
        if let Some(gutter_x) = Self::find_column_gutter(img) {
            let gray = img.to_luma8();
            let (left_margin, right_margin) = Self::find_page_margins(&gray, gutter_x);

            let left_w = gutter_x.saturating_sub(left_margin);
            let right_w = right_margin.saturating_sub(gutter_x);

            let left_rect = PixelRect { x: left_margin, y: 0, width: left_w, height: h };
            let right_rect = PixelRect { x: gutter_x, y: 0, width: right_w, height: h };

            let left_col = img.crop_imm(left_margin, 0, left_w, h);
            let right_col = img.crop_imm(gutter_x, 0, right_w, h);

            vec![(left_col, left_rect), (right_col, right_rect)]
        } else {
            // Single column page or full-width spanning content
            let full_rect = PixelRect { x: 0, y: 0, width: w, height: h };
            vec![(img.clone(), full_rect)]
        }
    }

    pub fn stitch_vertical(crops: &[&DynamicImage]) -> DynamicImage {
        if crops.is_empty() {
            return DynamicImage::new_rgba8(1, 1);
        }
        if crops.len() == 1 {
            return (*crops[0]).clone();
        }

        let mut max_width = 0u32;
        let mut total_height = 0u32;
        let gap = 12u32;

        for c in crops {
            let (w, h) = c.dimensions();
            max_width = max_width.max(w);
            total_height += h;
        }
        total_height += gap * (crops.len() as u32 - 1);

        let mut composite = image::RgbImage::from_pixel(max_width, total_height, image::Rgb([255, 255, 255]));

        let mut current_y = 0u32;
        for c in crops {
            let rgb_c = c.to_rgb8();
            let (w, h) = rgb_c.dimensions();
            for y in 0..h {
                for x in 0..w {
                    composite.put_pixel(x, current_y + y, *rgb_c.get_pixel(x, y));
                }
            }
            current_y += h + gap;
        }

        DynamicImage::ImageRgb8(composite)
    }

    pub fn save_crop<P: AsRef<Path>>(crop: &DynamicImage, output_path: P) -> Result<()> {
        if let Some(parent) = output_path.as_ref().parent() {
            std::fs::create_dir_all(parent)?;
        }
        crop.save(output_path.as_ref())
            .with_context(|| format!("Failed to save crop at {:?}", output_path.as_ref()))?;
        Ok(())
    }
}
