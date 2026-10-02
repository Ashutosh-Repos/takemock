//! Build script for Document Intelligence Engine C-ABI header generation.

use std::env;
use std::path::PathBuf;

fn main() {
    let crate_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
    let out_dir = PathBuf::from(&crate_dir).join("include");
    std::fs::create_dir_all(&out_dir).ok();

    let header_path = out_dir.join("document_intelligence_engine.h");

    if let Ok(config) = cbindgen::Config::from_file("cbindgen.toml") {
        if let Ok(bindings) = cbindgen::Builder::new()
            .with_crate(crate_dir)
            .with_config(config)
            .generate()
        {
            bindings.write_to_file(header_path);
        }
    }
}
