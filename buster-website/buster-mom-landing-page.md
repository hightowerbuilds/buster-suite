# buster.mom Landing Page Build Document

This document describes how to build the landing page for **buster.mom**, the website for Buster IDE. The entire page must be rendered on an HTML Canvas element -- no DOM text, no ads, no tracking, no framework bloat. Just a canvas filling the viewport that draws everything: text, layout, navigation, and animation.

---

## 1. Core Concept

Buster is a canvas-rendered IDE. The website for Buster should demonstrate that same philosophy. The page itself is proof of concept: visitors see a fast, clean, beautiful page that was drawn entirely on canvas. No DOM nodes for text. No div soup. Just pixels.

The site has three sections, scrollable vertically on the canvas:
1. **Hero** -- The name, tagline, and particle animation
2. **Features** -- What Buster does, explained clearly
3. **Extensions** -- How to build a WASM extension for Buster

A persistent top bar shows the GitHub link and section navigation.

---

## 2. Visual Style

### Color Palette (Catppuccin Mocha)

Use these exact hex values. This is the same palette Buster uses.

| Name | Hex | Usage |
|------|-----|-------|
| Base | `#1e1e2e` | Page background |
| Mantle | `#181825` | Top bar, section headers |
| Crust | `#11111b` | Darkest accents |
| Surface 0 | `#313244` | Card backgrounds, borders |
| Surface 1 | `#45475a` | Hover states |
| Surface 2 | `#585b70` | Muted UI elements |
| Text | `#cdd6f4` | Primary body text |
| Text Dim | `#a6adc8` | Secondary text |
| Text Muted | `#7f849c` | Tertiary/label text |
| Blue (Accent) | `#89b4fa` | Links, highlights, primary accent |
| Pink | `#f5c2e7` | Secondary accent |
| Green | `#a6e3a1` | Strings, success states |
| Peach | `#fab387` | Numbers, constants |
| Yellow | `#f9e2af` | Types, warnings |
| Red | `#f38ba8` | Errors |
| Mauve | `#cba6f7` | Keywords |
| Cyan | `#89dceb` | Operators |
| Flamingo | `#f5e0dc` | Cursor color |

### Fonts

- **UI text**: `"Courier New", Courier, monospace` -- all body copy, labels, nav
- **Hero title "Buster"**: `"UnifrakturMaguntia"` -- a blackletter/fraktur display font. Load from Google Fonts or Fontsource. Fallback to `"JetBrains Mono", monospace`
- **Code samples**: `"JetBrains Mono", monospace` -- load via Fontsource or Google Fonts

Do not use bold anywhere. All font-weight should be normal (400). Distinguish hierarchy through font size, color, and spacing only.

### General Rendering Rules

- The entire page is a single `<canvas>` element sized to fill the viewport
- All text is drawn with `ctx.fillText()` -- never placed in DOM
- The canvas must handle `window.devicePixelRatio` for crisp rendering on retina displays: set `canvas.width = w * dpr`, `canvas.style.width = w + "px"`, then `ctx.scale(dpr, dpr)`
- Line height for body text: 1.6x font size
- Body text font size: 14px
- Section title font size: 28px
- Subsection title font size: 18px
- Keep generous vertical padding between sections (60-80px)
- Max content width: 800px, centered horizontally

---

## 3. Interactivity on Canvas

Since everything is on canvas, interactivity requires manual hit testing.

### Scrolling
- Track scroll position with `wheel` event on the canvas
- Apply smooth momentum scrolling (ease-out deceleration)
- Calculate total content height after layout, clamp scroll bounds

### Links / Clickable Regions
- Maintain an array of clickable regions: `{ x, y, w, h, url, label }`
- On `click` event, check if click position (adjusted for scroll) falls within any region
- On `mousemove`, check hover state and set `canvas.style.cursor = "pointer"` or `"default"`
- Draw link text in accent blue (`#89b4fa`). On hover, draw an underline beneath the text

### Top Navigation Bar
- Fixed to the top of the canvas (drawn before applying scroll offset)
- Height: 40px
- Background: Mantle (`#181825`)
- Items: "Buster" (left), "Features" | "Extensions" | "GitHub" (right)
- Clicking a nav item scrolls to that section
- GitHub link opens `https://github.com/hightowerbuilds/buster` in a new tab via `window.open()`

---

## 4. Section 1: Hero

