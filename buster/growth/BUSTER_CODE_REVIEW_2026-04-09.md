# Buster IDE -- Comprehensive Code Review

**Date:** 2026-04-09
**Reviewer:** Claude (Opus 4.6)
**Scope:** Full codebase excluding `growth/` folder
**Method:** Every source file read and analyzed without prior context

---

## Severity Rating: This codebase is a prototype wearing the skin of a production application.

What follows is organized by severity tier, from "this will cause data loss or security incidents" down to "this is annoying but survivable."

---

## TIER 1: CRITICAL -- Security & Data Loss Risks

### 1.1 The DAP Client Has a Use-After-Free via Raw Pointer Cast

`src-tauri/src/debugger/client.rs:42-46`:

```rust
let pending = &client.pending as *const Mutex<HashMap<i64, oneshot::Sender<Value>>>;
let pending_ptr = pending as usize;

std::thread::spawn(move || {
    let pending = unsafe { &*(pending_ptr as *const Mutex<...>) };
```

This is **textbook undefined behavior**. You cast a reference to a raw pointer, convert it to a `usize`, move it into a thread, then reconstruct a reference from it. The `DapClient` struct is owned by an `Arc` in `DebugSession`, but the raw pointer doesn't participate in `Arc`'s reference counting. If the `DapClient` is dropped while the reader thread is still running, you have a dangling pointer dereference. This is a **memory safety violation** in what is supposed to be a safe-by-default Rust application. The correct approach is `Arc::clone` on the `pending` map and move the `Arc` into the closure, exactly like the LSP client does.

Further compounding this: `src-tauri/src/debugger/mod.rs:24-25`:

```rust
unsafe impl Send for DapClient {}
unsafe impl Sync for DapClient {}
```

These `unsafe impl` markers are papering over the fact that `DapClient` contains a `Child` process (which is `!Send`) and the raw pointer pattern above. You've disabled the compiler's safety guarantees and introduced UB in the same file. This is the single most dangerous code in the entire repo.

### 1.2 The `fs:scope` Permission Is `**` (All Files)

`src-tauri/capabilities/default.json:18-21`:

```json
{
  "identifier": "fs:scope",
  "allow": [{ "path": "**" }]
}
```

This grants the frontend webview read/write access to **every file on the system**. The workspace validation in `workspace.rs` is a server-side check, but the Tauri FS plugin itself is permissioned to allow any path. If there's ever an XSS vector or a compromised extension, this scope means full filesystem access. A proper scope would restrict to the workspace root dynamically.

### 1.3 Shell Spawn Permission Without Scope Restriction

`capabilities/default.json` grants `shell:allow-spawn` and `shell:allow-stdin-write` without any scope restrictions. This means the frontend can spawn arbitrary processes. Combined with the `**` fs scope, a compromised webview has full system access.

### 1.4 AI Command Safety Blocklist Is Trivially Bypassable

`src-tauri/src/ai/tools.rs:11-47` -- The blocked pattern list uses substring matching on lowercase strings. This is security theater:

- `rm  -rf /` (double space) bypasses `rm -rf /`
- `cat /etc/shadow` is blocked, but `head /etc/shadow` is not
- `cat .env` is blocked, but `less .env`, `more .env`, `vim .env`, `python3 -c "print(open('.env').read())"` all pass
- `eval ` is blocked, but `e\val` via shell escaping is not
- `$(` is blocked, which means the agent **cannot run any command containing dollar signs**, including `npm install $PACKAGE` or `echo $PATH` -- this is overly broad in one direction and useless in the other
- The blocklist catches `source ` which blocks `source .bashrc` but not `. .bashrc` (POSIX source syntax)

This is the worst of both worlds: it breaks legitimate use cases while providing zero real security against a determined prompt injection attack.

### 1.5 No `didClose` Notifications Sent to LSP Servers

When a tab is closed, the frontend never calls `lsp_did_close`. The LSP servers keep accumulating open documents in memory, leading to increasing memory consumption over time. For large workspaces with many files opened and closed, this is a slow memory leak on the LSP server side.

### 1.6 Session Backup Uses `DefaultHasher` for Path Hashing

`src-tauri/src/commands/session.rs:48-52`:

```rust
pub fn hash_path(path: &str) -> String {
    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}
```

`DefaultHasher` is not guaranteed to be stable across Rust versions. If the Rust toolchain is updated and the hash algorithm changes, all existing backup files become orphaned -- the app will look for them under different keys and not find them. Use a stable hash like SHA-256 or a fixed SipHash seed.

