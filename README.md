<p align="center">
  <img src="website/assets/icons/icon-light.png" alt="TakeMock Logo" width="128" height="128" style="border-radius: 28px; box-shadow: 0 8px 30px rgba(0,0,0,0.25);" />
</p>

<h1 align="center">TakeMock</h1>

<p align="center">
  <strong>A focused, high-performance, local-first mock examination suite for macOS.</strong><br>
  Built with Tauri v2, Rust & React 19. Complete NTA CBT simulation, KaTeX equation rendering, zero cloud latency, and native macOS aesthetics.
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
  <a href="#-quick-download">Download .dmg</a> •
  <a href="https://ashutosh-repos.github.io/takemock/">Official Website</a> •
  <a href="#-features">Features</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-development-setup">Development</a> •
  <a href="#-gatekeeper-notice">Gatekeeper Notice</a>
</p>

---

## 🎯 Why TakeMock?

Most existing exam preparation platforms are web portals burdened with ads, network lag, intrusive tracking, and unreliable formula rendering. When taking a high-stakes competitive examination (JEE Advanced, NEET, GATE, Olympiads), candidates need **uncompromising speed, zero distraction, and realistic exam conditions**.

**TakeMock** brings the authentic Computer-Based Test (CBT) engine directly to your desktop as a native macOS application:
- **100% Local-First & Offline**: All questions, exams, sessions, and analytics live exclusively in your local IndexedDB. No accounts, no subscriptions, zero servers, zero telemetry.
- **Native macOS Experience**: Features adaptive UnderWindowBackground vibrancy, native Cocoa AppKit menus, and dynamic macOS 26 Tahoe icon switching (Light, Dark, Clear, Tinted).
- **Sub-millisecond Question Flipping**: Written in modern React 19 + TypeScript on Tauri v2 with instant hotkeys.
- **LaTeX Math Formula Rendering**: Full KaTeX mathematical notation with zero blurry pixelation on Retina screens.

---

## 📥 Quick Download

