# Buster Suite

Buster is a high-performance, canvas-rendered IDE built from scratch with Tauri, Rust, and SolidJS. This monorepo contains the IDE itself, its marketing website, and the supporting libraries being built to bring Buster from alpha to production readiness.

## What is Buster?

Buster is a desktop code editor that renders everything — the editor, terminal, UI chrome, and all text — directly on an HTML Canvas instead of using the DOM. The result is an 11 MB installer that launches instantly and stays responsive on large files.

### Core Features

- **Canvas-rendered editor** with Tree-sitter syntax highlighting (100+ languages), code folding, minimap, multi-cursor editing, find/replace with regex, AI ghost text completions, and large file streaming (50 MB+)
- **Full terminal emulator** with real PTY support, sixel image rendering, and configurable themes — runs NeoVim, htop, tmux, and anything else you'd run in a native terminal
- **Integrated AI agent** supporting Claude (Sonnet 4.6, Opus 4.6, Haiku 4.5), Ollama (local), Codex (OpenAI), and Gemini (Google) — reads files, writes code, searches the codebase, and runs commands with user approval and configurable rate limits
- **Git & GitHub** with 30 built-in commands, a visual commit graph with colored lanes, blame overlay, diff gutters, staging, conflict resolution, remote management, and GitHub PR/issue browsing via gh CLI
- **LSP support** for Rust, TypeScript/JavaScript, Python, and Go — autocomplete, hover, diagnostics, go-to-definition, rename refactoring, find all references, and a diagnostics panel
- **DAP-based debugger** with breakpoints, stepping, stack frames, and variable inspection
- **WASM-sandboxed extensions** with capability-based permissions and custom UI surfaces
- **Quick Open** (Cmd+P) with fuzzy search and prefix modes for commands, line numbers, symbols, and search
- **Multiple layout modes** — Tabs, Columns, Grid, Trio, Quint, Rerack, and HQ (3x2 grid)
- **Session restore** that auto-saves every 30 seconds and reopens your workspace exactly as you left it

### Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 |
| Backend | Rust |
| Frontend | SolidJS + TypeScript |
| Rendering | HTML5 Canvas |
| Syntax highlighting | Tree-sitter (native Rust) |
| Text measurement | Pretext (600x faster than DOM layout) |
| Terminal parsing | vt100 crate + portable-pty |
| Extensions | wasmtime (WASM sandbox) |
| AI | Claude API + Ollama + Codex + Gemini |
| Theme | Catppuccin Mocha |
| Editor font | JetBrains Mono |

## Repository Structure

```
buster-suite/
├── buster/                 The IDE — Tauri + Rust + SolidJS
├── buster-website/         Marketing landing page (also canvas-rendered)
├── buster-path/            Cross-platform path utilities
├── buster-sandbox/         Allowlist-based command execution sandbox
├── buster-test-harness/    End-to-end IDE test framework
├── buster-lsp-manager/     LSP lifecycle, incremental sync, crash recovery
├── buster-syntax/          Incremental Tree-sitter parsing
├── buster-ext-template/    Extension SDK, CLI tooling, and starter kit
├── buster-dap/             Debug adapter management and event forwarding
├── buster-terminal-pro/    Terminal hardening — themes, sixel, search, scrollback
├── buster-remote/          Remote development via async SSH
├── buster-collab-server/   Real-time collaboration sync server (CRDT-based)
└── supporting-projects.md  Full roadmap of supporting libraries
```

### buster/

The IDE itself. A Tauri v2 application with a Rust backend handling file I/O, git operations, LSP communication, terminal management, AI agent execution, and extension hosting. The frontend is SolidJS rendering to canvas.

### buster-website/

The marketing and landing page for Buster. Built with Vite and SolidJS, it is itself a pure canvas application — no DOM text nodes. Features a particle system, scroll-based animations, and procedural rendering of all page sections.

### buster-path/

**TypeScript library — Bun runtime, Vite bundler**

Cross-platform path utilities that replace manual string splitting and slash manipulation scattered across the IDE's frontend. The Buster codebase currently has ~10 files doing raw `path.split("/")` and string concatenation for file paths, which breaks on Windows backslashes, drive letters, UNC paths, and spaces.

This library provides:
- **Path normalization** — forward/back slash conversion, `.` and `..` resolution, drive letter handling, UNC path support
- **`file://` URI encoding/decoding** — proper percent-encoding for spaces, `#`, `%`, and non-ASCII characters (critical for LSP communication)
- **Platform-aware comparison** — case-insensitive on macOS/Windows, case-sensitive on Linux
- **Workspace-relative paths** — converts absolute paths to project-relative display paths for tabs, sidebar, and breadcrumbs
- **Breadcrumb generation** — produces `{ label, path }` segments for the editor breadcrumb bar
- **Git path conversion** — translates between OS-native paths and git's always-forward-slash format

54 tests. Builds to 3.75 KB (ESM).

### buster-sandbox/

**Rust crate**