---

## TIER 2: SERIOUS -- Architectural Problems

### 2.1 The CRDT Is Not a CRDT

`src-tauri/src/collab/crdt.rs` is labeled "TextCrdt" but implements basic operational transformation (OT), not a CRDT. The `transform` function handles pairwise transformation of two operations, but:

- There's no vector clock or logical timestamps
- There's no convergence proof or even an attempt at one
- The `transform` function has a **known bug**: `Insert vs Delete` case at line 97-99 returns `Operation::Delete { pos: rp + 0, len: *rl }` -- the comment says "shift forward" but the code adds zero. This means concurrent insert+delete operations will produce **divergent document states** across clients.
- The history cap (`drain(..500)` at 1000 entries) means you can never OT-transform against operations older than 500 -- any late-arriving operation will corrupt the document.

If you ever connect two real clients to this, **they will see different text** after concurrent edits. This is not usable for collaborative editing.

### 2.2 The Editor Engine Is Byte-Offset Based But Treats Characters as Single-Width

`src/editor/engine.ts` stores cursor positions as `{line, col}` where `col` is a character index. But `canvas-renderer.ts` renders with `charWidth * col` for positioning. This means:

- CJK characters (which are double-width) will have cursors positioned at the wrong location
- Emoji (which may be multi-codepoint via ZWJ sequences) will cause cursor desync
- Tab characters are expanded to spaces in `displayRows` but the cursor position doesn't account for this in all code paths

The engine test suite has zero tests for non-ASCII content.

### 2.3 No Incremental Parsing -- Full Document Rehighlight on Every Change

`src/editor/CanvasEditor.tsx` calls `highlightCode` (which calls Rust tree-sitter) on every text change via `debouncedHighlight` with a 100ms debounce. But the Rust side (`src-tauri/src/syntax/mod.rs:444`) creates a **new `Highlighter` instance** and **reparses the entire document from scratch** every time. Tree-sitter was designed for incremental parsing -- you're supposed to call `edit()` on the tree and reparse only the changed range. By reparsing the full document every time, you're throwing away tree-sitter's primary advantage. For a 10,000-line file, this means reparsing ~500KB of text on every keystroke (after debounce), which will be noticeable.

### 2.4 Full Document Sync for LSP Changes

`src-tauri/src/lsp/client.rs:280-285`:

```rust
pub fn did_change(&self, uri: &str, version: i32, text: &str) -> Result<(), String> {
    self.send_notification("textDocument/didChange", serde_json::json!({
        "textDocument": { "uri": uri, "version": version },
        "contentChanges": [{ "text": text }]
    }))
}
```

You're sending the **entire file content** on every keystroke. The LSP spec supports incremental sync (`TextDocumentSyncKind.Incremental`) where you only send the changed range. For large files, you're sending hundreds of KB over a pipe on every character typed.

### 2.5 `Box::leak` for Syntax Highlight Configurations

`src-tauri/src/syntax/mod.rs:62`:

```rust
Box::leak(Box::new(config))
```

Every `HighlightConfiguration` is leaked into static memory and never freed. This is intentional (to get a `&'static` reference), but it means the syntax service can never be properly cleaned up or reconfigured. If you ever need to reload grammars or change highlight queries, you'll leak the old configurations. The correct approach is to use `Arc` or store owned configs with lifetime management.

### 2.6 The Extension WASM Runtime Spawns a Thread That Runs Forever

`src-tauri/src/extensions/runtime.rs:138-143`:

```rust
let epoch_engine = engine.clone();
std::thread::spawn(move || {
    loop {
        std::thread::sleep(std::time::Duration::from_millis(100));
        epoch_engine.increment_epoch();
    }
});
```

This thread runs forever. Every time `WasmRuntime::new()` is called (once per extension load), a new eternal thread is spawned. There's no cancellation mechanism. If you load and unload extensions repeatedly, you accumulate zombie epoch ticker threads.

### 2.7 The Terminal Sends Complete Screen State as JSON Events

`src-tauri/src/terminal/mod.rs` serializes the entire terminal grid (every cell with character, fg/bg colors, bold, italic, underline, inverse) as JSON and sends it over the Tauri event bridge. For a 120x40 terminal, that's 4,800 cells, each with 7 fields. Even with the delta mechanism, a full screen redraw (e.g., running `ls` on a large directory, or `cat`ing a file) serializes thousands of cells into JSON, sends them over IPC, deserializes them on the frontend, then renders them to canvas. This is an enormous amount of serialization overhead for what should be a stream of bytes into a terminal emulator.

