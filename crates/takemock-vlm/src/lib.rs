use anyhow::Result;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::Command;
use takemock_core::{OptionItem, QuestionType};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VlmCropResult {
    pub question_text: String,
    pub math_latex: Option<String>,
    pub question_type: QuestionType,
    pub options: Vec<OptionItem>,
    pub has_diagram: bool,
}

pub struct VlmRunner {
    model_path: PathBuf,
    mmproj_path: PathBuf,
}

impl VlmRunner {
    pub fn new<P: AsRef<Path>, Q: AsRef<Path>>(model_path: P, mmproj_path: Q) -> Self {
        Self {
            model_path: model_path.as_ref().to_path_buf(),
            mmproj_path: mmproj_path.as_ref().to_path_buf(),
        }
    }

    pub fn is_available(&self) -> bool {
        self.model_path.exists() && self.mmproj_path.exists()
    }

    /// Invokes llama-cli with Metal acceleration on the high-res crop in non-interactive batch mode.
    pub fn infer_crop(&self, crop_path: &Path) -> Result<VlmCropResult> {
        if !self.is_available() {
            anyhow::bail!("VLM models not found at {:?} or {:?}", self.model_path, self.mmproj_path);
        }

        // Ensure image format is readable by llama-cli (convert webp to temp jpeg if needed)
        let temp_dir = std::env::temp_dir();
        let target_img_path = if let Some(ext) = crop_path.extension().and_then(|s| s.to_str()) {
            if ext.eq_ignore_ascii_case("webp") {
                let temp_jpeg = temp_dir.join(format!("vlm_input_{}.jpg", uuid::Uuid::new_v4()));
                let img = image::open(crop_path)?;
                img.save_with_format(&temp_jpeg, image::ImageFormat::Jpeg)?;
                temp_jpeg
            } else {
                crop_path.to_path_buf()
            }
        } else {
            crop_path.to_path_buf()
        };

        let prompt = "Extract the complete question text and all options. Format options as (A) text, (B) text, (C) text, (D) text. Use LaTeX $...$ for formulas.";

        let output = Command::new("llama-cli")
            .arg("-m")
            .arg(&self.model_path)
            .arg("--mmproj")
            .arg(&self.mmproj_path)
            .arg("--image")
            .arg(&target_img_path)
            .arg("-p")
            .arg(prompt)
            .arg("-n")
            .arg("256")
            .arg("-ngl")
            .arg("99")
            .arg("--simple-io")
            .arg("--single-turn")
            .arg("--no-warmup")
            .stdin(std::process::Stdio::null())
            .output()?;

        if target_img_path != crop_path {
            let _ = std::fs::remove_file(&target_img_path);
        }

        let raw_stdout = String::from_utf8_lossy(&output.stdout);
        Self::parse_vlm_output(&raw_stdout)
    }

