# Buster Crane — Build Roadmap

A core document for building the Crane extension for Buster IDE. This document defines the system rules, delegates to faculty documents, and provides the step-by-step roadmap from zero to a shippable extension.

---

## System Rules

1. **Crane is an extension, not a core feature.** It installs to `~/.buster/extensions/crane/`, follows the existing extension.toml manifest format, and uses the existing WASM + gateway architecture. No modifications to Buster's core are required unless explicitly noted.

2. **Local-first, always.** All data fetched by agents lives in `{app_data}/crane/`. No cloud sync. No telemetry. Tokens stored in `keyring`. The user owns their data.

3. **Progressive disclosure.** The extension starts simple (connect a service, see messages) and layers in complexity (context awareness, cross-agent search, composability) only as the user opts in.

4. **One protocol, many services.** The Agent Gateway Protocol normalizes all external services into a single event shape. Adding a new service means writing an adapter, not changing the core.

5. **Bash-first automation.** All build scripts, CI pipelines, setup tooling, and developer utilities are written in defensive Bash following the bash-pro standard (see Faculty: Bash Automation below). No Python/Node scripts for tooling.

6. **Ship incrementally.** Each phase produces a usable artifact. Phase 1 is a working Discord agent. Phase 2 adds Gmail. Each phase can be released independently.

---

## Faculty Documents

This core document delegates to the following faculty documents. Each faculty is a self-contained specification for one aspect of the system.

| Faculty | Document | Responsibility |
|---------|----------|---------------|
| Protocol | `crane-protocol.md` | Agent Gateway Protocol spec, event shapes, connection lifecycle |
| Store | `crane-store.md` | Local data store API, SQLite schema, query interface, TTL, migrations |
| Agents | `crane-agents.md` | Per-service agent specs (Discord, Gmail, Telegram, RSS), auth flows, data mappings |
| UI | `crane-ui.md` | Unified feed panel, filtering, search, quick actions, theming |
| Security | `crane-security.md` | Token management, capability enforcement, sandboxing, audit logging |
| Bash Automation | `crane-bash.md` | Build scripts, CI/CD, test harnesses, release tooling |

These documents do not exist yet. They are created as each phase begins. This core document defines what goes in each.

---

## What Already Exists (Buster Extension System)

Crane builds on top of a mature extension system:

### Extension Lifecycle
- **Discovery**: Buster scans `~/.buster/extensions/` for directories containing `extension.toml`
- **Manifest**: TOML file declaring id, name, version, capabilities, services, commands
- **Load**: WASM binary instantiated via Wasmtime with sandboxed memory
- **Activate**: Extension's exported `activate()` function called
- **Gateway**: Extension can open WebSocket or HTTP SSE connections via `ext_gateway_connect`
- **Events**: Gateway normalizes incoming data (ZeroClaw, OpenAI SSE, ACP protocols) into unified `GatewayEvent` shape, emitted to frontend via Tauri events
- **Methods**: Host can call any exported WASM function via `ext_call(id, method, params)`
- **Unload**: `deactivate()` called, gateway connections closed, instance removed
- **Install/Uninstall**: Copy directory to/from `~/.buster/extensions/{id}/`, re-scan

### Host Functions Available to Extensions (FFI)
| Function | Capability Required | Purpose |
|----------|-------------------|---------|
| `log(level, ptr, len)` | none | Debug logging to stdout |
| `notify(title, msg)` | `notifications` | Show toast notification |
| `host_read_file(path)` | `workspace_read` | Read a workspace file |
| `host_write_file(path, content)` | `workspace_write` | Write a workspace file |
| `host_list_directory(path)` | `workspace_read` | List directory contents |
| `set_return(ptr, len)` | none | Set return value for method calls |

### Gateway Protocols Already Supported
| Protocol | Transport | Used By |
|----------|-----------|---------|
| ZeroClaw | WebSocket | Custom agents |
| OpenAI SSE | HTTP SSE | LLM streaming |
| ACP | REST/SSE | Agent Communication Protocol |

### Frontend API (extension-host.ts)
```
listExtensions()           → ExtensionInfo[]
loadExtension(id)          → ExtensionInfo
unloadExtension(id)        → void
connectGateway(id, config) → connectionId
sendToGateway(connId, msg) → void
disconnectGateway(connId)  → void
callExtension(id, method)  → string
onGatewayEvent(id, handler)→ unsubscribe fn
```

---

## What Crane Needs to Add

### 1. Local Data Store (New Host Function)

The existing FFI has workspace file I/O but no structured data storage. Crane needs:

```
host_store_put(key_ptr, key_len, value_ptr, value_len) -> i32
host_store_get(key_ptr, key_len) -> i32
host_store_query(filter_ptr, filter_len) -> i32
host_store_delete(key_ptr, key_len) -> i32
host_store_count(filter_ptr, filter_len) -> i32
```

Backed by per-extension SQLite at `{app_data}/crane/{extension_id}/store.db`.

This requires a small addition to Buster's core (`runtime.rs`) — a new `store` capability and five new host functions. This is the **only core modification**.

### 2. Agent Manifest Section

Extend extension.toml with an `[agent]` section:

```toml
[agent]
type = "persistent"          # "persistent" (WebSocket) or "polling" (interval)
service = "discord"           # service identifier
data_types = ["message", "thread", "mention"]
refresh = "websocket"         # "websocket", "sse", "polling"
poll_interval = 30            # seconds, only for polling type

[[secrets]]
id = "discord_bot_token"
label = "Discord Bot Token"
required = true
```

The `[agent]` section is parsed by Crane's WASM code, not by Buster core. The manifest parser ignores unknown sections, so no core change needed.

### 3. Token Management

Buster already has `keyring` for secure storage (`store_api_key` / `load_api_key` in commands). Crane agents use this same mechanism with namespaced keys: `crane.discord.bot_token`, `crane.gmail.oauth_token`, etc.

### 4. Unified Feed Panel

A SolidJS component rendered when the Crane extension is active. Uses TanStack Query to read from the local store via `ext_call("crane", "query_feed", params)`. Themed to match Buster, Courier New, no bold.

---

## Roadmap

### Phase 0: Scaffolding
**Goal**: Extension skeleton that installs, activates, and shows up in the Extensions page.

**Tasks**:
1. Create `crane/` directory structure:
   ```
   crane/
     extension.toml        # Manifest
     extension.wasm         # Compiled WASM binary
     src/                   # Rust source (compiled to WASM)
       lib.rs               # activate/deactivate, method exports
       store.rs             # Local store wrapper
       discord.rs           # Discord agent
     scripts/               # Bash tooling
       build.sh             # Compile Rust → WASM
       test.sh              # Run bats tests
       install.sh           # Copy to ~/.buster/extensions/
       release.sh           # Package for distribution
     tests/                 # bats-core test suites
       build.bats
       install.bats
   ```

2. Write `extension.toml`:
   ```toml
   [extension]
   id = "crane"
   name = "Buster Crane"
   version = "0.1.0"
   description = "Agentic data layer — fetch, cache, and surface external data"

   [capabilities]
   network = true
   workspace_read = true
   workspace_write = true
   notifications = true

   [[services]]
   id = "crane-feed"
   label = "Crane Feed"
   auto_start = true

   [[commands]]
   id = "crane.open-feed"
   label = "Open Crane Feed"

   [[commands]]
   id = "crane.connect-service"
   label = "Connect Service"

   [[commands]]
   id = "crane.disconnect-service"
   label = "Disconnect Service"
   ```

3. Write `scripts/build.sh` (bash-pro standard):
   ```bash
   #!/usr/bin/env bash
   set -Eeuo pipefail

   readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
   readonly PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
   readonly TARGET="wasm32-unknown-unknown"
   readonly OUT="$PROJECT_DIR/extension.wasm"

   trap 'printf "Build failed\n" >&2' ERR

   main() {
       command -v cargo &>/dev/null || { printf "cargo not found\n" >&2; exit 1; }
       command -v wasm-strip &>/dev/null || printf "WARN: wasm-strip not found, binary will be larger\n" >&2

       printf "Building Crane extension...\n"
       cargo build \
           --manifest-path "$PROJECT_DIR/Cargo.toml" \
           --target "$TARGET" \
           --release

       local wasm_path="$PROJECT_DIR/target/$TARGET/release/crane.wasm"
       cp "$wasm_path" "$OUT"

       if command -v wasm-strip &>/dev/null; then
           wasm-strip "$OUT"
           printf "Stripped: %s\n" "$(du -h "$OUT" | cut -f1)"
       fi

       printf "Build complete: %s\n" "$OUT"
   }

   main "$@"
   ```

4. Write `scripts/install.sh`:
   ```bash
   #!/usr/bin/env bash
   set -Eeuo pipefail

   readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
   readonly PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
   readonly DEST="$HOME/.buster/extensions/crane"

   trap 'printf "Install failed\n" >&2' ERR

   main() {
       if [[ ! -f "$PROJECT_DIR/extension.wasm" ]]; then
           printf "extension.wasm not found. Run build.sh first.\n" >&2
           exit 1
       fi

       printf "Installing Crane to %s\n" "$DEST"
       mkdir -p "$DEST"

       # Copy manifest and binary
       cp "$PROJECT_DIR/extension.toml" "$DEST/"
       cp "$PROJECT_DIR/extension.wasm" "$DEST/"

       printf "Installed. Reload extensions in Buster.\n"
   }

   main "$@"
   ```

