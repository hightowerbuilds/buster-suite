// ─── Color Palette (Catppuccin Mocha) ────────────────────────────────────────
const C = {
  base:     "#1e1e2e",
  mantle:   "#181825",
  crust:    "#11111b",
  surface0: "#313244",
  surface1: "#45475a",
  surface2: "#585b70",
  text:     "#cdd6f4",
  textDim:  "#a6adc8",
  textMuted:"#7f849c",
  blue:     "#89b4fa",
  pink:     "#f5c2e7",
  green:    "#a6e3a1",
  peach:    "#fab387",
  yellow:   "#f9e2af",
  red:      "#f38ba8",
  mauve:    "#cba6f7",
  cyan:     "#89dceb",
  flamingo: "#f5e0dc",
  comment:  "#6c7086",
};

// Seattle Mariners colors for particle animation
const MARINERS = {
  navy:      "#0C2C56",
  teal:      "#005C5C",
  nwGreen:   "#00A5B5",  // brighter teal for visibility on dark bg
  silver:    "#C4CED4",
  white:     "#E8ECF0",
};
const PALETTE_COLORS = [MARINERS.navy, MARINERS.teal, MARINERS.nwGreen, MARINERS.silver, MARINERS.white];
const PARTICLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";

// ─── Fonts ───────────────────────────────────────────────────────────────────
const FONT_UI = '"Courier New", Courier, monospace';
const FONT_HERO = '"UnifrakturMaguntia", "JetBrains Mono", monospace';
const FONT_CODE = '"JetBrains Mono", monospace';

// ─── Canvas Setup ────────────────────────────────────────────────────────────
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
let dpr = window.devicePixelRatio || 1;
let W = window.innerWidth;
let H = window.innerHeight;

function resize() {
  dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  computeLayout();
  requestRender();
}

window.addEventListener("resize", resize);

// ─── Scroll State ────────────────────────────────────────────────────────────
let scrollY = 0;
let scrollVelocity = 0;
let totalContentHeight = 0;
const NAV_HEIGHT = 40;
const MAX_WIDTH = 800;

function contentX() {
  return Math.max(20, (W - MAX_WIDTH) / 2);
}

// ─── Clickable Regions ───────────────────────────────────────────────────────
let clickables = [];
let hoveredLink = null;

// ─── Section Offsets (computed in layout pass) ───────────────────────────────
let sectionOffsets = { hero: 0, features: 0, extensions: 0, footer: 0 };

// ─── Warp Effect (click to displace) ─────────────────────────────────────────
let warpSources = [];
const WARP_RADIUS = 200;
const WARP_FORCE = 25;
const WARP_DECAY = 0.92;

function applyWarpPost() {
  if (warpSources.length === 0) return;

  for (const w of warpSources) {
    // Warp center in screen space
    const sx = w.x * dpr;
    const sy = (w.y - scrollY) * dpr;
    const sr = w.radius * dpr;

    // Bounding box (clipped to canvas)
    const bx = Math.max(0, Math.floor(sx - sr));
    const by = Math.max(0, Math.floor(sy - sr));
    const bx2 = Math.min(Math.floor(W * dpr), Math.ceil(sx + sr));
    const by2 = Math.min(Math.floor(H * dpr), Math.ceil(sy + sr));
    const bw = bx2 - bx;
    const bh = by2 - by;
    if (bw <= 0 || bh <= 0) continue;

    const imageData = ctx.getImageData(bx, by, bw, bh);
    const src = new Uint8ClampedArray(imageData.data);
    const dst = imageData.data;

    for (let py = 0; py < bh; py++) {
      for (let px = 0; px < bw; px++) {
        const worldX = (bx + px) / dpr;
        const worldY = (by + py) / dpr;
        const dx = worldX - w.x;
        const dy = worldY - (w.y - scrollY);
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < w.radius && dist > 0) {
          const t = 1 - dist / w.radius;
          const strength = t * t * w.force; // quadratic falloff
          const srcPx = Math.round(px - (dx / dist) * strength * dpr);
          const srcPy = Math.round(py - (dy / dist) * strength * dpr);
          const di = (py * bw + px) * 4;

          if (srcPx >= 0 && srcPx < bw && srcPy >= 0 && srcPy < bh) {
            const si = (srcPy * bw + srcPx) * 4;
            dst[di]     = src[si];
            dst[di + 1] = src[si + 1];
            dst[di + 2] = src[si + 2];
            dst[di + 3] = src[si + 3];
          } else {
            dst[di + 3] = 0; // transparent where source is out of bounds
          }
        }
      }
    }
    ctx.putImageData(imageData, bx, by);
  }
}

function updateWarps() {
  for (let i = warpSources.length - 1; i >= 0; i--) {
    warpSources[i].force *= WARP_DECAY;
    if (warpSources[i].force < 0.3) {
      warpSources.splice(i, 1);
    }
  }
}

// ─── Particle System ─────────────────────────────────────────────────────────
// Targets: positions in the text imprint that rain can fill
let targets = [];
// Spatial grid for fast target lookup: key "col" -> array of unfilled targets
let targetGrid = {};
const GRID_CELL = 6; // pixel width of each grid column

// Rain drops falling down the screen
let rainDrops = [];
const RAIN_COUNT = 2000;   // heavy downpour
const RAIN_SPEED_MIN = 4.0;
const RAIN_SPEED_MAX = 9.0;

let animFrame = 0;
let animating = true;
let heroSettled = false;
let subtitleAlpha = 0;
let filledCount = 0;


