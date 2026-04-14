# Contributing to Buster

Thanks for your interest in contributing to Buster!

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Bun](https://bun.sh/) (v1.0+)
- [Node.js](https://nodejs.org/) (v20+)
- Platform dependencies:
  - **macOS:** Xcode Command Line Tools
  - **Linux:** `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libgtk-3-dev`
  - **Windows:** Visual Studio Build Tools with C++ workload

### Setup

```bash
# Clone the repo
git clone https://github.com/hightowerbuilds/buster.git
cd buster

# Install frontend dependencies
bun install

# Build the local path package
cd packages/buster-path && bun install && bun run build && cd ../..

# Run in development mode
bun tauri dev
```

### Running Tests

```bash
# Frontend tests
bun run test

# Rust tests
cd src-tauri && cargo test

# Type checking
bunx tsc --noEmit
```

## Project Structure

```
buster/
  src/                    # Frontend (SolidJS + TypeScript)
    editor/               # Canvas-rendered code editor
    ui/                   # UI components (canvas chrome, panels)
    lib/                  # State management, IPC, utilities
    styles/               # CSS modules
  src-tauri/              # Backend (Rust + Tauri v2)
    src/                  # Main Tauri app, commands, modules
    crates/               # Internal Rust libraries
      dap/                # Debug Adapter Protocol
      lsp-manager/        # LSP client
      sandbox/            # Code execution sandbox
      syntax/             # Tree-sitter syntax highlighting
      terminal-pro/       # Terminal emulation
    defaults/             # Default config files (keymap.lua)
  packages/
    buster-path/          # Path utilities (local package)
```

## Code Style

- **TypeScript:** No explicit `any` types. Prefer `unknown` or proper generics.
- **Rust:** Follow `cargo clippy` recommendations. No `unwrap()` in production code.
- **CSS:** Use CSS variables from the theme system (`--accent`, `--bg-surface0`, etc.).
- **Canvas:** Static canvas elements use on-demand rendering (no `requestAnimationFrame` loops).
- **Font:** Courier New for all UI chrome. JetBrains Mono for the editor.

## Pull Requests

1. Fork and create a feature branch from `main`
2. Keep changes focused — one feature or fix per PR
3. Include tests for new functionality
4. Ensure `bun run test` and `cargo test` pass
5. Write a clear PR description

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