5. Write `scripts/test.sh`:
   ```bash
   #!/usr/bin/env bash
   set -Eeuo pipefail

   readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
   readonly PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

   main() {
       command -v bats &>/dev/null || { printf "bats not found. Install: brew install bats-core\n" >&2; exit 1; }

       printf "Running Crane tests...\n"
       bats "$PROJECT_DIR/tests/"
   }

   main "$@"
   ```

**Deliverable**: An extension that installs to `~/.buster/extensions/crane/`, shows in the Extensions page, and activates/deactivates cleanly.

---

### Phase 1: Local Data Store
**Goal**: Add `host_store_*` FFI functions to Buster's runtime so extensions can persist structured data.

**Tasks**:
1. Add `store` capability to `manifest.rs` Capabilities struct
2. Create `src-tauri/src/extensions/store.rs`:
   - SQLite database per extension at `{app_data}/extensions/{id}/store.db`
   - Schema: `CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT, source TEXT, timestamp INTEGER, ttl INTEGER)`
   - Functions: `put`, `get`, `query` (JSON filter), `delete`, `count`
3. Add five new host functions to `runtime.rs` (lines ~370+):
   - `host_store_put` — requires `store` capability
   - `host_store_get` — requires `store` capability
   - `host_store_query` — requires `store` capability, returns JSON array
   - `host_store_delete` — requires `store` capability
   - `host_store_count` — requires `store` capability
4. Add `rusqlite` dependency to Cargo.toml
5. Write bats tests for store operations

**Faculty document created**: `crane-store.md`

**Deliverable**: Extensions can persist and query structured data that survives across sessions.

---

### Phase 2: Discord Agent
**Goal**: A working Discord agent that connects to the bot gateway, receives messages, caches them locally, and surfaces them in a feed panel.