---

## TIER 3: SIGNIFICANT -- Code Quality Issues

### 3.1 Massive Code Duplication in LSP Command Handlers

`src-tauri/src/commands/lsp.rs` is 719 lines of nearly identical boilerplate. Every function follows the same pattern:

```rust
let ext = ext_from_path(&file_path).ok_or("No extension")?;
let lang_id = language_id_for_ext(&ext).ok_or("Unsupported language")?;
let uri = uri_from_path(&file_path);
let rx = lsp.get_client(lang_id, |client| { client.XXX(&uri, ...) })?;
let resp = timeout(Duration::from_secs(LSP_TIMEOUT_SECS), rx).await...?;
// parse result JSON manually
```

This pattern is repeated **10 times** with minor variations. A generic `lsp_request` helper would eliminate hundreds of lines.

### 3.2 Manual JSON Parsing Throughout the Codebase

The entire LSP response parsing layer uses raw `serde_json::Value` manipulation:

```rust
let result = resp.get("result").unwrap_or(&serde_json::Value::Null);
if let Some(contents) = result.get("contents") {
    if let Some(s) = contents.as_str() { ... }
    else if let Some(obj) = contents.as_object() {
        obj.get("value").and_then(|v| v.as_str())...
```

This is extremely fragile. A single typo in a field name silently returns empty data. Use `serde` derive macros with proper LSP type definitions (the `lsp-types` crate is already a dependency but barely used).

### 3.3 The `server_registry()` Function Allocates a New HashMap on Every Call

`src-tauri/src/lsp/mod.rs:9-38` -- `server_registry()` creates a new `HashMap` with ~30 entries every time it's called. It's called from `language_id_for_ext()` (which is called on every LSP operation) and from `ensure_server()`. Use a `lazy_static` or `OnceLock` to initialize once.

### 3.4 `theme.ts` Reimplements HSL-to-RGB and CSS Color Parsing

`src/lib/theme.ts` is 546 lines that includes hand-rolled `hslToRgb`, `rgbToHsl`, `hexToRgb`, `parseColor` functions. These are well-known algorithms available in any color library. The hand-rolled versions have subtle rounding issues and don't handle edge cases (e.g., `parseColor` only handles `#RRGGBB`, `#RGB`, `rgb()`, `hsl()` -- no `rgba()`, `hsla()`, named colors, or `oklch()`).

### 3.5 The `AppState` Signal Bridge Is a Leaky Abstraction

`src/lib/app-state.ts` creates a set of SolidJS signals that mirror the BusterContext. Then `src/lib/BusterProvider.tsx` syncs the context to these signals. This means state exists in two places -- the context and the signals -- and changes have to be propagated between them. Multiple components use the signals directly while others use the context, creating an inconsistent access pattern.

### 3.6 Test Assertions Against Empty Strings

Throughout the test suite:
```typescript
expect(engine.text()).toBe("");
```

These pass trivially. Many "tests" assert that a newly constructed engine is empty, which tests the test setup, not the engine.

### 3.7 No Error Boundaries in the Component Tree

The entire SolidJS component tree in `App.tsx` has no error boundaries. If any component throws during rendering (e.g., a null reference in canvas rendering), the entire IDE crashes to a white screen with no recovery path.

---

## TIER 4: MODERATE -- Design Smell & Missing Pieces

### 4.1 The Collab Module Has No Network Transport

`src-tauri/src/collab/` implements a local-only CRDT. There's no WebSocket server, no signaling, no peer discovery, no networking of any kind. The `CollabManager` manages sessions that only ever have one client (itself). The IPC commands (`collab_insert`, `collab_delete`, etc.) are exposed to the frontend but there's no way for a second client to connect. This is dead code pretending to be a feature.

### 4.2 The Remote SSH Module Is Blocking Inside Sync Mutexes

`src-tauri/src/remote/mod.rs` -- Every SSH operation (`connect`, `list_directory`, `read_file`, `write_file`, `exec_command`) holds a `Mutex` lock while performing network I/O. The SFTP operations can take seconds on slow connections. Since these are called from Tauri command handlers (which run on the async runtime), blocking inside a sync `Mutex` blocks a tokio worker thread, degrading the entire app's responsiveness.

### 4.3 The Debugger Module Doesn't Forward Events to Frontend