function initParticles() {
  const offscreen = document.createElement("canvas");
  const octx = offscreen.getContext("2d");

  // Scale text to fill viewport width, min 96px
  let fontSize = Math.max(76, Math.floor(W * 0.24));
  offscreen.width = W;
  offscreen.height = fontSize * 1.6;

  octx.fillStyle = "#fff";
  octx.font = `${fontSize}px ${FONT_HERO}`;
  octx.textBaseline = "top";

  const textWidth = octx.measureText("Buster").width;
  const textX = (W - textWidth) / 2;
  const textY = fontSize * 0.15;
  octx.fillText("Buster", textX, textY);

  const imageData = octx.getImageData(0, 0, offscreen.width, offscreen.height);
  const data = imageData.data;

  targets = [];
  targetGrid = {};
  filledCount = 0;
  const step = 5;
  const centerY = H / 2;
  const offsetY = centerY - offscreen.height / 2;

  for (let py = 0; py < offscreen.height; py += step) {
    for (let px = 0; px < offscreen.width; px += step) {
      const i = (py * offscreen.width + px) * 4;
      if (data[i + 3] > 128) {
        const t = {
          x: px,
          y: py + offsetY,
          ch: PARTICLE_CHARS[Math.floor(Math.random() * PARTICLE_CHARS.length)],
          color: PALETTE_COLORS[Math.floor(Math.random() * PALETTE_COLORS.length)],
          filled: false,
          alpha: 0,
        };
        targets.push(t);
        // Index by grid column for fast spatial lookup
        const col = Math.floor(px / GRID_CELL);
        if (!targetGrid[col]) targetGrid[col] = [];
        targetGrid[col].push(t);
      }
    }
  }

  // Sort each grid column's targets top-to-bottom so rain hits top ones first
  for (const col in targetGrid) {
    targetGrid[col].sort((a, b) => a.y - b.y);
  }

  // Spawn initial rain drops spread across the screen
  rainDrops = [];
  for (let i = 0; i < RAIN_COUNT; i++) {
    rainDrops.push(spawnRainDrop(true));
  }

  animFrame = 0;
  heroSettled = false;
  subtitleAlpha = 0;
  animating = true;
}

function spawnRainDrop(randomY) {
  return {
    x: Math.random() * W,
    y: randomY ? -Math.random() * H * 1.5 : -10 - Math.random() * 200,
    speed: RAIN_SPEED_MIN + Math.random() * (RAIN_SPEED_MAX - RAIN_SPEED_MIN),
    ch: PARTICLE_CHARS[Math.floor(Math.random() * PARTICLE_CHARS.length)],
    color: PALETTE_COLORS[Math.floor(Math.random() * PALETTE_COLORS.length)],
    alpha: 0.08 + Math.random() * 0.15,
    captured: false,
  };
}

function updateParticles() {
  animFrame++;

  const allFilled = filledCount >= targets.length;

  // Update rain drops — rain NEVER stops
  for (let i = 0; i < rainDrops.length; i++) {
    const r = rainDrops[i];

    if (r.captured) {
      rainDrops[i] = spawnRainDrop(false);
      continue;
    }

    const prevY = r.y;
    r.y += r.speed;

    // Check if this rain drop can fill a target
    if (!allFilled) {
      const col = Math.floor(r.x / GRID_CELL);
      for (let dc = -2; dc <= 2; dc++) {
        const bucket = targetGrid[col + dc];
        if (!bucket) continue;
        for (const t of bucket) {
          if (t.filled) continue;
          const dx = Math.abs(r.x - t.x);
          if (dx > GRID_CELL) continue;
          const targetScreenY = t.y - scrollY;
          if (targetScreenY >= prevY - 2 && targetScreenY <= r.y + 2) {
            t.filled = true;
            t.ch = r.ch;
            t.alpha = 0;
            filledCount++;
            r.captured = true;
            break;
          }
        }
        if (r.captured) break;
      }
    }

    if (r.y > H + 20) {
      rainDrops[i] = spawnRainDrop(false);
    }
  }

  // Fade in filled targets
  for (const t of targets) {
    if (t.filled && t.alpha < 1) {
      t.alpha = Math.min(1, t.alpha + 0.05);
    }
  }

  // Subtitle once 30% filled
  const fillRatio = targets.length > 0 ? filledCount / targets.length : 0;
  if (fillRatio > 0.3 && subtitleAlpha < 1) {
    subtitleAlpha = Math.min(1, subtitleAlpha + 0.02);
  }

  if (allFilled && !heroSettled) {
    heroSettled = true;
  }
}