### Layout
- Full viewport height (100vh)
- Centered vertically and horizontally

### Particle Text Animation

The word **"Buster"** should assemble from scattered particles, identical to how the IDE's welcome screen works. Here is how to implement it:

1. **Sample the text shape**: Create a temporary offscreen canvas. Draw "Buster" in UnifrakturMaguntia at a large size (scale to ~85% of viewport width, minimum 48px). Read the pixel data with `getImageData()`. Sample every 5th pixel -- if the alpha channel is above a threshold (say 128), record that `{x, y}` as a target position.

2. **Create particles**: For each sampled point, create a particle:
   ```
   {
     tx, ty: target position (from text sampling)
     x, y: current position (start randomly off-screen)
     vx, vy: velocity (start with random scatter)
     ch: a random character from "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*"
     color: randomly picked from the palette
     alpha: 0 (fade in during assembly)
   }
   ```

3. **Three animation phases**:
   - **Scatter** (~15 frames): Particles start off-screen with random velocities. Alpha fades in.
   - **Assemble** (~120 frames): Each frame, accelerate particles toward their target: `vx += (tx - x) * 0.06; vy += (ty - y) * 0.06; vx *= 0.92; vy *= 0.92;` Move particle by velocity. When close enough to target (distance < 1), snap to target and mark as settled.
   - **Settled**: Particles rest at target positions with subtle idle oscillation: offset by `sin(time * 0.015 + i) * 0.5`

4. **Rendering each particle**: Draw each particle's `ch` character at its current position using `ctx.fillText()`. Use a small monospace font (10-12px JetBrains Mono). Color using the particle's assigned palette color. Apply alpha via `ctx.globalAlpha`.

5. **Background effects** (subtle):
   - 30 "rain" particles: random characters falling slowly down the screen, very low alpha (0.03-0.06)
   - A single horizontal scan line sweeping down at `(time * 2) % canvasHeight`, alpha 0.008

### Below the Title

After the particle text settles, render (with a typewriter fade-in effect):

- **Subtitle**: "canvas-rendered ide" in Courier New, 16px, Text Dim color, centered below the title
- **Tagline**: "no dom. no bloat. no ads. 11 MB." in 13px, Text Muted, centered below subtitle
- **Domain**: "buster.mom" in accent blue, 13px

---

## 5. Section 2: Features

### Section Header
- "What Buster Does" in 28px Courier New, Text color, left-aligned within the content column
- A thin horizontal line below it: 1px, Surface 0 color, full content width

### Feature List

Render each feature as a block. Feature name in accent blue (18px), description in Text Dim (14px), with 24px vertical gap between features.

Here are the features to list:

**Canvas-Rendered Editor**
Every character is drawn on canvas. No DOM text nodes. The editor uses a TypeScript string[] buffer backed by SolidJS signals. Syntax highlighting for JavaScript, TypeScript, TSX, Rust, Python, JSON, and CSS via Tree-sitter. Undo/redo with time-based grouping. Multi-cursor editing. Word wrap. Virtual scrolling.

**Full Terminal Emulator**
A real PTY-backed terminal rendered on canvas. VT100/ANSI parsing in Rust. Supports NeoVim, htop, tmux -- anything that runs in a terminal. Mouse reporting, bracketed paste, scrollback history. Each terminal opens as a tab alongside your files.

**AI Agent**
Chat with Claude (Sonnet, Opus, Haiku) or local Ollama models directly in the editor. The agent can read files, write code, search the codebase, and run shell commands. State-changing tools require your approval before executing. API keys stored securely in OS keychain.

**Git Integration**
28 built-in git commands. Status, staging, commit, push, pull, fetch, branches, stash, blame overlay, diff gutter indicators, conflict resolution, and a canvas-rendered commit graph. No terminal required.

**Language Server Protocol**
LSP support for Rust (rust-analyzer), TypeScript/JavaScript (typescript-language-server), Python (pyright), and Go (gopls). Autocomplete, hover, signature help, code actions, inlay hints, go-to-definition, document symbols, and diagnostic squiggles with automatic crash recovery.

**Quick Open & Command Palette**
Cmd+P opens fuzzy file search across your workspace. Prefix modes: > commands, : go-to-line, @ document symbols, # workspace content search, ? AI chat.