`src-tauri/src/debugger/client.rs:78`:

```rust
// Events (stopped, terminated, etc.) are logged but not yet forwarded
// TODO: emit events to frontend via Tauri event system
```

The debugger can set breakpoints and launch, but **can't actually tell the frontend when execution stops at a breakpoint**. The entire debug stepping experience is fundamentally broken because the UI never receives "stopped" events.

### 4.4 Browser View "Hide" Uses Position Hack

`src-tauri/src/browser.rs:155`:

```rust
webview.set_position(tauri::LogicalPosition::new(-10000.0_f64, -10000.0_f64))
```

Hiding a browser view by moving it 10,000 pixels offscreen. This is a hack. The webview is still loaded and consuming resources. Use Tauri's webview visibility API if available, or actually close and recreate on show.

### 4.5 `read_binary_file` Loads Entire Files into Memory

`src-tauri/src/commands/file.rs:203-243` reads the entire binary file into memory, base64 encodes it (1.33x size expansion), wraps it in a data URL, and sends it over IPC. For a 100MB video file, this allocates ~133MB on the Rust side, then ~266MB in JSON serialization, then ~266MB in the frontend. There's no size limit check.

### 4.6 Git Operations Are All Synchronous Shell Calls

`src-tauri/src/commands/git.rs` shells out to `git` via `Command::new("git")` for every operation. These are synchronous `output()` calls that block the calling thread. Operations like `git log --all` on a large repo can take seconds. Since several of these are called from sync Tauri commands without async wrappers, they block tokio worker threads.

### 4.7 The `workspace_search` Command Shells Out to `grep`

`src-tauri/src/commands/search.rs` and `src-tauri/src/ai/tools.rs` both shell out to `grep` for searching. The `grep` command uses `--include=*.{ts,tsx,js,jsx,rs,py,json,css,html,md}` which is a bash glob expansion -- this won't work on systems where `grep` doesn't support brace expansion (notably, macOS's BSD grep doesn't). The `ignore` crate (already a dependency) would be the correct tool here.

### 4.8 Canvas Rendering Doesn't Use `devicePixelRatio` Consistently

`src/editor/canvas-renderer.ts` sets up DPI scaling in `renderEditor()` but the minimap rendering, selection highlights, and diagnostic underlines all use different coordinate spaces. Some multiply by `dpr`, others don't. This will cause blurry rendering on high-DPI displays for some visual elements.

### 4.9 The WebGL Text Renderer Is Never Used

`src/editor/webgl-text.ts` (263 lines) implements an instanced WebGL text renderer with a glyph atlas. It's imported nowhere. It's dead code.

### 4.10 `PanelLayout.tsx` Supports 7 Layout Modes, All with Hardcoded Slot Assignments

The layout system supports "tabs", "columns", "grid", "trio", "quint", "restack", and "hq" modes. Each mode has hardcoded slot assignments (e.g., trio has slots 0-2 in fixed positions). But the slot assignment uses `tabs[index]` with no bounds checking. If the user has 2 tabs open in "quint" mode (which expects 5+), slots 2-4 render empty `<div>`s with "Drop a tab here" -- but there's no drag-to-slot functionality to actually fill them.

---

## TIER 5: MINOR -- Nits & Polish

### 5.1 Inconsistent Error Handling Style

The Rust codebase uses three different error patterns:
1. `Result<T, String>` (most commands)
2. Silently swallowing errors with `unwrap_or_default()` (git commands)
3. `unwrap_or_else(|e| e.into_inner())` for poisoned mutexes (everywhere)

The mutex poison recovery is especially concerning -- if a thread panicked while holding a lock, the data may be in an inconsistent state, but every single `unwrap_or_else(|e| e.into_inner())` call just proceeds as if nothing happened.

### 5.2 The CI Workflow Doesn't Build the Actual Tauri Application

`.github/workflows/ci.yml` runs `cargo check` and `cargo test` for the backend, and `npm run build` for the frontend. But it never runs `tauri build`, which means it never tests that the frontend and backend actually link together. IPC contract breakage between frontend and backend would not be caught.

### 5.3 No Linter, No Formatter, No Pre-Commit Hooks

There's no ESLint, no Prettier, no `rustfmt` configuration, no pre-commit hooks. The code style is inconsistent: some files use single quotes, others double; some use trailing commas, others don't; some Rust functions have doc comments, most don't.

### 5.4 The `buster-format` Extension References Formatters That May Not Exist