// ─── Layout Pass ─────────────────────────────────────────────────────────────
// Feature data
const FEATURES = [
  {
    name: "Canvas-Rendered Editor",
    desc: "Every character is drawn on canvas. No DOM text nodes. The editor uses a TypeScript string[] buffer backed by SolidJS signals. Syntax highlighting for JavaScript, TypeScript, TSX, Rust, Python, JSON, and CSS via Tree-sitter. Undo/redo with time-based grouping. Multi-cursor editing. Word wrap. Virtual scrolling.",
  },
  {
    name: "Full Terminal Emulator",
    desc: "A real PTY-backed terminal rendered on canvas. VT100/ANSI parsing in Rust. Supports NeoVim, htop, tmux -- anything that runs in a terminal. Mouse reporting, bracketed paste, scrollback history. Each terminal opens as a tab alongside your files.",
  },
  {
    name: "AI Agent",
    desc: "Chat with Claude (Sonnet, Opus, Haiku) or local Ollama models directly in the editor. The agent can read files, write code, search the codebase, and run shell commands. State-changing tools require your approval before executing. API keys stored securely in OS keychain.",
  },
  {
    name: "Git Integration",
    desc: "28 built-in git commands. Status, staging, commit, push, pull, fetch, branches, stash, blame overlay, diff gutter indicators, conflict resolution, and a canvas-rendered commit graph. No terminal required.",
  },
  {
    name: "Language Server Protocol",
    desc: "LSP support for Rust (rust-analyzer), TypeScript/JavaScript (typescript-language-server), Python (pyright), and Go (gopls). Autocomplete, hover, signature help, code actions, inlay hints, go-to-definition, document symbols, and diagnostic squiggles with automatic crash recovery.",
  },
  {
    name: "Quick Open & Command Palette",
    desc: 'Cmd+P opens fuzzy file search across your workspace. Prefix modes: > commands, : go-to-line, @ document symbols, # workspace content search, ? AI chat.',
  },
  {
    name: "Session Persistence",
    desc: "Auto-saves every 30 seconds. Hot-exit on window close. Restores your workspace, tabs, cursor positions, and unsaved buffers when you relaunch. Pick up exactly where you left off.",
  },
  {
    name: "WASM Extensions",
    desc: "Sandboxed extension runtime powered by Wasmtime. Capability-based permissions. Extensions can read/write files, run commands, show notifications, and connect to external services via WebSocket or HTTP SSE gateways.",
  },
  {
    name: "Panel Layouts",
    desc: "Seven layout modes: Tabs, Columns, Grid, Trio, Quint, Rerack, and HQ (3x2 grid). Draggable dividers between panels. Pop out the sidebar into a tab. Resize everything.",
  },
  {
    name: "11 MB Installer",
    desc: "Built on Tauri v2. Native performance without Electron overhead. The entire app ships as an 11 MB installer. Rust backend, SolidJS frontend, no bundle bloat.",
  },
];

const TECH_STACK = [
  ["Desktop shell", "Tauri v2"],
  ["Backend", "Rust"],
  ["Frontend", "SolidJS"],
  ["Text buffer", "TypeScript string[] + SolidJS signals"],
  ["Syntax highlighting", "Tree-sitter (Rust)"],
  ["Text measurement", "Pretext"],
  ["Terminal", "portable-pty + vt100 crate"],
  ["AI models", "Claude API + Ollama"],
  ["Extensions", "Wasmtime (WASM sandbox)"],
  ["Theme", "Catppuccin Mocha"],
  ["UI font", "Courier New"],
  ["Editor font", "JetBrains Mono"],
];

const SHORTCUTS = [
  ["Cmd+S", "Save"],
  ["Cmd+Z / Cmd+Shift+Z", "Undo / Redo"],
  ["Cmd+F", "Find & Replace"],
  ["Cmd+P", "Quick Open"],
  ["Cmd+Shift+P", "Command Palette"],
  ["Ctrl+`", "New Terminal"],
  ["Cmd+L", "AI Agent"],
  ["Cmd+Shift+G", "Git Panel"],
  ["Cmd+Shift+B", "Git Blame"],
  ["Cmd+W", "Close Tab"],
  ["Cmd+,", "Settings"],
  ["Cmd+T", "Guided Tour"],
];

const HOST_API = [
  {
    sig: "activate() -> i32",
    desc: "Called when the extension is loaded. Return 0 for success, non-zero for error.",
  },
  {
    sig: "deactivate()",
    desc: "Called when the extension is unloaded. Clean up resources here.",
  },
  {
    sig: "host_read_file(path_ptr, path_len) -> i32",
    desc: "Read a file from the workspace. Requires workspace_read capability. The path is read from WASM linear memory at the given pointer and length. Returns 0 on success (-1 on error). File content is placed in the return buffer.",
  },
  {
    sig: "host_write_file(path_ptr, path_len, content_ptr, content_len) -> i32",
    desc: "Write content to a file in the workspace. Requires workspace_write capability. Returns 0 on success, -1 on error or permission denied.",
  },
  {
    sig: "host_list_directory(path_ptr, path_len) -> i32",
    desc: 'List entries in a directory. Requires workspace_read capability. Returns 0 on success. Result is a JSON array in the return buffer: [{"name": "file.rs", "is_dir": false}, ...]',
  },
  {
    sig: "host_run_command(cmd_ptr, cmd_len) -> i32",
    desc: 'Execute a shell command in the workspace. Requires commands capability. Returns 0 on success, 1 on non-zero exit, -1 on permission denied. Result JSON in return buffer: {"status": 0, "stdout": "...", "stderr": "..."}',
  },
  {
    sig: "notify(title_ptr, title_len, msg_ptr, msg_len) -> i32",
    desc: "Show a toast notification to the user. Requires notifications capability. Returns 0 on success.",
  },
  {
    sig: "log(level, ptr, len)",
    desc: "Log a message. Always available (no capability required). Levels: 0=DEBUG, 1=INFO, 2=WARN, 3=ERROR.",
  },
];

const TOML_CODE = `[extension]
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
terminal = false            # Terminal access`;

const JSON_CODE = `{
  "protocol": "websocket",
  "url": "ws://localhost:8080/stream",
  "auth_token": "your-token",
  "headers": {
    "X-Custom-Header": "value"
  }
}`;

const GATEWAY_PROTOCOLS = [
  ['ZeroClaw (Buster-native)', '{"type": "chunk", "data": "..."}'],
  ['OpenAI-compatible', '{"choices": [{"delta": {"content": "..."}}]}'],
  ['Agent Communication Protocol', '{"status": "completed"}'],
];