**Session Persistence**
Auto-saves every 30 seconds. Hot-exit on window close. Restores your workspace, tabs, cursor positions, and unsaved buffers when you relaunch. Pick up exactly where you left off.

**WASM Extensions**
Sandboxed extension runtime powered by Wasmtime. Capability-based permissions. Extensions can read/write files, run commands, show notifications, and connect to external services via WebSocket or HTTP SSE gateways.

**Panel Layouts**
Seven layout modes: Tabs, Columns, Grid, Trio, Quint, Rerack, and HQ (3x2 grid). Draggable dividers between panels. Pop out the sidebar into a tab. Resize everything.

**11 MB Installer**
Built on Tauri v2. Native performance without Electron overhead. The entire app ships as an 11 MB installer. Rust backend, SolidJS frontend, no bundle bloat.

### Tech Stack Table

Render a simple table (lines drawn with `ctx.strokeStyle` and `ctx.strokeRect` or `moveTo/lineTo`):

| Layer | Technology |
|-------|-----------|
| Desktop shell | Tauri v2 |
| Backend | Rust |
| Frontend | SolidJS |
| Text buffer | TypeScript string[] + SolidJS signals |
| Syntax highlighting | Tree-sitter (Rust) |
| Text measurement | Pretext |
| Terminal | portable-pty + vt100 crate |
| AI models | Claude API + Ollama |
| Extensions | Wasmtime (WASM sandbox) |
| Theme | Catppuccin Mocha |
| UI font | Courier New |
| Editor font | JetBrains Mono |

### Keyboard Shortcuts

Render a two-column list:

- Cmd+S -- Save
- Cmd+Z / Cmd+Shift+Z -- Undo / Redo
- Cmd+F -- Find & Replace
- Cmd+P -- Quick Open
- Cmd+Shift+P -- Command Palette
- Ctrl+\` -- New Terminal
- Cmd+L -- AI Agent
- Cmd+Shift+G -- Git Panel
- Cmd+Shift+B -- Git Blame
- Cmd+W -- Close Tab
- Cmd+, -- Settings
- Cmd+T -- Guided Tour

---

## 6. Section 3: Extensions

### Section Header
- "Building Extensions" in 28px Courier New, Text color
- Horizontal line separator

### Introductory Text

Buster extensions are WASM modules that run in a sandboxed Wasmtime runtime. Each extension declares the capabilities it needs in a TOML manifest. The host exposes functions for file I/O, command execution, notifications, and external service connections. Extensions are installed by copying their folder into the extensions directory.

### Extension Manifest

Render this as a code block with syntax highlighting (use the Catppuccin token colors). Draw a Surface 0 background rectangle behind the code, with 16px padding.

```toml
[extension]
id = "my-extension"
name = "My Extension"
version = "0.1.0"
description = "What this extension does"

[capabilities]
workspace_read = true       # Read files in workspace
workspace_write = true      # Write files in workspace
commands = true             # Run shell commands
notifications = true        # Show toast notifications
network = false             # WebSocket/SSE connections
terminal = false            # Terminal access
```

Use these colors for TOML syntax highlighting:
- Section headers `[extension]`: Mauve (`#cba6f7`)
- Keys: Blue (`#89b4fa`)
- String values: Green (`#a6e3a1`)
- Boolean values: Peach (`#fab387`)
- Comments: `#6c7086`

### Host API Reference

Render each function as a definition block: function name in Blue (16px monospace), description below in Text Dim (14px), parameters indented.

**activate() -> i32**
Called when the extension is loaded. Return 0 for success, non-zero for error.

**deactivate()**
Called when the extension is unloaded. Clean up resources here.

**host_read_file(path_ptr, path_len) -> i32**
Read a file from the workspace. Requires `workspace_read` capability. The path is read from WASM linear memory at the given pointer and length. Returns 0 on success (-1 on error). File content is placed in the return buffer.

**host_write_file(path_ptr, path_len, content_ptr, content_len) -> i32**
Write content to a file in the workspace. Requires `workspace_write` capability. Returns 0 on success, -1 on error or permission denied.

**host_list_directory(path_ptr, path_len) -> i32**
List entries in a directory. Requires `workspace_read` capability. Returns 0 on success. Result is a JSON array in the return buffer: `[{"name": "file.rs", "is_dir": false}, ...]`