Replaces the IDE's current command execution model. Both independent code reviews flagged the existing blocklist-based approach as the single biggest security liability — it uses `sh -c` with substring matching on a deny list, which is trivially bypassable with shell escapes, aliases, or path manipulation.

This crate implements an allowlist-based execution model:
- **Nothing runs unless explicitly allowed** — programs must be on the allowlist and resolved via a restricted PATH
- **Direct process spawning** — no `sh -c`, no shell interpretation, no injection surface
- **Workspace containment** — working directory must be within the workspace root (verified via canonicalization)
- **Argument inspection** — blocks common shell injection patterns in arguments as a defense-in-depth measure
- **Resource limits** — configurable timeout (enforced via `try_wait` polling), memory caps, and output size truncation
- **Clean error messages** — callers (AI agent, extensions) get specific reasons for denials, not generic "permission denied"

Integrates as a single crate dependency, replacing `execute_command()` in `ai/tools.rs` and `host_run_command` in `extensions/runtime.rs`.

9 tests.

### buster-test-harness/

**TypeScript library — Bun runtime, Vite bundler**

End-to-end test framework for verifying real IDE workflows. The IDE has unit tests for individual components, but no integration or E2E tests that verify workflows like "open a folder, edit a file, save it, check git status." This harness provides the foundation for that.

Components:
- **Workspace fixtures** — create isolated temp directories seeded with file trees, run tests against them, clean up afterward. Supports nested directory structures and automatic intermediate directory creation.
- **Process runner** — launches commands using Bun's `spawn` API (direct execution, no shell), captures stdout/stderr, enforces timeouts, tracks wall-clock duration. Provides both `run()` (returns result) and `runExpectSuccess()` (throws on non-zero exit).
- **IDE assertion helpers** — `assertFileContains`, `assertFileEquals`, `assertFileExists`, `assertFileNotExists`, `assertGitStatus` (detects modified/untracked/added/deleted/clean), `assertCompletesWithin` (performance regression testing).

20 tests. Builds to 3.38 KB (ESM).

## The Supporting Projects Roadmap

The full roadmap for production readiness is documented in [`supporting-projects.md`](supporting-projects.md). It defines 10 standalone projects organized into priority tiers:

### Tier A — Ship Blockers (must exist before any public release)

| Project | Status | Purpose |
|---|---|---|
| buster-path | Built | Cross-platform path correctness |
| buster-sandbox | Built | Secure command execution |
| buster-test-harness | Built | E2E test coverage |

### Tier B — Core Quality (needed for daily-driver reliability)

| Project | Status | Purpose |
|---|---|---|
| buster-lsp-manager | Built | Incremental LSP sync, crash recovery, server auto-install |
| buster-syntax | Built | Incremental Tree-sitter parsing (reparse only changed ranges) |
| buster-ext-template | Built | Extension SDK, CLI tooling, and starter kit |

### Tier C — Feature Completion (needed for competitive positioning)

| Project | Status | Purpose |
|---|---|---|
| buster-dap | Built | Debug adapter management, event forwarding, launch configs |
| buster-terminal-pro | Built | Terminal hardening — themes, image protocols, crash recovery |
| buster-remote | Built | Remote development via async SSH |

### Tier D — Differentiation

| Project | Status | Purpose |
|---|---|---|
| buster-collab-server | Built | Real-time collaboration sync server (CRDT-based) |

### Dependency Cascade

These projects are not independent. The integration order matters:

```
buster-path (no dependencies) ✅
    ├── buster-sandbox (needs path validation) ✅
    │       └── buster-ext-template (SDK wraps sandboxed execution) ✅
    ├── buster-lsp-manager (needs proper URI encoding) ✅
    │       └── buster-remote (remote LSP bridge) ✅
    └── buster-syntax (shares "edit range" prerequisite with LSP) ✅

buster-dap (independent) ✅
buster-terminal-pro (independent) ✅
buster-collab-server (independent, but integration touches editor core) ✅
buster-test-harness (wraps everything — grows continuously) ✅
```

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) (v18+)
- [Bun](https://bun.sh/) (v1.0+)
- [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform

### Running the IDE

```bash
git clone https://github.com/hightowerbuilds/buster-suite.git
cd buster-suite/buster
npm install
npm run tauri dev
```

### Running the supporting library tests

```bash
# buster-path (TypeScript)
cd buster-path
bun install
bun test

# buster-sandbox (Rust)
cd buster-sandbox
cargo test

# buster-test-harness (TypeScript)
cd buster-test-harness
bun install
bun test
```

### Building the supporting libraries

```bash
# TypeScript libraries (outputs to dist/)
cd buster-path && bun run build
cd buster-test-harness && bun run build

# Rust crate
cd buster-sandbox && cargo build --release
```

## Historical Repositories

This monorepo was consolidated from standalone repositories. Their full git histories are preserved at:

- [hightowerbuilds/buster](https://github.com/hightowerbuilds/buster) — IDE history
- [hightowerbuilds/buster-website](https://github.com/hightowerbuilds/buster-website) — Website history

## License

All rights reserved. License TBD.