const CAPABILITIES_TABLE = [
  ["workspace_read", "Read files and list directories"],
  ["workspace_write", "Create, modify, and delete files"],
  ["commands", "Run shell commands (blocklist enforced)"],
  ["notifications", "Show toast notifications"],
  ["network", "WebSocket and HTTP SSE connections"],
  ["terminal", "Access the terminal"],
];

// ─── Text Wrapping ───────────────────────────────────────────────────────────
function wrapText(text, maxWidth, font) {
  ctx.font = font;
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const test = current ? current + " " + word : word;
    if (ctx.measureText(test).width > maxWidth) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ─── Layout Computation ─────────────────────────────────────────────────────
let layoutData = {};

function computeLayout() {
  const cx = contentX();
  const cw = Math.min(MAX_WIDTH, W - 40);
  let y = 0;

  // Hero section: full viewport height
  sectionOffsets.hero = 0;
  y = H;

  // Features section
  sectionOffsets.features = y;
  y += 80; // top padding
  y += 28 + 10; // title + gap
  y += 1 + 30; // line + gap

  // Features list
  const featureFont = `14px ${FONT_UI}`;
  for (const f of FEATURES) {
    y += 18 + 8; // name + gap
    const lines = wrapText(f.desc, cw, featureFont);
    y += lines.length * (14 * 1.6);
    y += 24; // gap between features
  }

  y += 40; // extra spacing

  // Tech stack table
  y += 18 + 16; // subtitle + gap
  y += (TECH_STACK.length + 1) * 28 + 20; // rows + header + padding

  y += 40;

  // Keyboard shortcuts
  y += 18 + 16; // subtitle + gap
  y += SHORTCUTS.length * 24 + 20;

  y += 80; // section bottom padding

  // Extensions section
  sectionOffsets.extensions = y;
  y += 80; // top padding
  y += 28 + 10; // title + gap
  y += 1 + 30; // line + gap

  // Intro text
  const introText = "Buster extensions are WASM modules that run in a sandboxed Wasmtime runtime. Each extension declares the capabilities it needs in a TOML manifest. The host exposes functions for file I/O, command execution, notifications, and external service connections. Extensions are installed by copying their folder into the extensions directory.";
  const introLines = wrapText(introText, cw, `14px ${FONT_UI}`);
  y += introLines.length * (14 * 1.6) + 30;

  // Extension manifest subtitle + code block
  y += 18 + 16;
  const tomlLines = TOML_CODE.split("\n");
  y += 32 + tomlLines.length * (14 * 1.6) + 32 + 30; // padding + lines + padding + gap

  // Host API
  y += 18 + 16;
  for (const api of HOST_API) {
    y += 16 + 8; // signature
    const apiLines = wrapText(api.desc, cw - 20, `14px ${FONT_UI}`);
    y += apiLines.length * (14 * 1.6);
    y += 20;
  }
  y += 10;

  // Dangerous commands note
  const dangerLines = wrapText("Dangerous commands (rm -rf, sudo, etc.) are blocked by a shared safety blocklist.", cw, `14px ${FONT_UI}`);
  y += dangerLines.length * (14 * 1.6) + 30;

  // Gateway connections
  y += 18 + 16;
  const gatewayIntro = "Extensions with the network capability can connect to external services via WebSocket or HTTP Server-Sent Events.";
  const gatewayIntroLines = wrapText(gatewayIntro, cw, `14px ${FONT_UI}`);
  y += gatewayIntroLines.length * (14 * 1.6) + 16;

  // JSON code block
  const jsonLines = JSON_CODE.split("\n");
  y += 32 + jsonLines.length * (14 * 1.6) + 32 + 20;

  // Gateway protocols
  y += 14 * 1.6 + 10; // "The gateway supports..."
  for (const gp of GATEWAY_PROTOCOLS) {
    const gpLines = wrapText(`${gp[0]}: ${gp[1]}`, cw - 20, `14px ${FONT_UI}`);
    y += gpLines.length * (14 * 1.6) + 4;
  }
  y += 30;

  // Capabilities table
  y += 18 + 16;
  y += (CAPABILITIES_TABLE.length + 1) * 28 + 20;

  y += 80; // section bottom padding

  // Footer
  sectionOffsets.footer = y;
  y += 12 + 16 + 11 + 12 + 13 + 40 + 40;

  totalContentHeight = y;
}

// ─── Drawing Helpers ─────────────────────────────────────────────────────────
function drawLine(x1, y1, x2, y2, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width || 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawTable(x, y, headers, rows, cw) {
  const rowH = 28;
  const col1W = Math.min(cw * 0.4, 260);
  const col2W = cw - col1W;

  ctx.strokeStyle = C.surface0;
  ctx.lineWidth = 1;

  // Header
  ctx.fillStyle = C.mantle;
  ctx.fillRect(x, y, cw, rowH);
  ctx.font = `14px ${FONT_UI}`;
  ctx.fillStyle = C.text;
  ctx.textBaseline = "middle";
  ctx.fillText(headers[0], x + 10, y + rowH / 2);
  ctx.fillText(headers[1], x + col1W + 10, y + rowH / 2);

  // Header border
  ctx.strokeRect(x, y, cw, rowH);
  drawLine(x + col1W, y, x + col1W, y + rowH, C.surface0, 1);

  // Rows
  for (let i = 0; i < rows.length; i++) {
    const ry = y + (i + 1) * rowH;
    ctx.fillStyle = i % 2 === 0 ? C.base : C.crust;
    ctx.fillRect(x, ry, cw, rowH);
    ctx.strokeRect(x, ry, cw, rowH);
    drawLine(x + col1W, ry, x + col1W, ry + rowH, C.surface0, 1);

    ctx.fillStyle = C.textDim;
    ctx.fillText(rows[i][0], x + 10, ry + rowH / 2);
    ctx.fillStyle = C.text;
    ctx.fillText(rows[i][1], x + col1W + 10, ry + rowH / 2);
  }

  return (rows.length + 1) * rowH;
}

// ─── TOML Syntax Highlighting ────────────────────────────────────────────────
function drawTomlLine(line, x, y) {
  ctx.font = `14px ${FONT_CODE}`;
  ctx.textBaseline = "top";

  if (line.trim() === "") {
    return;
  }

  // Section header
  if (/^\[.+\]$/.test(line.trim())) {
    ctx.fillStyle = C.mauve;
    ctx.fillText(line, x, y);
    return;
  }

  // Key = value # comment
  const commentIdx = line.indexOf("#");
  let mainPart = line;
  let commentPart = "";
  if (commentIdx >= 0) {
    // Check if # is inside a string
    const beforeHash = line.substring(0, commentIdx);
    const quoteCount = (beforeHash.match(/"/g) || []).length;
    if (quoteCount % 2 === 0) {
      mainPart = line.substring(0, commentIdx);
      commentPart = line.substring(commentIdx);
    }
  }

  const eqIdx = mainPart.indexOf("=");
  if (eqIdx >= 0) {
    const key = mainPart.substring(0, eqIdx);
    const eq = " = ";
    const val = mainPart.substring(eqIdx + 1).trim();

    ctx.fillStyle = C.blue;
    ctx.fillText(key, x, y);
    const keyW = ctx.measureText(key).width;

    ctx.fillStyle = C.text;
    ctx.fillText("=", x + keyW, y);
    const eqW = ctx.measureText("= ").width;

    // Determine value type
    if (val.startsWith('"')) {
      ctx.fillStyle = C.green;
    } else if (val === "true" || val === "false") {
      ctx.fillStyle = C.peach;
    } else {
      ctx.fillStyle = C.text;
    }
    const valX = x + keyW + eqW;
    ctx.fillText(val, valX, y);

    if (commentPart) {
      const valW = ctx.measureText(val).width;
      ctx.fillStyle = C.comment;
      ctx.fillText(commentPart, valX + valW + ctx.measureText(" ").width, y);
    }
  } else {
    ctx.fillStyle = C.text;
    ctx.fillText(mainPart, x, y);
    if (commentPart) {
      const mw = ctx.measureText(mainPart).width;
      ctx.fillStyle = C.comment;
      ctx.fillText(commentPart, x + mw, y);
    }
  }
}

// ─── JSON Syntax Highlighting ────────────────────────────────────────────────
function drawJsonLine(line, x, y) {
  ctx.font = `14px ${FONT_CODE}`;
  ctx.textBaseline = "top";

  // Simple token-based coloring
  let cx = x;
  const tokens = line.match(/("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|([{}[\],])|(\s+)|([^"{}[\],\s]+)/g);
  if (!tokens) return;

  for (const token of tokens) {
    if (/^\s+$/.test(token)) {
      cx += ctx.measureText(token).width;
      continue;
    }

    // Key (string followed by colon in original)
    if (token.endsWith(":") && token.startsWith('"')) {
      ctx.fillStyle = C.blue;
      ctx.fillText(token, cx, y);
    } else if (token.startsWith('"')) {
      ctx.fillStyle = C.green;
      ctx.fillText(token, cx, y);
    } else if (/^[{}[\],]$/.test(token)) {
      ctx.fillStyle = C.text;
      ctx.fillText(token, cx, y);
    } else {
      ctx.fillStyle = C.peach;
      ctx.fillText(token, cx, y);
    }
    cx += ctx.measureText(token).width;
  }
}

// ─── Draw Top Navigation Bar ────────────────────────────────────────────────
function drawTopBar() {
  ctx.fillStyle = C.mantle;
  ctx.fillRect(0, 0, W, NAV_HEIGHT);

  // Bottom border
  drawLine(0, NAV_HEIGHT, W, NAV_HEIGHT, C.surface0, 1);

  ctx.textBaseline = "middle";
  const midY = NAV_HEIGHT / 2;

  // Left: "Buster"
  ctx.font = `16px ${FONT_HERO}`;
  ctx.fillStyle = C.text;
  ctx.fillText("Buster", 16, midY);

  // Right: nav items
  ctx.font = `13px ${FONT_UI}`;
  const navItems = [
    { label: "Features", action: "scroll", target: "features" },
    { label: "Extensions", action: "scroll", target: "extensions" },
    { label: "GitHub", action: "link", url: "https://github.com/hightowerbuilds/buster" },
  ];

  let rx = W - 16;
  for (let i = navItems.length - 1; i >= 0; i--) {
    const item = navItems[i];
    const tw = ctx.measureText(item.label).width;
    rx -= tw;

    const isHover = hoveredLink && hoveredLink.label === item.label;
    ctx.fillStyle = isHover ? C.blue : C.textDim;
    ctx.fillText(item.label, rx, midY);

    if (isHover) {
      drawLine(rx, midY + 8, rx + tw, midY + 8, C.blue, 1);
    }

    // Register clickable (these are NOT offset by scroll)
    clickables.push({
      x: rx, y: 0, w: tw, h: NAV_HEIGHT,
      label: item.label,
      action: item.action,
      target: item.target,
      url: item.url,
      fixed: true,
    });

    rx -= 24; // gap between items
  }
}

// ─── Draw Rain (screen-space overlay — always visible) ──────────────────────
function drawRain() {
  const time = animFrame;

  // Scan line
  const scanY = (time * 2) % H;
  ctx.fillStyle = C.text;
  ctx.globalAlpha = 0.008;
  ctx.fillRect(0, scanY, W, 1);
  ctx.globalAlpha = 1;

  // Falling rain drops (screen space — not affected by scroll)
  ctx.font = `7px ${FONT_CODE}`;
  ctx.textBaseline = "middle";
  for (const r of rainDrops) {
    if (r.captured) continue;
    ctx.globalAlpha = r.alpha;
    ctx.fillStyle = r.color;
    ctx.fillText(r.ch, r.x, r.y);
  }
  ctx.globalAlpha = 1;
}

// ─── Draw Hero Section ───────────────────────────────────────────────────────
function drawHero() {
  const time = animFrame;

  // Filled target slots (the imprint being revealed by rain)
  ctx.font = `7px ${FONT_CODE}`;
  ctx.textBaseline = "middle";
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (!t.filled) continue;
    const ox = Math.sin(time * 0.008 + i) * 0.4;
    const oy = Math.cos(time * 0.006 + i * 0.7) * 0.4;
    if (t.alpha >= 1 && Math.random() < 0.003) {
      t.ch = PARTICLE_CHARS[Math.floor(Math.random() * PARTICLE_CHARS.length)];
    }
    ctx.globalAlpha = t.alpha;
    ctx.fillStyle = t.color;
    ctx.fillText(t.ch, t.x + ox, t.y + oy);
  }
  ctx.globalAlpha = 1;

  // Subtitle area (below particles)
  if (subtitleAlpha > 0) {
    const centerY = H / 2;
    const subY = centerY + Math.max(76, Math.floor(W * 0.24)) * 0.55;

    ctx.globalAlpha = subtitleAlpha;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";

    ctx.font = `16px ${FONT_UI}`;
    ctx.fillStyle = C.textDim;
    ctx.fillText("canvas-rendered ide", W / 2, subY);

    ctx.font = `13px ${FONT_UI}`;
    ctx.fillStyle = C.textMuted;
    ctx.fillText("no dom. no bloat. no ads. 11 MB.", W / 2, subY + 28);

    ctx.fillStyle = C.blue;
    ctx.fillText("buster.mom", W / 2, subY + 52);

    const domW = ctx.measureText("buster.mom").width;
    clickables.push({
      x: W / 2 - domW / 2, y: subY + 52, w: domW, h: 16,
      label: "buster.mom",
      action: "link",
      url: "https://buster.mom",
    });

    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }
}

// ─── Draw Features Section ──────────────────────────────────────────────────
function drawFeatures() {
  const cx = contentX();
  const cw = Math.min(MAX_WIDTH, W - 40);
  let y = sectionOffsets.features + 80;

  // Section title
  ctx.font = `28px ${FONT_UI}`;
  ctx.fillStyle = C.text;
  ctx.textBaseline = "top";
  ctx.fillText("What Buster Does", cx, y);
  y += 28 + 10;

  // Separator line
  drawLine(cx, y, cx + cw, y, C.surface0, 1);
  y += 30;

  // Feature list
  for (const f of FEATURES) {
    ctx.font = `18px ${FONT_UI}`;
    ctx.fillStyle = C.blue;
    ctx.textBaseline = "top";
    ctx.fillText(f.name, cx, y);
    y += 18 + 8;

    ctx.font = `14px ${FONT_UI}`;
    ctx.fillStyle = C.textDim;
    const lines = wrapText(f.desc, cw, `14px ${FONT_UI}`);
    for (const line of lines) {
      ctx.fillText(line, cx, y);
      y += 14 * 1.6;
    }
    y += 24;
  }

  y += 40;

  // Tech stack subtitle
  ctx.font = `18px ${FONT_UI}`;
  ctx.fillStyle = C.text;
  ctx.fillText("Tech Stack", cx, y);
  y += 18 + 16;

  // Tech stack table
  const th = drawTable(cx, y, ["Layer", "Technology"], TECH_STACK, cw);
  y += th + 20;

  y += 40;

  // Keyboard shortcuts subtitle
  ctx.font = `18px ${FONT_UI}`;
  ctx.fillStyle = C.text;
  ctx.fillText("Keyboard Shortcuts", cx, y);
  y += 18 + 16;

  // Shortcuts list
  ctx.font = `14px ${FONT_UI}`;
  ctx.textBaseline = "top";
  const shortcutKeyW = Math.min(cw * 0.4, 240);
  for (const [key, desc] of SHORTCUTS) {
    ctx.fillStyle = C.peach;
    ctx.fillText(key, cx + 10, y);
    ctx.fillStyle = C.textDim;
    ctx.fillText(desc, cx + shortcutKeyW, y);
    y += 24;
  }
}

// ─── Draw Extensions Section ────────────────────────────────────────────────
function drawExtensions() {
  const cx = contentX();
  const cw = Math.min(MAX_WIDTH, W - 40);
  let y = sectionOffsets.extensions + 80;

  // Section title
  ctx.font = `28px ${FONT_UI}`;
  ctx.fillStyle = C.text;
  ctx.textBaseline = "top";
  ctx.fillText("Building Extensions", cx, y);
  y += 28 + 10;

  drawLine(cx, y, cx + cw, y, C.surface0, 1);
  y += 30;

  // Intro text
  const introText = "Buster extensions are WASM modules that run in a sandboxed Wasmtime runtime. Each extension declares the capabilities it needs in a TOML manifest. The host exposes functions for file I/O, command execution, notifications, and external service connections. Extensions are installed by copying their folder into the extensions directory.";
  ctx.font = `14px ${FONT_UI}`;
  ctx.fillStyle = C.textDim;
  const introLines = wrapText(introText, cw, `14px ${FONT_UI}`);
  for (const line of introLines) {
    ctx.fillText(line, cx, y);
    y += 14 * 1.6;
  }
  y += 30;

  // Extension Manifest subtitle
  ctx.font = `18px ${FONT_UI}`;
  ctx.fillStyle = C.text;
  ctx.fillText("Extension Manifest", cx, y);
  y += 18 + 16;

  // TOML code block
  const tomlLines = TOML_CODE.split("\n");
  const codeBlockH = 32 + tomlLines.length * (14 * 1.6) + 32;
  ctx.fillStyle = C.surface0;
  roundRect(cx, y, cw, codeBlockH, 6);
  ctx.fill();

  const codeX = cx + 16;
  let codeY = y + 16;
  for (const line of tomlLines) {
    drawTomlLine(line, codeX, codeY);
    codeY += 14 * 1.6;
  }
  y += codeBlockH + 30;

  // Host API Reference
  ctx.font = `18px ${FONT_UI}`;
  ctx.fillStyle = C.text;
  ctx.fillText("Host API Reference", cx, y);
  y += 18 + 16;

  for (const api of HOST_API) {
    ctx.font = `16px ${FONT_CODE}`;
    ctx.fillStyle = C.blue;
    ctx.textBaseline = "top";
    ctx.fillText(api.sig, cx, y);
    y += 16 + 8;

    ctx.font = `14px ${FONT_UI}`;
    ctx.fillStyle = C.textDim;
    const apiLines = wrapText(api.desc, cw - 20, `14px ${FONT_UI}`);
    for (const line of apiLines) {
      ctx.fillText(line, cx + 10, y);
      y += 14 * 1.6;
    }
    y += 20;
  }

  // Dangerous commands note
  ctx.font = `14px ${FONT_UI}`;
  ctx.fillStyle = C.textMuted;
  const dangerLines = wrapText("Dangerous commands (rm -rf, sudo, etc.) are blocked by a shared safety blocklist.", cw, `14px ${FONT_UI}`);
  for (const line of dangerLines) {
    ctx.fillText(line, cx, y);
    y += 14 * 1.6;
  }
  y += 30;

  // Gateway Connections
  ctx.font = `18px ${FONT_UI}`;
  ctx.fillStyle = C.text;
  ctx.fillText("Gateway Connections", cx, y);
  y += 18 + 16;

  ctx.font = `14px ${FONT_UI}`;
  ctx.fillStyle = C.textDim;
  const gatewayIntro = "Extensions with the network capability can connect to external services via WebSocket or HTTP Server-Sent Events.";
  const gatewayIntroLines = wrapText(gatewayIntro, cw, `14px ${FONT_UI}`);
  for (const line of gatewayIntroLines) {
    ctx.fillText(line, cx, y);
    y += 14 * 1.6;
  }
  y += 16;

  // JSON code block
  const jsonLines = JSON_CODE.split("\n");
  const jsonBlockH = 32 + jsonLines.length * (14 * 1.6) + 32;
  ctx.fillStyle = C.surface0;
  roundRect(cx, y, cw, jsonBlockH, 6);
  ctx.fill();

  let jsonY = y + 16;
  for (const line of jsonLines) {
    drawJsonLine(line, cx + 16, jsonY);
    jsonY += 14 * 1.6;
  }
  y += jsonBlockH + 20;

  // Gateway protocols
  ctx.font = `14px ${FONT_UI}`;
  ctx.fillStyle = C.textDim;
  ctx.fillText("The gateway supports three message protocols:", cx, y);
  y += 14 * 1.6 + 10;

  for (const [name, example] of GATEWAY_PROTOCOLS) {
    ctx.fillStyle = C.pink;
    ctx.fillText(name + ": ", cx + 10, y);
    const nameW = ctx.measureText(name + ": ").width;
    ctx.fillStyle = C.textMuted;
    ctx.font = `14px ${FONT_CODE}`;
    ctx.fillText(example, cx + 10 + nameW, y);
    ctx.font = `14px ${FONT_UI}`;
    y += 14 * 1.6 + 4;
  }
  y += 30;

  // Capabilities table
  ctx.font = `18px ${FONT_UI}`;
  ctx.fillStyle = C.text;
  ctx.fillText("Capabilities Summary", cx, y);
  y += 18 + 16;

  drawTable(cx, y, ["Capability", "What it grants"], CAPABILITIES_TABLE, cw);
}

// ─── Draw Footer ─────────────────────────────────────────────────────────────
function drawFooter() {
  const y = sectionOffsets.footer + 40;

  ctx.textBaseline = "top";
  ctx.textAlign = "center";

  ctx.font = `12px ${FONT_UI}`;
  ctx.fillStyle = C.textMuted;
  ctx.fillText("buster.mom", W / 2, y);

  ctx.font = `11px ${FONT_UI}`;
  ctx.fillText("Built by Hightower Builds", W / 2, y + 20);

  ctx.font = `13px ${FONT_UI}`;
  ctx.fillStyle = C.blue;
  const ghText = "github.com/hightowerbuilds/buster";
  ctx.fillText(ghText, W / 2, y + 40);

  const ghW = ctx.measureText(ghText).width;
  clickables.push({
    x: W / 2 - ghW / 2, y: y + 40, w: ghW, h: 16,
    label: "github-footer",
    action: "link",
    url: "https://github.com/hightowerbuilds/buster",
  });

  const isHover = hoveredLink && hoveredLink.label === "github-footer";
  if (isHover) {
    drawLine(W / 2 - ghW / 2, y + 55, W / 2 + ghW / 2, y + 55, C.blue, 1);
  }

  ctx.textAlign = "left";
}

// ─── Rounded Rectangle Helper ────────────────────────────────────────────────
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Main Render ─────────────────────────────────────────────────────────────
let needsRender = true;

function render() {
  if (!needsRender && !animating) return;
  needsRender = false;

  // Reset clickables each frame
  clickables = [];

  // Update particles if animating
  if (animating) {
    updateParticles();
  }

  // Decay active warp sources
  updateWarps();

  // Clear
  ctx.clearRect(0, 0, W, H);

  // Fill background
  ctx.fillStyle = C.base;
  ctx.fillRect(0, 0, W, H);

  // Draw scrollable content
  ctx.save();
  ctx.translate(0, -scrollY);

  drawHero();
  drawFeatures();
  drawExtensions();
  drawFooter();

  ctx.restore();

  // Pixel-level warp displacement on rendered content
  applyWarpPost();

  // Draw rain over everything (screen space, not scrolled)
  drawRain();

  // Draw fixed top bar on top of rain
  drawTopBar();

  // Rain never stops — always request next frame
  requestAnimationFrame(render);
}

function requestRender() {
  needsRender = true;
  if (!animating) {
    requestAnimationFrame(render);
  }
}

// ─── Scroll Handling ─────────────────────────────────────────────────────────
let scrollAnimId = null;

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  scrollVelocity += e.deltaY;
  if (!scrollAnimId) {
    scrollAnimId = requestAnimationFrame(tickScroll);
  }
}, { passive: false });

