# Buster Extensions

Extensions add capabilities to Buster through WASM-sandboxed modules. They can render custom UI surfaces, control embedded browser webviews, connect to agent gateways, register commands, and interact with the workspace — all isolated from the host.

## Architecture

```
~/.buster/extensions/
  ext-rust-browser/
    extension.toml    # Manifest — declares capabilities, commands, services
    extension.wasm    # WASM binary (optional — manifest-only extensions work too)
  ext-rust-pixel/
    extension.toml
    extension.wasm
```

Extensions are discovered by scanning `~/.buster/extensions/`. Each extension lives in its own directory with an `extension.toml` manifest and an optional `extension.wasm` binary.

## Manifest Format

```toml
[extension]
id = "ext-rust-browser"
name = "Browser"
version = "0.2.0"
description = "Embedded browser with dev tools"
runtime = "bare"          # "bare" (default) or "wasi"

[capabilities]
render_surface = true     # Request and paint to canvas surfaces
browser_control = true    # Create/control embedded browser webviews
notifications = true      # Show notifications to the user
network = true            # Connect to external gateways (optional)

[[commands]]
id = "launch_browser"
label = "Launch"
kind = "launch"           # "launch" = button on card, "palette" = command palette only, "action" = internal

[[commands]]
id = "on_click"
label = "Click"
kind = "action"

[[services]]
id = "gateway"
label = "ZeroClaw Gateway"
auto_start = false
```

## Capabilities

Extensions declare what they need. The host enforces these — an extension without `network = true` cannot open gateway connections.

| Capability | What it allows |
|---|---|
| `render_surface` | Request and paint to canvas surfaces via display list commands |
| `browser_control` | Create, navigate, resize, show, hide, close, and eval JS in embedded browser webviews |
| `network` | Open WebSocket or HTTP SSE gateway connections |
| `workspace_read` | Read files within the current workspace |
| `workspace_write` | Write files within the current workspace |
| `commands` | Execute shell commands (sandboxed to workspace) |
| `terminal` | Access the terminal system |
| `notifications` | Show toast notifications to the user |

## Surface System

Extensions with `render_surface = true` can request canvas surfaces that appear as tabs in the IDE:

1. Extension calls `host_request_surface(width, height, label)` — returns a surface ID
2. Host emits a "surface-created" event to the frontend
3. Frontend creates a new tab with a `DisplayListSurface` component (canvas + input forwarding)
4. Extension calls `host_paint(surface_id, json_commands)` to render display list commands to the canvas
5. Frontend forwards mouse clicks, key presses, and mouse moves back to the extension via `extCall(extension_id, "on_click", ...)` etc.
6. When the surface container resizes, the frontend calls `extCall(extension_id, "on_resize", {width, height, abs_x, abs_y})`

The surface system supports dynamic resize, tab switching (hide/show via `IntersectionObserver`), and proper cleanup on tab close.

## Browser Webview Control

Extensions with `browser_control = true` can create native Tauri child webviews that overlay the canvas surface:

| Host function | Purpose |
|---|---|
| `host_create_browser(url, x, y, w, h)` | Create a webview at the given position |
| `host_navigate_browser(id, url)` | Navigate to a URL |
| `host_resize_browser(id, x, y, w, h)` | Reposition and resize |
| `host_show_browser(id)` / `host_hide_browser(id)` | Show/hide |
| `host_close_browser(id)` | Close and destroy |
| `host_eval_browser(id, js)` | Execute JavaScript and get the result |

Browser webviews are native OS views that always render on top of the canvas. The extension is responsible for positioning them correctly relative to its chrome UI.

When an extension is unloaded, all its browser webviews are automatically closed. Tab switching hides/shows all browser webviews via `hideAllBrowserViews` / `showAllBrowserViews`.

## Command Kinds

Commands in `extension.toml` declare a `kind` that controls how they appear:

| Kind | Behavior |
|------|----------|
| `"launch"` | Renders a button on the extension card in the Extensions page. Clicking opens a new tab. |
| `"palette"` | Only appears in the command palette (Cmd+Shift+P). This is the default. |
| `"action"` | Internal command for input forwarding (click, key, resize, mouse_move). Not shown to users. |

## Gateway Connections

The gateway system is transport-agnostic. Extensions connect through normalized configs:

### WebSocket (ZeroClaw, custom agents)

```typescript
const connId = await connectGateway("zeroclaw", {
  protocol: "websocket",
  url: "ws://localhost:42617/ws/chat?session_id=buster&token=xxx",
});
```

### HTTP SSE (Hermes, OpenAI-compatible)