`extensions/buster-format/src/lib.rs` tries to run `prettier`, `rustfmt`, `black`, `gofmt` via `host_run_command`. If these aren't installed, the extension silently fails. There's no capability checking or helpful error messages.

### 5.5 `package.json` Has Both `bun.lock` and `package-lock.json`

The repo contains both `bun.lock` and `package-lock.json`, but `tauri.conf.json` uses `bun run dev` / `bun run build`. The CI workflow uses `npm ci`. This means CI and development may be using different dependency resolutions.

### 5.6 The Guided Tour Has a Matrix Rain Effect

`src/ui/tour-matrix-rain.ts` is 120 lines of Matrix-style green character rain for the welcome screen. This is purely cosmetic and consumes CPU/GPU continuously while visible. Given the stated design philosophy of minimal UI, an animated effect seems contradictory.

### 5.7 Font Handling Is Inconsistent

The CSS uses `"Courier New", Courier, monospace` everywhere (per user preference), but `canvas-renderer.ts` uses `"JetBrains Mono", monospace` for the editor canvas. The `@fontsource/jetbrains-mono` package is installed but `@fontsource/unifrakturmaguntia` is also imported -- this is a blackletter/Fraktur font with no apparent use anywhere in the codebase.

### 5.8 `skills-lock.json` Is Committed but `.claude/` Is Gitignored

The `.gitignore` excludes `.claude/` (which is correct for Claude Code config), but `skills-lock.json` is not gitignored and is tracked. This is a development tool artifact that shouldn't be in the repo.

---

## TIER 6: STRUCTURAL OBSERVATIONS

### 6.1 Feature Surface Area vs. Maturity

This codebase attempts to implement: a canvas-based text editor engine, syntax highlighting via tree-sitter, LSP client for 20+ languages, terminal emulator, AI coding agent with tool use, WASM extension system with sandboxing, WebSocket/SSE gateway for extensions, SSH remote development, collaborative editing with CRDT, Debug Adapter Protocol client, embedded browser, Git integration (status, diff, blame, graph, branches, stash, remotes, conflict resolution), GitHub CLI integration, session persistence with crash recovery, 7 layout modes, command palette with fuzzy search, theme engine with HSL manipulation, file watcher with debounce, large file support via mmap, keyboard shortcut system, guided tour, blog preview, image viewer, and performance benchmarking.

That's **30+ major features** in what appears to be a solo-developer project. The breadth is remarkable, but the depth is paper-thin. Almost every feature works in the happy path but has fundamental issues:

- The CRDT doesn't converge
- The debugger doesn't forward events
- The collab system has no network
- The remote SSH module blocks async threads
- The AI agent's safety blocklist is bypassable
- The extension runtime leaks threads
- The LSP client sends full documents on every change
- The syntax highlighter discards tree-sitter's incremental parsing

### 6.2 The Test Suite Tests Mostly Trivial Cases

There are ~150 test cases across the codebase. The majority test construction (`*_starts_empty`, `*_new`), serialization roundtrips, and simple string operations. The complex logic -- canvas rendering, LSP response parsing, terminal screen diffing, extension sandboxing, AI agent loop, OT transformation -- has minimal or no test coverage.

### 6.3 No Telemetry, No Logging Framework, No Crash Reporting

The only logging mechanism is `eprintln!` scattered through the Rust code. There's no structured logging (no `tracing` or `log` crate), no crash reporting, and no way to diagnose issues in production. The `AuditLogger` logs AI agent actions to `~/.buster/ai-audit.jsonl` but nothing else in the application is logged anywhere.

---

## Summary

**What's impressive:** The architectural vision is genuinely ambitious. The canvas-based editor approach, WASM extension system with capability-based sandboxing, and the gateway pattern for connecting extensions to external agent services are all interesting ideas. The breadth of Tauri IPC bindings is comprehensive. The on-demand rendering discipline (avoiding rAF loops) is correct.

**What's dangerous:** The DAP client's raw pointer UB, the filesystem scope being `**`, the shell spawn permission without restrictions, and the bypassable command blocklist create real security and safety risks.

**What needs to happen before this ships:** Fix the UB in the debugger. Restrict Tauri permissions to the workspace. Replace the command blocklist with a proper sandbox (or at minimum, an allowlist approach). Implement incremental sync for both syntax highlighting and LSP. Add error boundaries. Either finish the collab/remote/debugger features or remove them entirely -- half-implemented features are worse than missing features because they create a false sense of capability.