function tickScroll() {
  scrollY += scrollVelocity * 0.5;
  scrollVelocity *= 0.85;

  // Clamp
  const maxScroll = Math.max(0, totalContentHeight - H);
  scrollY = Math.max(0, Math.min(scrollY, maxScroll));

  requestRender();

  if (Math.abs(scrollVelocity) > 0.5) {
    scrollAnimId = requestAnimationFrame(tickScroll);
  } else {
    scrollVelocity = 0;
    scrollAnimId = null;
  }
}

// Smooth scroll to a Y position
function smoothScrollTo(targetY) {
  const maxScroll = Math.max(0, totalContentHeight - H);
  targetY = Math.max(0, Math.min(targetY, maxScroll));

  const startY = scrollY;
  const dist = targetY - startY;
  const duration = 600;
  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / duration);
    // Ease out cubic
    const ease = 1 - Math.pow(1 - t, 3);
    scrollY = startY + dist * ease;
    requestRender();
    if (t < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

// ─── Mouse Interaction ──────────────────────────────────────────────────────
canvas.addEventListener("mousemove", (e) => {
  const mx = e.clientX;
  const my = e.clientY;
  let found = null;

  for (const c of clickables) {
    const cy = c.fixed ? c.y : c.y - scrollY;
    if (mx >= c.x && mx <= c.x + c.w && my >= cy && my <= cy + c.h) {
      found = c;
      break;
    }
  }

  if (found !== hoveredLink) {
    hoveredLink = found;
    canvas.style.cursor = found ? "pointer" : "default";
    requestRender();
  }
});

canvas.addEventListener("click", (e) => {
  const mx = e.clientX;
  const my = e.clientY;

  // Check clickable links/nav first
  let handled = false;
  for (const c of clickables) {
    const cy = c.fixed ? c.y : c.y - scrollY;
    if (mx >= c.x && mx <= c.x + c.w && my >= cy && my <= cy + c.h) {
      if (c.action === "link") {
        window.open(c.url, "_blank");
      } else if (c.action === "scroll") {
        const offset = sectionOffsets[c.target] || 0;
        smoothScrollTo(offset - NAV_HEIGHT);
      }
      handled = true;
      break;
    }
  }

  // Warp effect — pixel displacement at click point
  if (!handled) {
    warpSources.push({
      x: mx,
      y: my + scrollY, // content space
      radius: WARP_RADIUS,
      force: WARP_FORCE,
    });
    requestRender();
  }
});

// Touch scrolling for mobile
let touchStartY = 0;
let touchLastY = 0;

canvas.addEventListener("touchstart", (e) => {
  touchStartY = e.touches[0].clientY;
  touchLastY = touchStartY;
  scrollVelocity = 0;
}, { passive: true });

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  const ty = e.touches[0].clientY;
  const delta = touchLastY - ty;
  scrollY += delta;
  touchLastY = ty;

  const maxScroll = Math.max(0, totalContentHeight - H);
  scrollY = Math.max(0, Math.min(scrollY, maxScroll));
  requestRender();
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
  // Simple momentum from last touch delta
  scrollVelocity = (touchLastY - touchStartY) > 0 ? -2 : 2;
  if (Math.abs(scrollVelocity) > 0.5 && !scrollAnimId) {
    scrollAnimId = requestAnimationFrame(tickScroll);
  }
}, { passive: true });

// ─── Font Loading & Init ─────────────────────────────────────────────────────
async function init() {
  // Explicitly load UnifrakturMaguntia so the offscreen canvas can sample it
  try {
    await document.fonts.load('48px "UnifrakturMaguntia"');
    await document.fonts.load('14px "JetBrains Mono"');
    await document.fonts.ready;
  } catch (e) {
    // Continue even if fonts fail -- fallback will be used
  }

  resize();
  initParticles();
  computeLayout();
  requestAnimationFrame(render);
}

init();