```typescript
const connId = await connectGateway("hermes", {
  protocol: "http-sse",
  url: "http://localhost:8080/v1/chat/completions",
  auth_token: "your-api-key",
  auth_header: "Authorization",  // default
});
```

### Normalized Events

All gateway events are normalized regardless of transport or protocol:

```typescript
interface GatewayEvent {
  connection_id: number;
  extension_id: string;
  kind: "connected" | "text" | "tool_call" | "tool_result" | "done" | "error" | "disconnected";
  content: string;
  tool_name: string | null;
}
```

The host automatically parses:
- **ZeroClaw protocol** — `{type: "chunk", data: "..."}` to `{kind: "text", content: "..."}`
- **OpenAI SSE** — `data: {choices: [{delta: {content: "..."}}]}` to `{kind: "text", content: "..."}`
- **Agent Communication Protocol (ACP)** — `{status: "completed"}` to `{kind: "done"}`

New protocols can be added without changing existing extensions.

## WASM Extension API

Extensions that need custom logic compile to WASM (target `wasm32-unknown-unknown`). The WASM module communicates with the host through imported/exported functions.

### Exported Functions (extension implements)

```rust
// Required
#[no_mangle]
pub extern "C" fn activate() -> i32;        // 0 = success. Initialize state only — don't open surfaces.

// Optional
#[no_mangle]
pub extern "C" fn deactivate();

// Memory management (required for host-to-guest data passing)
#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8;

#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, len: usize);

// Command functions — declared in extension.toml, called by name
#[no_mangle]
pub extern "C" fn my_command(ptr: *const u8, len: usize) -> i32;
```

### Imported Functions (host provides)

```rust
// Imported from "buster" module
extern "C" {
    // Logging and notifications
    fn log(level: i32, ptr: *const u8, len: usize);
    fn notify(title_ptr: *const u8, title_len: usize, msg_ptr: *const u8, msg_len: usize);
    fn set_return(ptr: *const u8, len: usize);

    // Surface rendering
    fn host_request_surface(w: i32, h: i32, label_ptr: *const u8, label_len: usize) -> i32;
    fn host_paint(surface_id: i32, json_ptr: *const u8, json_len: usize) -> i32;
    fn host_resize_surface(surface_id: i32, w: i32, h: i32) -> i32;
    fn host_release_surface(surface_id: i32) -> i32;

    // Text measurement (via Pretext on the frontend)
    fn host_measure_text(text_ptr: *const u8, text_len: usize, font_ptr: *const u8, font_len: usize) -> i32;

    // Workspace file access
    fn host_read_file(path_ptr: *const u8, path_len: usize) -> i32;

    // Browser webview control
    fn host_create_browser(url_ptr: *const u8, url_len: usize, x: f64, y: f64, w: f64, h: f64) -> i32;
    fn host_navigate_browser(id: i32, url_ptr: *const u8, url_len: usize) -> i32;
    fn host_resize_browser(id: i32, x: f64, y: f64, w: f64, h: f64) -> i32;
    fn host_show_browser(id: i32) -> i32;
    fn host_hide_browser(id: i32) -> i32;
    fn host_close_browser(id: i32) -> i32;
    fn host_eval_browser(id: i32, js_ptr: *const u8, js_len: usize) -> i32;
}
```

### Manifest-Only Extensions

Extensions that only need gateway connections don't need a WASM binary at all. Just create an `extension.toml` with `network = true` and use the frontend API to manage connections. The WASM binary is only needed for custom activation logic, surface rendering, browser control, or other programmatic behavior.

## Frontend API

```typescript
import {
  listExtensions,
  loadExtension,
  unloadExtension,
} from "../lib/extension-host";

import {
  extCall,
  extInstall,
  extUninstall,
  connectGateway,
  sendToGateway,
  disconnectGateway,
} from "../lib/ipc";

// List available extensions
const extensions = await listExtensions();

// Load an extension (activates WASM)
await loadExtension("ext-rust-browser");

// Call a command on a loaded extension
await extCall("ext-rust-browser", "launch_browser", "{}");

// Unload (deactivates WASM, closes browser webviews, releases surfaces)
await unloadExtension("ext-rust-browser");
```

## Building Your Own

1. Create `~/.buster/extensions/my-extension/extension.toml`
2. Declare capabilities and commands (use `kind = "launch"` for a button on the extension card)
3. Compile a WASM binary from Rust (see [Ext-Rust](https://github.com/hightowerbuilds/ext-rust) for examples)
4. Copy `extension.wasm` alongside `extension.toml`
5. Open Buster — the extension appears in the Extensions page

For Rust extensions, the `buster-ext-shared` crate provides display list types, host function wrappers, and a bump allocator. See the Ext-Rust repository for three working examples (browser, pixel-editor, stacker).