    /// Robust option parser handling vertical stacks, inline options: (a) 3 (b) 4 (c) 5 (d) 6, 2x2 grids, and numbered options (1)-(4).
    pub fn parse_text_options(raw_text: &str) -> (String, Vec<OptionItem>) {
        // 1. Check for alphabetical options: (A), (B), (C), (D) or A., B., C., D.
        let opt_pat = Regex::new(r"(?i)(?:^|\s+)[\(\[]?([A-D])[\)\]\.]\s+").unwrap();
        let matches: Vec<_> = opt_pat.find_iter(raw_text).collect();

        if matches.len() >= 2 {
            let labels: Vec<String> = matches.iter()
                .map(|m| {
                    m.as_str()
                        .chars()
                        .find(|c| c.is_ascii_alphabetic())
                        .unwrap_or('A')
                        .to_ascii_uppercase()
                        .to_string()
                })
                .collect();

            // Must start with 'A' to be a valid option set
            if labels[0] == "A" {
                let question_statement = raw_text[..matches[0].start()].trim().to_string();
                let mut options = Vec::new();

                for i in 0..matches.len() {
                    let start = matches[i].end();
                    let end = if i + 1 < matches.len() {
                        matches[i + 1].start()
                    } else {
                        raw_text.len()
                    };

                    let label = labels[i].clone();
                    let option_text = raw_text[start..end].trim().to_string();

                    options.push(OptionItem {
                        id: format!("opt-{}", label),
                        label,
                        text: option_text,
                        math_latex: None,
                        visual_asset_crop: None,
                    });
                }

                return (question_statement, options);
            }
        }

        // 2. Check for numbered inline options: (1), (2), (3), (4)
        let num_opt_pat = Regex::new(r"(?:^|\s+)[\(\[]?([1-4])[\)\]\.]\s+").unwrap();
        let num_matches: Vec<_> = num_opt_pat.find_iter(raw_text).collect();

        if num_matches.len() >= 2 {
            let num_labels: Vec<u32> = num_matches.iter()
                .filter_map(|m| {
                    m.as_str().chars().find(|c| c.is_ascii_digit()).and_then(|c| c.to_digit(10))
                })
                .collect();

            if num_labels.first() == Some(&1) && num_labels.get(1) == Some(&2) {
                let question_statement = raw_text[..num_matches[0].start()].trim().to_string();
                let mut options = Vec::new();

                for i in 0..num_matches.len() {
                    let start = num_matches[i].end();
                    let end = if i + 1 < num_matches.len() {
                        num_matches[i + 1].start()
                    } else {
                        raw_text.len()
                    };

                    let letter_label = match num_labels[i] {
                        1 => "A",
                        2 => "B",
                        3 => "C",
                        4 => "D",
                        _ => "A",
                    }.to_string();

                    let option_text = raw_text[start..end].trim().to_string();

                    options.push(OptionItem {
                        id: format!("opt-{}", letter_label),
                        label: letter_label,
                        text: option_text,
                        math_latex: None,
                        visual_asset_crop: None,
                    });
                }

                return (question_statement, options);
            }
        }

        // 3. Fallback: Check standard line-by-line options (A-D)
        let line_opt_re = Regex::new(r"(?m)^\s*[\(\[]?([A-Da-d])[\)\]\.]\s+(.+)$").unwrap();
        let mut options = Vec::new();
        let mut question_lines = Vec::new();

        for line in raw_text.lines() {
            if let Some(caps) = line_opt_re.captures(line) {
                let label = caps[1].to_uppercase();
                let text = caps[2].trim().to_string();
                options.push(OptionItem {
                    id: format!("opt-{}", label),
                    label,
                    text,
                    math_latex: None,
                    visual_asset_crop: None,
                });
            } else {
                question_lines.push(line);
            }
        }

        if options.len() >= 2 && options[0].label == "A" {
            return (question_lines.join("\n").trim().to_string(), options);
        }

        // 4. Fallback: Check line-by-line numbered options (1-4)
        let line_num_opt_re = Regex::new(r"(?m)^\s*[\(\[]?([1-4])[\)\]\.]\s+(.+)$").unwrap();
        let mut num_options = Vec::new();
        let mut num_question_lines = Vec::new();

        for line in raw_text.lines() {
            if let Some(caps) = line_num_opt_re.captures(line) {
                let digit: u32 = caps[1].parse().unwrap_or(0);
                let letter_label = match digit {
                    1 => "A",
                    2 => "B",
                    3 => "C",
                    4 => "D",
                    _ => "A",
                }.to_string();
                let text = caps[2].trim().to_string();
                num_options.push(OptionItem {
                    id: format!("opt-{}", letter_label),
                    label: letter_label,
                    text,
                    math_latex: None,
                    visual_asset_crop: None,
                });
            } else {
                num_question_lines.push(line);
            }
        }

        if num_options.len() >= 2 && num_options[0].label == "A" {
            return (num_question_lines.join("\n").trim().to_string(), num_options);
        }

        // No valid multi-option set found; retain full text as question statement
        (raw_text.trim().to_string(), Vec::new())
    }

    fn parse_vlm_output(output: &str) -> Result<VlmCropResult> {
        // Strip out llama-cli prompt echo and banner
        let prompt_marker = "for formulas.";
        let model_response = if let Some(idx) = output.find(prompt_marker) {
            &output[idx + prompt_marker.len()..]
        } else if let Some(idx) = output.find('>') {
            &output[idx + 1..]
        } else {
            output
        };

        // Strip out exit / performance footer
        let clean_text = if let Some(idx) = model_response.find("[ Prompt:") {
            &model_response[..idx]
        } else if let Some(idx) = model_response.find("Exiting...") {
            &model_response[..idx]
        } else {
            model_response
        }.trim();

        let (q_text, opts) = Self::parse_text_options(clean_text);

        // Deduplicate options if any prompt artifacts slipped in
        let mut final_opts = Vec::new();
        let mut seen_labels = std::collections::HashSet::new();
        for opt in opts.into_iter().rev() {
            if opt.text.trim().to_lowercase() != "text," && !opt.text.trim().to_lowercase().starts_with("text.") {
                if seen_labels.insert(opt.label.clone()) {
                    final_opts.push(opt);
                }
            }
        }
        final_opts.reverse();

        // Check if LaTeX math was extracted
        let math_latex = if q_text.contains('$') {
            Some(q_text.clone())
        } else {
            None
        };

        Ok(VlmCropResult {
            question_text: q_text,
            math_latex,
            question_type: if final_opts.is_empty() { QuestionType::Nat } else { QuestionType::Mcq },
            options: final_opts,
            has_diagram: false,
        })
    }
}