**Tasks**:
1. Write `crane/src/discord.rs`:
   - Connect to Discord Gateway (wss://gateway.discord.gg) via `ext_gateway_connect`
   - Handle HELLO, IDENTIFY, HEARTBEAT, DISPATCH events
   - On MESSAGE_CREATE: extract author, content, channel, timestamp
   - Write to local store via `host_store_put`
2. Write `crane/src/lib.rs`:
   - `activate()`: start Discord agent if token exists
   - `deactivate()`: clean disconnect
   - Export `query_feed(params)`: read from store, return JSON
   - Export `get_unread_count()`: count unread items
3. Create Crane feed panel (`src/ui/CraneFeed.tsx`):
   - Rendered when Crane extension is loaded
   - Uses TanStack Query with `ext_call("crane", "query_feed")` as queryFn
   - Shows messages in reverse chronological order
   - Source badges, author, timestamp, content preview
   - Themed: Courier New, 16px, no bold, Catppuccin variables
4. Token management:
   - Settings UI section for entering Discord bot token
   - Stored via `keyring` as `crane.discord.bot_token`
5. Write bats tests for the Discord connection flow

**Faculty documents created**: `crane-protocol.md`, `crane-agents.md` (Discord section), `crane-ui.md`

**Deliverable**: User enters a Discord bot token, Crane connects, messages appear in the feed panel in real time.

---

### Phase 3: Gmail Agent
**Goal**: Add Gmail as a second data source, proving the multi-agent pattern.

**Tasks**:
1. Gmail OAuth2 flow:
   - Open system browser for Google consent screen
   - Receive callback token
   - Store refresh token in `keyring` as `crane.gmail.refresh_token`
2. Write `crane/src/gmail.rs`:
   - Poll Gmail API (or use Pub/Sub push if feasible in WASM)
   - Fetch inbox threads matching user-defined filters
   - Write to local store with `source: "gmail"`
3. Update feed panel to handle multiple sources:
   - Source filter buttons (All / Discord / Gmail)
   - Unified chronological sort
4. Update `extension.toml` with Gmail secret declaration
5. Write bats tests for Gmail auth flow

**Faculty document updated**: `crane-agents.md` (Gmail section), `crane-security.md`

**Deliverable**: Discord and Gmail messages appear in the same feed. User can filter by source.

---

### Phase 4: Context Awareness
**Goal**: Agents surface relevant information based on the current workspace.

**Tasks**:
1. Add `host_get_workspace_context()` FFI function:
   - Returns JSON: `{ repo: "owner/name", branch: "main", open_files: [...] }`
   - Requires `workspace_read` capability
2. Agents tag stored items with relevance metadata:
   - Discord: messages mentioning the repo name or branch
   - Gmail: threads with subject lines matching the project
3. Feed panel gains a "Relevant" filter that scores items by workspace context
4. Notification badge on the dock bar when high-relevance items arrive

**Faculty document created**: `crane-security.md` (audit logging for workspace access)

**Deliverable**: When working on repo `buster`, Discord messages mentioning "buster" surface at the top of the feed.

---

### Phase 5: Telegram + RSS Agents
**Goal**: Prove extensibility with two more adapters.

**Tasks**:
1. `crane/src/telegram.rs` — Bot API long-polling adapter
2. `crane/src/rss.rs` — Generic HTTP polling for RSS/Atom/JSON feeds
3. Source filter buttons updated for all four sources
4. Settings UI for Telegram bot token and RSS feed URLs

**Faculty document updated**: `crane-agents.md` (Telegram + RSS sections)

**Deliverable**: Four data sources in one feed.

---

### Phase 6: Search + Composability
**Goal**: Cross-source search and agent-to-agent data sharing.

**Tasks**:
1. Command palette integration: `>crane search <query>` searches all agent stores
2. Full-text search index (SQLite FTS5) on stored content
3. Summary agent: reads from all other agents' stores, compiles daily digest
4. API for agents to subscribe to other agents' events

**Deliverable**: Search "deploy" and find results from Discord, Gmail, and RSS in one list.

---

## Faculty: Bash Automation (crane-bash.md preview)

All Crane tooling scripts follow the bash-pro standard:

### Required Practices
- **Strict mode**: `set -Eeuo pipefail` in every script
- **Error traps**: `trap 'cleanup' EXIT` for temp file cleanup
- **Quoting**: All variable expansions quoted
- **Dependency checks**: `command -v <tool> &>/dev/null` before use
- **Portable shebang**: `#!/usr/bin/env bash`
- **No eval**: Never `eval` user input
- **Printf over echo**: `printf` for predictable output
- **Option termination**: `--` to prevent injection in argument lists

### Scripts to Maintain
| Script | Purpose | Tests |
|--------|---------|-------|
| `scripts/build.sh` | Compile Rust to WASM, strip binary | `tests/build.bats` |
| `scripts/test.sh` | Run bats test suites | — |
| `scripts/install.sh` | Copy to `~/.buster/extensions/crane/` | `tests/install.bats` |
| `scripts/release.sh` | Package for distribution (tar.gz) | `tests/release.bats` |
| `scripts/lint.sh` | ShellCheck + shfmt on all scripts | — |
| `scripts/clean.sh` | Remove build artifacts | — |

### CI Pipeline (GitHub Actions)
```yaml
name: Crane CI
on: [push, pull_request]
jobs:
  lint-bash:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: shellcheck scripts/*.sh
      - run: shfmt -d scripts/*.sh

  build-wasm:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32-unknown-unknown
      - run: bash scripts/build.sh

  test:
    runs-on: ubuntu-latest
    needs: [build-wasm]
    steps:
      - uses: actions/checkout@v4
      - run: brew install bats-core || sudo apt-get install -y bats
      - run: bash scripts/test.sh
```

### Quality Gates
- All scripts pass `shellcheck --enable=all`
- All scripts formatted with `shfmt -i 4 -ci`
- All scripts have corresponding `.bats` test files
- No script exceeds 200 lines (split into sourced libraries if needed)

---

## Release Strategy

### Distribution Format
```
crane-v0.1.0.tar.gz
  crane/
    extension.toml
    extension.wasm
    README.md
    LICENSE
```

Users install via:
```bash
tar xzf crane-v0.1.0.tar.gz -C ~/.buster/extensions/
```

Or via the Extensions page "Install from directory" flow that already exists.

### Versioning
- Follows semver: `0.x.y` during development, `1.0.0` at first stable release
- Each phase bumps minor version: 0.1.0 (Discord), 0.2.0 (Gmail), etc.
- Breaking store schema changes bump major version with migration script

---

## Success Criteria

| Phase | Metric |
|-------|--------|
| 0 | Extension installs, activates, deactivates without error |
| 1 | Store persists 10,000 records, queries return in <50ms |
| 2 | Discord messages appear in feed within 2s of being sent |
| 3 | Gmail + Discord in same feed, source filtering works |
| 4 | Relevant messages auto-promoted based on workspace context |
| 5 | Four sources working simultaneously |
| 6 | Full-text search across 100k records returns in <200ms |
