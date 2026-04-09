# Buster

A canvas-rendered IDE built from scratch with Tauri, Rust, and SolidJS.

Every character on screen — code, terminal, UI — is drawn on an HTML Canvas. No DOM text anywhere. The editor uses a TypeScript string[] buffer backed by SolidJS signals, Tree-sitter for syntax highlighting, and Pretext for text measurement. The terminal runs a real PTY through a VT100 parser in Rust and renders the cell grid on canvas. The whole app ships as an 11 MB installer.

## Install

### Prerequisites

- [Rust](https://rustup.rs/) (1.70+)
- [Bun](https://bun.sh/) (1.0+)
- On macOS: Xcode Command Line Tools (`xcode-select --install`)
- On Linux: see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

### Build from source

```bash
git clone https://github.com/hightowerbuilds/buster.git
cd buster
bun install
bun run tauri build
```

The built app will be at:
- macOS: `src-tauri/target/release/bundle/macos/Buster.app`
- macOS DMG: `src-tauri/target/release/bundle/dmg/Buster_0.1.0_x64.dmg`

### Development

```bash
bun run tauri dev
```

This starts the app with hot-reload for the frontend. Rust changes trigger an automatic rebuild.

## Usage

### Getting started

Open Buster. The welcome screen shows an ASCII particle animation. Press **Cmd+T** to take the guided tour, or open a folder from the sidebar to start editing.

### Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+S | Save |
| Cmd+Z | Undo |
| Cmd+Shift+Z | Redo |
| Cmd+F | Find / Replace |
| Cmd+P | Quick Open (fuzzy file search) |
| Cmd+Shift+P | Command Palette |
| Ctrl+G | Go to Line |
| Ctrl+` | New terminal tab |
| Cmd+L | AI Agent |
| Cmd+Shift+G | Git panel |
| Cmd+Shift+B | Git blame |
| Cmd+W | Close tab |
| Cmd+, | Settings |
| F8 / Shift+F8 | Next / Previous diagnostic |
| Cmd+T | Guided tour (on welcome screen) |
| Escape | Close overlays |

### Features

**Editor** — Canvas-rendered with a TypeScript string[] buffer (SolidJS signals). Syntax highlighting via Tree-sitter for JavaScript, TypeScript, TSX, Rust, Python, JSON, and CSS. Undo/redo with time-based grouping. Multi-cursor. Word wrap with display-row movement. Sticky column for vertical navigation. Mouse selection. Virtual scrolling. Blog mode for markdown files.

**Terminal** — Full terminal emulator rendered on canvas. VT100/ANSI parsing happens in Rust via the vt100 crate. Supports NeoVim, htop, tmux, and anything else that runs in a terminal. Mouse reporting, bracketed paste, scrollback history. Each terminal opens as a tab alongside your files.

**AI Agent** — Chat with Claude (Sonnet 4.6, Opus 4.6, Haiku 4.5) or local models directly in the IDE. The agent can read files, write code, search the codebase, and run commands in your workspace. State-changing tools require user approval. Model gallery with card-flip UI for browsing and queuing models. API keys stored securely per provider.

**Git Integration** — 28 built-in git commands with no terminal required. Status, staging, commit (with amend), push/pull/fetch, branches, stash, blame (Cmd+Shift+B overlay), diff gutter indicators, conflict detection, and a canvas-rendered commit graph with colored lanes.

**LSP** — Language server support for Rust (rust-analyzer), TypeScript/JavaScript (typescript-language-server), Python (pyright), and Go (gopls). Autocomplete, hover, signature help, code actions, inlay hints, go-to-definition, document symbols, and diagnostic squiggles.

**Quick Open** — Cmd+P opens a fuzzy file search across your workspace. Respects .gitignore. Prefix modes: `>` commands, `:` go-to-line, `@` symbols, `#` content search, `?` AI.

**Find & Replace** — Cmd+F with match highlighting, case sensitivity toggle, replace one or replace all.

**Layouts** — Panel layout modes: Tabs, Columns, Grid, Trio, Quint, Restack. Draggable dividers between panels.

**File Explorer** — Sidebar with lazy-loading directory tree. Respects .gitignore. Drag and drop files between folders. Right-click context menu with rename, delete, copy path.

**Session Restore** — Auto-saves every 30 seconds. Hot-exit on window close. Restores workspace, tabs, cursor positions, and dirty buffers on relaunch.

**Extensions** — WASM-sandboxed extensions with capability-based permissions. WebSocket gateway for persistent connections to external services.

**Guided Tour** — An 11-step canvas-animated tutorial that teaches every feature including git and AI integration. Each step assembles as ASCII particle text.

## Architecture

```
src/                          Frontend (TypeScript + SolidJS)
  editor/                     Canvas editor, engine, Tree-sitter bridge, LSP features
  ui/                         Sidebar, tabs, terminal, AI chat, git, command palette, tour
  lib/                        IPC bridge, TanStack Query, commands, menu handlers, session
  styles/                     CSS (Catppuccin Mocha theme)

src-tauri/src/                Backend (Rust)
  ai/                         Agent loop, tool execution, approval manager
  commands/                   IPC handlers (file, git, lsp, terminal, ai, extensions, session)
  extensions/                 WASM runtime, gateway, manifest
  lsp/                        Language server client, diagnostic forwarding
  syntax/                     Tree-sitter highlighting (7 languages)
  terminal/                   VT100 state (vt100 crate) + PTY (portable-pty)
  browser.rs                  Embedded webview management
  watcher.rs                  File change detection
  workspace.rs                Path validation + security boundary
```

### Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri v2 |
| Backend | Rust |
| Frontend framework | SolidJS |
| Data fetching | TanStack Solid Query |
| Text buffer | TypeScript string[] (SolidJS signals) |
| Syntax highlighting | Tree-sitter (native Rust) |
| Text measurement | Pretext (@chenglou/pretext) |
| Terminal parsing | vt100 crate |
| Terminal PTY | portable-pty |
| AI models | Claude (Anthropic API), local models |
| Extension runtime | wasmtime (WASM sandbox) |
| UI font | Courier New |
| Editor font | JetBrains Mono |
| Theme | Catppuccin Mocha (with custom hue rotation) |

### Why these choices

**SolidJS** over React — No virtual DOM. Fine-grained reactivity means signals update only what changed. 7 KB runtime.

**Tauri** over Electron — Rust backend with native webview. 11 MB installer instead of 800 MB. Lower memory usage. Direct access to system APIs.

**Canvas** over DOM — Every character is drawn via Canvas 2D. Pretext measures text 600x faster than DOM layout. No reflow, no style recalculation.

**TypeScript string[]** over Rust IPC — Zero-latency edits with no IPC per keystroke. SolidJS signals provide reactive updates. Undo/redo with time-based grouping.

**vt100 + Canvas** over xterm.js — Removed 333 KB of JavaScript. Terminal state lives in Rust. Rendering goes through the same canvas pipeline as the editor.

## License

MIT
