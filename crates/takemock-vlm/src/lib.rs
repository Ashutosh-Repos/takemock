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

    /// Invokes llama-cli with Metal acceleration on the high-res crop.
    pub fn infer_crop(&self, crop_path: &Path) -> Result<VlmCropResult> {
        if !self.is_available() {
            anyhow::bail!("VLM models not found at {:?} or {:?}", self.model_path, self.mmproj_path);
        }

        let system_prompt = "You are a specialized exam parser. Extract the question and options in clean markdown and LaTeX ($...$). Return ONLY valid JSON in format: {\"questionText\": \"...\", \"options\": [{\"label\": \"A\", \"text\": \"...\"}], \"questionType\": \"MCQ\"}";

        let output = Command::new("llama-cli")
            .arg("-m")
            .arg(&self.model_path)
            .arg("--mmproj")
            .arg(&self.mmproj_path)
            .arg("--image")
            .arg(crop_path)
            .arg("-p")
            .arg(system_prompt)
            .arg("-n")
            .arg("512")
            .arg("-ngl")
            .arg("99")
            .arg("--no-warmup")
            .output()?;

        let raw_stdout = String::from_utf8_lossy(&output.stdout);
        Self::parse_vlm_output(&raw_stdout)
    }

    /// Fallback rule-based parser when running fast heuristic pass
    pub fn parse_text_options(raw_text: &str) -> (String, Vec<OptionItem>) {
        let opt_re = Regex::new(r"(?m)^\s*[\(\[]?([A-Da-d])[\)\]\.]\s+(.+)$").unwrap();
        let mut options = Vec::new();
        let mut question_lines = Vec::new();

        for line in raw_text.lines() {
            if let Some(caps) = opt_re.captures(line) {
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

        (question_lines.join("\n").trim().to_string(), options)
    }

    fn parse_vlm_output(output: &str) -> Result<VlmCropResult> {
        // Try parsing JSON block if present
        if let Some(start) = output.find('{') {
            if let Some(end) = output.rfind('}') {
                let json_slice = &output[start..=end];
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_slice) {
                    let q_text = parsed["questionText"].as_str().unwrap_or("").to_string();
                    let mut opts = Vec::new();
                    if let Some(arr) = parsed["options"].as_array() {
                        for o in arr {
                            let lbl = o["label"].as_str().unwrap_or("").to_string();
                            let txt = o["text"].as_str().unwrap_or("").to_string();
                            opts.push(OptionItem {
                                id: format!("opt-{}", lbl),
                                label: lbl,
                                text: txt,
                                math_latex: None,
                                visual_asset_crop: None,
                            });
                        }
                    }
                    return Ok(VlmCropResult {
                        question_text: q_text,
                        math_latex: None,
                        question_type: QuestionType::Mcq,
                        options: opts,
                        has_diagram: false,
                    });
                }
            }
        }

        let (q_text, opts) = Self::parse_text_options(output);
        Ok(VlmCropResult {
            question_text: q_text,
            math_latex: None,
            question_type: if opts.is_empty() { QuestionType::Nat } else { QuestionType::Mcq },
            options: opts,
            has_diagram: false,
        })
    }
}