| Platform | Architecture | Installer | Size | SHA-256 Checksum |
|---|---|---|---|---|
| macOS 10.15 to macOS 26+ | **Apple Silicon (aarch64)** | [**TakeMock_0.1.0_aarch64.dmg**](https://github.com/Ashutosh-Repos/takemock/releases/download/v0.1.0/TakeMock_0.1.0_aarch64.dmg) | `9.2 MB` | `1dc61f3616cf5f843f36d28a8efb3f283ee21092ce755a5b905ec162655e6519` |

> [!TIP]
> Visit the [Official TakeMock Website](https://ashutosh-repos.github.io/takemock/) for an interactive simulator and detailed documentation.

---

## ✨ Features

### 1. Authentic Computer-Based Test (CBT) Engine
- **Standard 5-State Question Palette**:
  - 🟢 **Answered**: Marked green with recorded selection.
  - 🔴 **Not Answered**: Visited but left unanswered.
  - 🟣 **Marked for Review**: Flushed for later inspection.
  - 🟣🟢 **Answered & Marked for Review**: Evaluated according to standard exam grading protocols.
  - ⚪ **Not Visited**: Unseen questions.
- **Multi-Section Exams**: Seamlessly switch between sections (Physics, Chemistry, Mathematics, etc.) with independent timers and scoring schemes.
- **Negative Marking Support**: Configurable marking criteria (+4 / -1, +3 / -1, or custom).

### 2. Rich KaTeX Mathematical Formula Rendering
- Mathematical formulas, chemical equations, integrals, matrices, fractions, and symbols rendered directly using KaTeX and Markdown.
- High-contrast, sharp vector rendering optimized for high-density Retina displays.

### 3. Mistake Vault & Performance Analytics
- Automatically captures incorrect answers, skipped questions, and time spent per question.
- Visual subject accuracy graphs, score breakdown, and mistake analysis.
- Question bookmarking and targeted re-drill modes.

### 4. Visual Paper Builder & Question Pack Ecosystem
- Create custom mock exams in minutes using the built-in Paper Builder.
- Export and import modular question packs using clean, open JSON schemas.

### 5. Native macOS Desktop Integration
- **Adaptive Vibrancy**: Translucent `UnderWindowBackground` vibrancy following system active states.
- **macOS Tahoe / Sequoia Icon Switching**:
  - `Default`: Crisp Light stopwatch icon.
  - `Dark`: Deep Navy Dark stopwatch icon.
  - `Clear`: System Liquid Glass translucency automatically applied over the default icon.
  - `Tinted`: System accent color applied automatically.
- **Keyboard Shortcuts**:
  - <kbd>Cmd+1</kbd> / <kbd>Cmd+2</kbd>: Section / Page Navigation
  - <kbd>Cmd+B</kbd>: Toggle Sidebar
  - <kbd>Arrow Keys</kbd>: Next / Previous question
  - <kbd>Cmd+N</kbd>: New Paper

---

## 🏗️ Architecture

TakeMock uses a lean, modern desktop architecture combining Rust and modern Web technologies:

```text
TakeMock Architecture
┌────────────────────────────────────────────────────────┐
│                      macOS AppKit                      │
│     (Window Vibrancy, Native Menus, Dock Icon Sync)     │
└───────────────────────────▲────────────────────────────┘
                            │ (objc2 Cocoa FFI)
┌───────────────────────────┴────────────────────────────┐
│                    Tauri v2 (Rust)                     │
│    (Core Runtime, Event Loops, Binary Packaging)      │
└───────────────────────────▲────────────────────────────┘
                            │ (High-Speed IPC)
┌───────────────────────────┴────────────────────────────┐
│                React 19 + TypeScript                   │
│        (Base UI, Tailwind CSS, KaTeX Typesetting)      │
└───────────────────────────▲────────────────────────────┘
                            │
┌───────────────────────────┴────────────────────────────┐
│                IndexedDB Local Storage                 │
│         (Exams, Question Packs, Attempts, Vault)       │
└────────────────────────────────────────────────────────┘
```

---

## 🛡️ macOS Gatekeeper Notice

Because TakeMock is an open-source community release distributed independently without an Apple Developer Paid Subscription ($99/year), macOS may display an *"App cannot be opened because it is from an unidentified developer"* warning on first launch.

### How to Open:
1. Drag `TakeMock.app` to your `/Applications` folder.
2. **Right-click (or Control-click)** `TakeMock.app` in `/Applications` and select **Open**.
3. Click **Open** in the dialog.

Alternatively, remove the quarantine attribute via Terminal:
```bash
xattr -cr /Applications/TakeMock.app
```

---

## 💻 Development Setup

### Prerequisites
- macOS 10.15+ (Apple Silicon recommended)
- [Node.js](https://nodejs.org/) (v20+)
- [pnpm](https://pnpm.io/) (v9+)
- [Rust](https://rustup.rs/) (v1.77+)
- Xcode Command Line Tools (`xcode-select --install`)

### 1. Clone & Install
```bash
git clone https://github.com/Ashutosh-Repos/takemock.git
cd takemock
pnpm install
```

### 2. Start Development Server
```bash
# Starts Vite dev server + Tauri macOS native window with instant HMR
pnpm tauri dev
```

### 3. Build Production DMG
```bash
pnpm tauri build
```
The compiled application and `.dmg` will be placed in:
- `src-tauri/target/release/bundle/macos/TakeMock.app`
- `src-tauri/target/release/bundle/dmg/TakeMock_0.1.0_aarch64.dmg`

---

## 📦 Question Pack JSON Specification

TakeMock supports importing question packs in standard JSON:

```json
{
  "title": "Sample JEE Advanced Drill",
  "subject": "Physics",
  "durationMinutes": 60,
  "sections": [
    {
      "name": "Section A",
      "markingScheme": { "correct": 4, "incorrect": -1 },
      "questions": [
        {
          "id": "q1",
          "text": "A particle moves under potential $V(r) = -k/r$. The total energy is:",
          "options": [
            { "id": "opt1", "text": "$E < 0$ forms an elliptical orbit" },
            { "id": "opt2", "text": "$E = 0$ is a circular orbit" },
            { "id": "opt3", "text": "$E > 0$ gives closed periodic orbit" },
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

## 🗺️ Project Structure

```text
takemock/
├── src/                    # Frontend React 19 Application
│   ├── components/         # Shared UI, CBT Palettes, MathRenderer, Modals
│   ├── core/               # Exam Engine, Timer, Scoring, Question Importers
│   ├── pages/              # Library, ActiveExam, Practice, MistakeVault, Builder
│   ├── index.css           # Global Tailwind & Design System tokens
│   └── main.tsx            # React application root
├── src-tauri/              # Rust Native Backend
│   ├── icons/              # Multi-resolution PNGs, ICNS, and source icons
│   ├── src/
│   │   ├── lib.rs          # Window Vibrancy, Menus, Setup Hooks
│   │   ├── macos_icon.rs   # Native AppKit Cocoa Icon Appearance Sync
│   │   └── main.rs         # Tauri Entry Point
│   ├── Info.plist          # Custom macOS bundle metadata
│   └── tauri.conf.json     # Tauri v2 bundle configuration
├── website/                # Standalone Official Landing Page (HTML/CSS/HTMX)
├── .github/workflows/      # Automated CI/CD Release Pipeline
└── package.json            # Scripts & Dependencies
```

---

## 📄 License

TakeMock is open-source software licensed under the [MIT License](LICENSE).

## 👤 Author

Crafted by **Ashutosh** ([@Ashutosh-Repos](https://github.com/Ashutosh-Repos)).
Contributions, bug reports, and feature suggestions are welcome!
