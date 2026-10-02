<p align="center">
  <img src="website/assets/icons/icon-light.png" alt="TakeMock Icon" width="96" height="96" style="border-radius: 22px;" />
</p>

<h1 align="center">TakeMock</h1>

<p align="center">
  Offline desktop mock test simulator for macOS.
</p>

<p align="center">
  <a href="https://github.com/Ashutosh-Repos/takemock/releases/latest"><img src="https://img.shields.io/github/v/release/Ashutosh-Repos/takemock?color=38bdf8&label=Release&style=flat-square" alt="GitHub release" /></a>
  <a href="https://github.com/Ashutosh-Repos/takemock/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" alt="License" /></a>
  <img src="https://img.shields.io/badge/Platform-macOS%2010.15%2B-000000.svg?style=flat-square&logo=apple" alt="macOS" />
  <img src="https://img.shields.io/badge/Arch-Apple%20Silicon%20(aarch64)-orange.svg?style=flat-square" alt="Apple Silicon" />
  <img src="https://img.shields.io/badge/Tauri-v2-24c8db.svg?style=flat-square&logo=tauri" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/Rust-1.77%2B-b7410e.svg?style=flat-square&logo=rust" alt="Rust" />
  <img src="https://img.shields.io/badge/React-19-61dafb.svg?style=flat-square&logo=react" alt="React 19" />
</p>

<p align="center">
  <a href="#download">Download</a> •
  <a href="https://ashutosh-repos.github.io/takemock/">Website</a> •
  <a href="#features">Features</a> •
  <a href="#document-intelligence-engine-cli">ADIE CLI</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#gatekeeper-on-macos">Gatekeeper Notice</a> •
  <a href="#development-setup">Development</a>
</p>

---

TakeMock replicates the computer-based test (CBT) interface used in Indian national entrance exams such as JEE and NEET. It renders equations using KaTeX, records responses in local IndexedDB storage, and runs completely offline.

## Why TakeMock

Web-based test portals often suffer from laggy question navigation, ads, and broken formula images. During timed preparation, students need an accurate simulation of exam conditions without interruptions or reliance on internet connectivity.

TakeMock addresses this as a standalone macOS desktop application:

- **Local-first data**: Questions, test sessions, and mistake logs are stored in IndexedDB on your Mac. No accounts, telemetry, or server round-trips.
- **Accurate CBT engine**: Implements the official 5-color question palette, negative marking rules, and section switching mechanics used by NTA.
- **Sharp typography**: Mathematical and chemical notation rendered through KaTeX directly to vector paths on Retina displays.
- **macOS integration**: Native Cocoa menu bar, window vibrancy, and dock icon synchronization that respects Light and Dark modes.

---

## Download

