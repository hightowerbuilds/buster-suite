# Buster Crane

An agentic data layer for Buster IDE — persistent agents that fetch, cache, and surface information from external services (Discord, Telegram, Gmail, web) without rendering their UIs.

---

## The Problem

Developers context-switch constantly between their IDE and messaging platforms, email, and web dashboards. Each switch loads a full web app — Discord's 15MB JS bundle, Gmail's DOM, Telegram Web — just to check a message or read a thread. These UIs are designed for general consumers, not for someone mid-flow in a code editor.

## The Idea

Instead of embedding these services as webviews (DOM-heavy, auth-heavy, slow), Buster Crane provides an **agent layer** that connects directly to service APIs and gateways, pulls structured data, caches it locally, and renders it natively inside Buster's themed UI. No external DOM. No iframe. No webview. Just data.

The name "Crane" comes from the idea of reaching out, lifting information from external sources, and placing it exactly where the developer needs it.

---

## How This Maps to What Buster Already Has

The foundation exists:

- **WASM extensions** with `wasmtime` — sandboxed code execution for agents
- **WebSocket gateway** (`extensions/gateway.rs`) — extensions can maintain persistent connections to external services
- **Capabilities model** (`network`, `workspace_read`, `workspace_write`, `notifications`) — permission system for controlling what agents can access
- **TanStack Query** — frontend caching with stale-while-revalidate for any async data
- **Secure key storage** via `keyring` — OAuth tokens and API keys stored safely
- **Extension manifest** (`extension.toml`) — declarative system for describing what an extension provides

---

## Architecture

### Three Layers

**1. Agent Gateway Protocol**

A standardized way for extensions to register as "data agents." An agent declares:
- What service it connects to (Discord, Telegram, Gmail, RSS, any API)
- What data shape it provides (messages, threads, notifications, events, contacts)
- What permissions it needs (network, notifications, workspace_read)
- Its refresh strategy (WebSocket persistent, polling interval, on-demand)

Buster gives each agent a persistent connection slot. The agent fetches from service APIs using OAuth tokens stored in `keyring`, pushes structured data back through the gateway, and Buster caches it.

**2. Local Cache Layer**

This is the core innovation — going around the DOM entirely. Instead of rendering a web app to read data, an agent calls the service API, gets JSON, and writes it to a local store inside the app data directory. TanStack Query on the frontend reads from that cache. The data is always available, even offline. The agent refreshes in the background on its own schedule.

The cache layer provides:
- Per-agent isolated storage (SQLite or flat-file)
- A standard API: `buster.store.put(key, value)` / `buster.store.query(filter)`
- TTL-based expiration so stale data is cleaned up
- Cross-agent search — query across all agent data stores from the command palette

**3. Unified Feed Panel**

A panel in Buster that aggregates data from all registered agents into a single chronological or priority-sorted feed. Discord messages, Telegram chats, Gmail threads, GitHub notifications — all rendered natively in Courier New, themed to match Buster, no external UI loaded.

The feed supports:
- Filtering by source (show only Discord, only Gmail, etc.)
- Filtering by relevance (messages mentioning the current repo, branch, or file)
- Quick actions (reply inline, mark as read, open in browser)
- Search across all sources

---

## What Makes This Agentic (Not Just API Polling)

These are not simple REST pollers. Crane agents are:

- **Persistent** — WebSocket connections that stay alive (Discord bot gateway, Telegram long-poll, Gmail push notifications via Pub/Sub)
- **Stateful** — they track what the user has seen, what's new, what's changed since last check
- **Context-aware** — an agent can read the current workspace state (repo name, branch, open files) and surface related messages automatically. Example: a Discord thread that mentions the repo you're working in gets promoted to the top of the feed.
- **Memory-backed** — agents write to local storage, so historical data persists across sessions. You could search six months of Discord messages from the IDE without ever opening Discord.
- **Composable** — agents can read from each other's data stores. A "daily summary" agent could aggregate unread counts from Discord, Gmail, and GitHub into a single status line.

---

## Reference Agents to Build First

### 1. Discord Agent
- Connects via Discord Bot Gateway (WebSocket)
- Subscribes to specified guilds/channels
- Surfaces: messages, mentions, thread updates
- Why first: well-documented WebSocket API, real-time events, high developer usage

### 2. Gmail Agent
- Connects via Gmail API (OAuth2 + REST, optional Pub/Sub push)
- Surfaces: inbox threads, unread count, messages matching filters
- Why second: high-value for async communication, API is mature

### 3. Telegram Agent
- Connects via Telegram Bot API (long-polling or WebSocket)
- Surfaces: messages from specified chats/groups
- Why third: simpler API, many dev communities use Telegram

