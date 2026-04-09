# Buster Extensions

Extensions add capabilities to Buster through WASM-sandboxed modules. They can connect to agent gateways, register commands, and interact with the workspace — all isolated from the host.

## Architecture

```
~/.buster/extensions/
  zeroclaw/
    extension.toml    # Manifest — declares capabilities, commands, services
    extension.wasm    # WASM binary (optional — manifest-only extensions work too)
  hermes/
    extension.toml
    extension.wasm
```

Extensions are discovered by scanning `~/.buster/extensions/`. Each extension lives in its own directory with an `extension.toml` manifest and an optional `extension.wasm` binary.

## Manifest Format

```toml
[extension]
id = "zeroclaw"
name = "ZeroClaw Gateway"
version = "0.1.0"
description = "Connect to ZeroClaw AI agent gateway"

[capabilities]
network = true            # Connect to external gateways
workspace_read = true     # Read files in the workspace
workspace_write = true    # Write files in the workspace
commands = true           # Execute shell commands (sandboxed)
notifications = true      # Show notifications to the user

[[services]]
id = "gateway"
label = "ZeroClaw Gateway"
auto_start = false

[[commands]]
id = "zeroclaw.connect"
label = "Connect to ZeroClaw"

[[commands]]
id = "zeroclaw.disconnect"
label = "Disconnect ZeroClaw"
```

## Capabilities

Extensions declare what they need. The host enforces these — an extension without `network = true` cannot open gateway connections.

| Capability | What it allows |
|---|---|
| `network` | Open WebSocket or HTTP SSE gateway connections |
| `workspace_read` | Read files within the current workspace |
| `workspace_write` | Write files within the current workspace |
| `commands` | Execute shell commands (sandboxed to workspace) |
| `terminal` | Access the terminal system |
| `notifications` | Show toast notifications to the user |

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
- **ZeroClaw protocol** — `{type: "chunk", data: "..."}` → `{kind: "text", content: "..."}`
- **OpenAI SSE** — `data: {choices: [{delta: {content: "..."}}]}` → `{kind: "text", content: "..."}`
- **Agent Communication Protocol (ACP)** — `{status: "completed"}` → `{kind: "done"}`

New protocols can be added without changing existing extensions.

## WASM Extension API

Extensions that need custom logic compile to WASM (target `wasm32-unknown-unknown`). The WASM module communicates with the host through imported/exported functions.

### Exported Functions (extension implements)

```rust
// Required
#[no_mangle]
pub extern "C" fn activate() -> i32;        // 0 = success

// Optional
#[no_mangle]
pub extern "C" fn deactivate();

#[no_mangle]
pub extern "C" fn on_event(ptr: *const u8, len: usize);

// Memory management (required if using host→guest data)
#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8;

#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, len: usize);
```

### Imported Functions (host provides)

```rust
// Imported from "buster" module
extern "C" {
    fn log(level: i32, ptr: *const u8, len: usize);
    fn notify(title_ptr: *const u8, title_len: usize, msg_ptr: *const u8, msg_len: usize);
    fn set_return(ptr: *const u8, len: usize);  // Set return value for host calls
}
```

### Manifest-Only Extensions

Extensions that only need gateway connections don't need a WASM binary at all. Just create an `extension.toml` with `network = true` and use the frontend API to manage connections. The WASM binary is only needed for custom activation logic, event processing, or other programmatic behavior.

## Frontend API

```typescript
import {
  initExtensionHost,
  listExtensions,
  loadExtension,
  unloadExtension,
  connectGateway,
  sendToGateway,
  disconnectGateway,
  onGatewayEvent,
} from "../lib/extension-host";

// Initialize once at startup
await initExtensionHost();

// List available extensions
const extensions = await listExtensions();

// Load an extension
await loadExtension("zeroclaw");

// Connect to its gateway
const connId = await connectGateway("zeroclaw", {
  protocol: "websocket",
  url: "ws://localhost:42617/ws/chat?token=xxx",
});

// Listen for events
const unsub = onGatewayEvent("zeroclaw", (event) => {
  if (event.kind === "text") console.log(event.content);
  if (event.kind === "done") console.log("Response complete");
});

// Send a message
await sendToGateway(connId, JSON.stringify({
  type: "message",
  content: "Hello from Buster",
}));

// Disconnect
await disconnectGateway(connId);
unsub();
```

## Building Your Own

1. Create `~/.buster/extensions/my-agent/extension.toml`
2. Declare capabilities and commands
3. Optionally compile a WASM binary from Rust/C/Go
4. Restart Buster — the extension appears in the extensions list

The system is gateway-agnostic: ZeroClaw, Hermes, or any custom agent that speaks WebSocket or HTTP SSE works without changes to the core.
