# `document-intelligence-cli` (`die-cli`)

Diagnostic command-line runner, empirical benchmark harness, and batch conversion tool for the TakeMock Academic Document Intelligence Engine (ADIE).

## Quick Start

```bash
# Build release binary
cargo build --release -p document-intelligence-cli

# Pre-flight camera image check
./target/release/die-cli triage --image path/to/page.jpg

# Ingest and export in one step
./target/release/die-cli process --images path/to/page1.jpg path/to/page2.jpg -o exam.yaml

# Run 100-page empirical benchmark
./target/release/die-cli benchmark --pages 100
```

## Detailed Documentation

For full end-user workflows, parameter references, developer architectural internals, and Schema v3.0 specs, refer to:

👉 [**Complete CLI Guide (`CLI_GUIDE.md`)**](../../CLI_GUIDE.md)