### 4. RSS/Web Agent
- Generic HTTP polling agent
- Surfaces: feed items from any RSS/Atom URL, or structured data from any JSON API
- Why fourth: proves the system is extensible beyond messaging — could monitor deploy status pages, CI dashboards, package release feeds

---

## Extension Manifest for a Crane Agent

```toml
[extension]
id = "crane-discord"
name = "Crane: Discord"
version = "0.1.0"
description = "Persistent Discord agent for Buster Crane"

[capabilities]
network = true
workspace_read = true
notifications = true

[agent]
type = "persistent"
service = "discord"
data_types = ["message", "thread", "mention"]
refresh = "websocket"

[[secrets]]
id = "discord_bot_token"
label = "Discord Bot Token"
required = true

[[commands]]
id = "crane-discord.connect"
label = "Connect Discord"

[[commands]]
id = "crane-discord.disconnect"
label = "Disconnect Discord"
```

---

## Data Store API (Extension Runtime)

Extensions get access to a per-agent key-value store with query support:

```
// Write
buster.store.put("msg:12345", {
  source: "discord",
  channel: "general",
  author: "alice",
  content: "The deploy broke again",
  timestamp: 1712505600,
  read: false,
})

// Query
buster.store.query({
  source: "discord",
  read: false,
  after: 1712500000,
})

// Count
buster.store.count({ source: "discord", read: false })

// Delete
buster.store.delete("msg:12345")
```

Backed by a per-extension SQLite file at `{app_data}/crane/{extension_id}/store.db`.

---

## Token Management

A section in Buster's Settings panel under a "Crane" or "Connections" disclosure:
- Lists connected services with status (connected / disconnected / error)
- Each service has an "Add Token" flow that stores the credential in `keyring`
- Agents read their tokens from `keyring` on startup
- Supports OAuth2 flows (open browser, receive callback) for services that require it

---

## Unified Feed Panel UI

The feed panel renders all agent data in a single scrollable list:

```
[Discord] #deployments — alice — 2m ago
  "The deploy broke again, reverting to v2.3.1"

[Gmail] Re: Q2 roadmap — bob@company.com — 15m ago
  "Can we push the auth rewrite to next sprint?"

[GitHub] PR #142 review requested — carol — 1h ago
  "Add retry logic to webhook handler"

[Telegram] DevOps Chat — dave — 2h ago
  "Monitoring dashboard is back up"
```

Each entry is a single row with: source badge, context (channel/thread/subject), author, relative time, and a preview of the content. Click to expand inline. All rendered in Courier New, themed to match Buster.

---

## Implementation Phases

### Phase 1: Foundation
- Extend extension runtime with `buster.store` API (SQLite-backed)
- Add `[agent]` section to extension manifest parser
- Token management UI in Settings
- Unified feed panel (empty, waiting for agents)

### Phase 2: Discord Reference Agent
- WASM extension that connects to Discord gateway via WebSocket
- Writes messages to local store
- Feed panel renders Discord messages
- Prove the full loop: connect, fetch, cache, render, persist

### Phase 3: Gmail + Telegram Agents
- Build two more agents following the proven pattern
- Feed panel now aggregates multiple sources
- Cross-source search from command palette

### Phase 4: Context Awareness
- Agents read workspace state (repo, branch, open files)
- Relevance scoring — messages mentioning the current project surface first
- Notification badges on the dock bar

### Phase 5: Composability
- Agents can read from other agents' stores
- Summary agent that aggregates unread counts
- "Morning briefing" agent that compiles overnight activity

---

## Open Questions

**WASM vs Sidecar**: Should agents run as WASM inside Buster (sandboxed, portable, but limited) or as sidecar processes (more powerful, any language, harder to distribute)? The current WASM + gateway architecture supports both — the gateway already bridges network access for sandboxed extensions. Starting with WASM and offering sidecar as an advanced option seems right.

**Bidirectional**: Should agents support sending messages (reply to Discord, send email) or start read-only? Read-only is safer and simpler. Write support can come later as a capability flag.

**Rate Limits**: Service APIs have rate limits. The cache layer helps — you fetch once and read from cache many times — but agents need backoff logic. This should be a built-in utility in the extension runtime, not something each agent implements.

**Privacy**: All data stays local. No telemetry, no cloud sync. The tokens live in `keyring`, the cache lives in `app_data`. This is a key differentiator — Crane is a local-first system.

---

## Why This Matters

Every other IDE integration with external services either:
1. Opens a webview (slow, heavy, doesn't match the IDE aesthetic)
2. Provides a thin notification panel (limited, no history, no search)
3. Requires a separate desktop app running alongside

Crane is none of these. It's a persistent, cached, native data layer that makes external information feel like it's part of the IDE. The developer never leaves their flow. The data is always there, always searchable, always themed to match.

This is the kind of feature that makes Buster not just an editor, but a workspace.
