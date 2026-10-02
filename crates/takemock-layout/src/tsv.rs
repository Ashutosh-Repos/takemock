use anyhow::Result;
use std::process::Command;
use takemock_core::PixelRect;

#[derive(Debug, Clone)]
pub struct TsvWord {
    pub rect: PixelRect,
    pub conf: f32,
    pub text: String,
}

#[derive(Debug, Clone)]
pub struct TsvLine {
    pub rect: PixelRect,
    pub words: Vec<TsvWord>,
    pub text: String,
}

#[derive(Debug, Clone)]
pub struct TsvBlock {
    pub block_num: u32,
    pub rect: PixelRect,
    pub lines: Vec<TsvLine>,
    pub text: String,
}

pub struct TsvParser;

impl TsvParser {
    pub fn parse_image(image_path: &std::path::Path) -> Result<Vec<TsvBlock>> {
        let output = Command::new("tesseract")
            .arg(image_path)
            .arg("stdout")
            .arg("--psm")
            .arg("3")
            .arg("tsv")
            .output()?;

        let tsv_str = String::from_utf8_lossy(&output.stdout);
        Self::parse_tsv_string(&tsv_str)
    }

    pub fn parse_tsv_string(tsv_str: &str) -> Result<Vec<TsvBlock>> {
        let mut blocks: Vec<TsvBlock> = Vec::new();
        let mut lines = tsv_str.lines();

        // Skip header: level page_num block_num par_num line_num word_num left top width height conf text
        let _ = lines.next();

        let mut current_block: Option<TsvBlock> = None;
        let mut current_line: Option<TsvLine> = None;

        for line in lines {
            let cols: Vec<&str> = line.split('\t').collect();
            if cols.len() < 12 {
                continue;
            }

            let level: u32 = cols[0].parse().unwrap_or(0);
            let block_num: u32 = cols[2].parse().unwrap_or(0);
            let left: u32 = cols[6].parse().unwrap_or(0);
            let top: u32 = cols[7].parse().unwrap_or(0);
            let width: u32 = cols[8].parse().unwrap_or(0);
            let height: u32 = cols[9].parse().unwrap_or(0);
            let conf: f32 = cols[10].parse().unwrap_or(0.0);
            let text = cols[11].trim().to_string();

            let rect = PixelRect {
                x: left,
                y: top,
                width,
                height,
            };

            match level {
                2 => {
                    // Block level
                    if let Some(mut b) = current_block.take() {
                        if let Some(l) = current_line.take() {
                            b.lines.push(l);
                        }
                        if !b.lines.is_empty() {
                            blocks.push(b);
                        }
                    }
                    current_block = Some(TsvBlock {
                        block_num,
                        rect,
                        lines: Vec::new(),
                        text: String::new(),
                    });
                }
                4 => {
                    // Line level
                    if let Some(ref mut b) = current_block {
                        if let Some(l) = current_line.take() {
                            b.lines.push(l);
                        }
                        current_line = Some(TsvLine {
                            rect,
                            words: Vec::new(),
                            text: String::new(),
                        });
                    }
                }
                5 => {
                    // Word level
                    if !text.is_empty() {
                        let word = TsvWord { rect, conf, text };
                        if let Some(ref mut l) = current_line {
                            if !l.text.is_empty() {
                                l.text.push(' ');
                            }
                            l.text.push_str(&word.text);
                            l.words.push(word);
                        }
                    }
                }
                _ => {}
            }
        }

        if let Some(mut b) = current_block.take() {
            if let Some(l) = current_line.take() {
                b.lines.push(l);
            }
            if !b.lines.is_empty() {
                blocks.push(b);
            }
        }

        // Aggregate text for each block
        for b in &mut blocks {
            let mut full = String::new();
            for l in &b.lines {
                if !full.is_empty() {
                    full.push('\n');
                }
                full.push_str(&l.text);
            }
            b.text = full;
        }

        Ok(blocks)
    }
}
