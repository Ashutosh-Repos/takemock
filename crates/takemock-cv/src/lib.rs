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

    pub fn split_columns(img: &DynamicImage) -> Vec<(DynamicImage, PixelRect)> {
        let (w, h) = img.dimensions();
        // If image is taller than it is wide (portrait exam page), check for 2-column layout
        if h > w && w > 1000 {
            let mid = w / 2;
            let left_rect = PixelRect { x: 0, y: 0, width: mid, height: h };
            let right_rect = PixelRect { x: mid, y: 0, width: w - mid, height: h };

            let left_col = img.crop_imm(0, 0, mid, h);
            let right_col = img.crop_imm(mid, 0, w - mid, h);

            vec![(left_col, left_rect), (right_col, right_rect)]
        } else {
            let full_rect = PixelRect { x: 0, y: 0, width: w, height: h };
            vec![(img.clone(), full_rect)]
        }
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