**host_run_command(cmd_ptr, cmd_len) -> i32**
Execute a shell command in the workspace. Requires `commands` capability. Returns 0 on success, 1 on non-zero exit, -1 on permission denied. Result JSON in return buffer: `{"status": 0, "stdout": "...", "stderr": "..."}`

Dangerous commands (rm -rf, sudo, etc.) are blocked by a shared safety blocklist.

**notify(title_ptr, title_len, msg_ptr, msg_len) -> i32**
Show a toast notification to the user. Requires `notifications` capability. Returns 0 on success.

**log(level, ptr, len)**
Log a message. Always available (no capability required). Levels: 0=DEBUG, 1=INFO, 2=WARN, 3=ERROR.

### Gateway Connections

Extensions with the `network` capability can connect to external services via WebSocket or HTTP Server-Sent Events.

Render this as a code block:

```json
{
  "protocol": "websocket",
  "url": "ws://localhost:8080/stream",
  "auth_token": "your-token",
  "headers": {
    "X-Custom-Header": "value"
  }
}
```

The gateway supports three message protocols:
- **ZeroClaw** (Buster-native): `{"type": "chunk", "data": "..."}`
- **OpenAI-compatible**: `{"choices": [{"delta": {"content": "..."}}]}`
- **Agent Communication Protocol**: `{"status": "completed"}`

### Capabilities Summary

Render a compact table:

| Capability | What it grants |
|-----------|---------------|
| workspace_read | Read files and list directories |
| workspace_write | Create, modify, and delete files |
| commands | Run shell commands (blocklist enforced) |
| notifications | Show toast notifications |
| network | WebSocket and HTTP SSE connections |
| terminal | Access the terminal |

---

## 7. Footer

At the bottom of the canvas content:

- "buster.mom" in Text Muted, 12px, centered
- "Built by Hightower Builds" in Text Muted, 11px, centered below
- GitHub icon/link: "github.com/hightowerbuilds/buster" in accent blue, clickable, centered below
- 40px bottom padding

---

## 8. Rendering Architecture

### Canvas Setup

```javascript
const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");
const dpr = window.devicePixelRatio || 1;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.scale(dpr, dpr);
}

window.addEventListener("resize", resize);
resize();
```

### Render Loop

Use `requestAnimationFrame` only during the hero particle animation. Once settled, switch to on-demand rendering: re-render only when scroll position changes, window resizes, or hover state changes. Do not run a permanent rAF loop when the page is static.

```javascript
let needsRender = true;
let animating = true; // true during hero particle phase

function render() {
  if (!needsRender && !animating) return;
  needsRender = false;

  ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
  drawTopBar();
  ctx.save();
  ctx.translate(0, -scrollY);
  drawHero();
  drawFeatures();
  drawExtensions();
  drawFooter();
  ctx.restore();

  if (animating) requestAnimationFrame(render);
}

function requestRender() {
  needsRender = true;
  if (!animating) requestAnimationFrame(render);
}
```

### Text Wrapping

For body text paragraphs, implement word wrapping:

```javascript
function wrapText(ctx, text, maxWidth, fontSize) {
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const test = current ? current + " " + word : word;
    if (ctx.measureText(test).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}
```

### Layout Pass

Before rendering, compute the Y position of every element. Walk through all sections, accumulating height. Store the Y offset of each section header so nav clicks can scroll to them. Store the total content height for scroll clamping.

---

## 9. File Structure

The site should be a single HTML file or a minimal set:

```
index.html        -- canvas element, font loading, script tag
main.js           -- all rendering logic, scroll, hit testing
style.css         -- just: body { margin: 0; overflow: hidden; background: #1e1e2e; }
```

No build tools required. No framework. No dependencies beyond the font files. This should be deployable as a static site.

---

## 10. Key Principles

1. **Everything on canvas.** No DOM text. The page itself is a statement about what Buster believes in.
2. **No bold fonts.** Hierarchy comes from size, color, and spacing.
3. **No ads, no tracking, no cookies.** The page loads fast and respects visitors.
4. **On-demand rendering.** Do not burn CPU with a permanent animation loop after the hero settles.
5. **Retina-aware.** Always account for devicePixelRatio.
6. **Accessible fallback.** Include a `<noscript>` tag with a plain HTML summary and the GitHub link. Add a visually-hidden `<div>` with the page text content for screen readers.
7. **The GitHub link must work.** https://github.com/hightowerbuilds/buster