| Target | Architecture | Package | Size | SHA-256 Checksum |
|---|---|---|---|---|
| macOS 10.15+ | Apple Silicon (`aarch64`) | [TakeMock_0.1.1_aarch64.dmg](https://github.com/Ashutosh-Repos/takemock/releases/download/v0.1.1/TakeMock_0.1.1_aarch64.dmg) | 9.2 MB | `4aea4a9512677fa988b7db12942a5bebd779d571c88933229e1b6d082adedf85` |

You can also view all builds on the [Releases page](https://github.com/Ashutosh-Repos/takemock/releases).

---

## Features

### Computer-Based Test Engine
- **5-State Question Palette**:
  - Green: Answered
  - Red: Not answered
  - Purple: Marked for review
  - Purple with green badge: Answered and marked for review (included in evaluation)
  - Grey: Not visited
- **Multi-section timing**: Configurable section switches with independent timers for Physics, Chemistry, and Mathematics.
- **Configurable scoring**: Custom positive and negative marking schemes (such as +4 / -1 or +3 / -1).

### KaTeX Formula Rendering
- Full LaTeX math expressions, matrices, integrals, and chemical reaction notations.
- Rendered locally without loading remote images.

### Analytics and Mistake Vault
- Automatic logging of incorrect and unattempted questions per session.
- Per-subject accuracy metrics, time-per-question distribution, and question bookmarking.

### Paper Builder and JSON Packs
- Create tests locally with the built-in paper editor.
- Import and export question sets using standard JSON files.

### Desktop Controls & Navigation
- Keyboard shortcuts: `Cmd+,` for Settings, `Cmd+1`/`Cmd+2` for section switching, and arrow keys for question navigation.
- Native macOS application menus with standard shortcuts, window management, and full keyboard operation.

---

## Architecture

TakeMock uses Tauri v2 with a Rust backend and a React 19 frontend:

```text
┌────────────────────────────────────────────────────────┐
│                      macOS AppKit                      │
│     (Window Vibrancy, Native Menus, Dock Icon Sync)     │
└───────────────────────────▲────────────────────────────┘
                            │ (objc2 FFI)
┌───────────────────────────┴────────────────────────────┐
│                    Tauri v2 (Rust)                     │
│      (Core Runtime, Event Loops, Window Config)        │
└───────────────────────────▲────────────────────────────┘
                            │ (Local IPC)
┌───────────────────────────┴────────────────────────────┐
│                React 19 + TypeScript                   │
│      (Tailwind CSS, Base UI, KaTeX Typesetting)        │
└───────────────────────────▲────────────────────────────┘
                            │
┌───────────────────────────┴────────────────────────────┐
│                IndexedDB Local Storage                 │
│         (Exams, Question Packs, Attempts, Vault)       │
└────────────────────────────────────────────────────────┘
```

- **Tauri v2**: Wraps macOS WKWebView without shipping Chromium, keeping disk usage under 10 MB.
- **Rust backend**: Handles AppKit calls for icon updates and window properties.
- **Frontend**: Written in React 19 and TypeScript, using Tailwind CSS and Base UI primitives.
- **Storage**: IndexedDB inside the webview stores papers, logs, and answers locally.

---

## Gatekeeper on macOS

TakeMock is distributed as independent open-source software without an Apple Developer ID certificate. On first launch, macOS Gatekeeper may show a warning: *"TakeMock cannot be opened because it is from an unidentified developer."*

### How to open:
1. Drag `TakeMock.app` to `/Applications`.
2. Right-click (or Control-click) `TakeMock.app` and choose **Open**.
3. Click **Open** in the confirmation dialog.

Alternatively, clear the quarantine attribute in Terminal:
```bash
xattr -cr /Applications/TakeMock.app
```

---

## Document Intelligence Engine CLI

TakeMock includes a native on-device **Academic Document Intelligence Engine (ADIE)** written in Rust for converting paper question sheets and mock tests into Schema v3.0 YAML Frontmatter and TakeMock CBT JSON.

### Quick Commands

```bash
# Build the native CLI binary
cargo build --release -p document-intelligence-cli

# Pre-flight camera image check (< 12ms SIMD evaluation)
./target/release/die-cli triage --image path/to/page.jpg

# Ingest and export assessment photos in one step
./target/release/die-cli process --images page1.jpg page2.jpg -o exam.yaml

# Run 100-page empirical benchmark harness
./target/release/die-cli benchmark --pages 100
```

For complete command parameters, optical triage metric definitions, developer internals, and Schema v3.0 specs:

👉 **Read the [Complete CLI Guide (`CLI_GUIDE.md`)](CLI_GUIDE.md)**

---

## Development Setup

### Prerequisites
- macOS 10.15 or later
- Node.js 20+
- pnpm 9+
- Rust 1.77+
- Xcode Command Line Tools (`xcode-select --install`)

### Install dependencies
```bash
git clone https://github.com/Ashutosh-Repos/takemock.git
cd takemock
pnpm install
```

### Run locally
```bash
pnpm tauri dev
```

### Build DMG
```bash
pnpm tauri build
```
Output bundles:
- `src-tauri/target/release/bundle/macos/TakeMock.app`
- `src-tauri/target/release/bundle/dmg/TakeMock_0.1.1_aarch64.dmg`

---

## Question Pack Format

Question packs are plain JSON files. You can import or export them directly:

```json
{
  "title": "JEE Advanced Physics Drill",
  "subject": "Physics",
  "durationMinutes": 60,
  "sections": [
    {
      "name": "Section A",
      "markingScheme": { "correct": 4, "incorrect": -1 },
      "questions": [
        {
          "id": "q1",
          "text": "A particle moves under a central potential $V(r) = -k/r$. The total orbital energy $E$ satisfies:",
          "options": [
            { "id": "opt1", "text": "$E < 0$ forms a bound elliptical orbit" },
            { "id": "opt2", "text": "$E = 0$ results in a circular orbit" },
            { "id": "opt3", "text": "$E > 0$ gives a closed periodic trajectory" },
            { "id": "opt4", "text": "Angular momentum is not conserved" }
          ],
          "correctOptionId": "opt1",
          "explanation": "Bound Keplerian orbits in a central $1/r$ gravitational or Coulombic field require total energy $E < 0$."
        }
      ]
    }
  ]
}
```

---

## Project Structure

```text
takemock/
├── src/                    # Frontend application
│   ├── components/         # Question palette, KaTeX renderer, modal dialogs
│   ├── core/               # Exam state, timer, scoring, and import logic
│   ├── pages/              # Library, ActiveExam, Analytics, PaperBuilder
│   ├── index.css           # Design tokens and Tailwind base
│   └── main.tsx            # Application entry
├── src-tauri/              # Rust backend
│   ├── icons/              # Application icon assets (PNG and ICNS)
│   ├── src/
│   │   ├── lib.rs          # Window vibrancy and menu setup
│   │   ├── macos_icon.rs   # AppKit icon appearance observer
│   │   └── main.rs         # Tauri runtime entry
│   ├── Info.plist          # macOS bundle property list
│   └── tauri.conf.json     # Build and window configuration
├── website/                # Standalone landing page (HTML, CSS, HTMX)
├── .github/workflows/      # Release and GitHub Pages deployment actions
└── package.json            # Scripts and dependencies
```

---

## License

MIT License. See [LICENSE](LICENSE) for details.

## Author

Ashutosh ([@Ashutosh-Repos](https://github.com/Ashutosh-Repos)).
