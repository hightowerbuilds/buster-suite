# Browser Extension for Buster via FFmpeg + Headless Rendering

**Date:** 2026-04-08

## Overview

The goal is to build a browser panel inside Buster that renders entirely on the canvas — no DOM footprint in Buster's UI layer. The approach: run a headless browser engine off-screen, capture its rendered output as pixel buffers, and paint those onto the Buster canvas as a texture. The browser has its own internal DOM, but that's its concern, not Buster's.

## Architecture

```
┌─────────────────┐      raw frames      ┌─────────┐      texture      ┌──────────────┐
│  Headless CEF   │  ──────────────────►  │  FFmpeg  │  ─────────────►  │ Buster Canvas │
│  (has its own   │    pixel buffers      │ (encode/ │   decoded        │  (renders as  │
│   internal DOM) │                       │ compress)│   frames         │   a panel)    │
└─────────────────┘                       └─────────┘                   └──────────────┘
        ▲                                                                      │
        │                    mouse clicks, keyboard, scroll                    │
        └──────────────────────────────────────────────────────────────────────┘
```

## What is FFmpeg?

FFmpeg is an open-source multimedia framework — a Swiss Army knife for audio and video. It can decode, encode, transcode, mux, demux, stream, filter, and play almost any media format. It's a set of C libraries and CLI tools that most video/audio software quietly depends on (VLC, OBS, YouTube's backend, Discord, etc.).

Core pieces:

- **libavcodec** — codec library (H.264, H.265, VP9, AV1, AAC, Opus, etc.)
- **libavformat** — container muxing/demuxing (MP4, MKV, WebM, etc.)
- **libavfilter** — video/audio filter graphs (scaling, overlays, color correction)
- **libswscale / libswresample** — pixel format conversion and audio resampling

### Rust integration path

- **`ffmpeg-next`** (Rust crate) — safe wrapper around FFmpeg's C libraries
- Or shell out to the `ffmpeg` CLI from Tauri commands for simpler use cases
- Since Tauri already gives access to the filesystem and process spawning, integration is straightforward

## Where FFmpeg Fits and Where It Doesn't

**FFmpeg is NOT needed for the basic case.** If the headless browser and Buster are in the same process (or share memory), raw pixel buffers can be blit directly onto the canvas as a texture. This is the fastest path — zero encoding latency.

**FFmpeg becomes valuable when:**

- **Cross-process IPC** — Raw RGBA frames at 1920x1080 are ~8MB each. At 30fps that's 240MB/s of pipe bandwidth. FFmpeg can compress frames with a low-latency codec (H.264 with `zerolatency` tune, or MJPEG) to bring that down by 10-100x.
- **Recording** — "Record this browser session as a video" becomes trivial.
- **Remote/collaborative browsing** — Stream someone's browser panel to a teammate.
- **Replay** — Scrub through a browsing session like a video timeline.

### The tradeoff

Every encode/decode cycle adds latency (5-30ms depending on codec). For a snappy browser feel, raw pixel buffers should be used locally. FFmpeg should only enter the pipeline when compression, recording, or streaming is needed.

## "Browser as Video" vs "Browser as Texture"

Think of this as **"browser as texture"** for live interaction and **"browser as video"** for recording/streaming.

- **Texture path**: ~1ms latency, pixel-perfect, simple
- **Video path**: ~10-30ms latency, possible compression artifacts, but great for bandwidth/storage

Both can run simultaneously — live interaction uses the texture path while a background FFmpeg pipeline records the session.

## Headless Browser Engine Options

| Option | Language | Off-screen rendering | Notes |
|---|---|---|---|
| **CEF** (Chromium Embedded Framework) | C++ | Yes, first-class support | Industry standard for this exact use case. Has Rust bindings (`cef-rs`, though immature). Used by Spotify, Discord, Steam. |
| **Servo** | Rust | Yes, renders to textures | Mozilla's experimental engine, written in Rust. Immature but philosophically aligned with Buster. |
| **Headless Chromium via CDP** | Any | Screenshots/screencast | Uses Chrome DevTools Protocol. Simple but higher latency — designed for testing, not real-time. |
| **Ultralight** | C++ | Yes, GPU-based | Lightweight HTML renderer designed for embedding in games/apps. Not a full browser though. |

**CEF** is the battle-tested choice. Its off-screen rendering mode provides a pixel buffer per frame, plus APIs to inject mouse/keyboard events.

**Servo** is the dream pick (Rust-native, GPU rendering), but it's not production-ready.

## The Input Problem

A browser is interactive, not passive. The system needs to:

1. Map canvas coordinates to the browser viewport
2. Forward mouse events (click, hover, scroll) back to the headless engine
3. Forward keyboard events when the browser panel is focused
4. Handle cursor changes (pointer, text, etc.)

CEF handles all of this — `SendMouseClickEvent()`, `SendKeyEvent()`, etc. It's a solved problem, just needs wiring up.

## FFmpeg Beyond the Browser Panel

Since Buster renders everything to a raw pixel buffer (canvas), FFmpeg also enables:

- **Session recording / replay** — Record entire coding sessions as video natively, no screen recorder needed.
- **Streaming / live collaboration** — Encode canvas frames into RTMP/HLS/WebRTC-compatible streams.
- **Asset previews** — Decode and render video file previews directly onto the canvas (no `<video>` element).
- **GIF / animated screenshot export** — Select a region or time slice and export a clip for bug reports or docs.
- **AI agent replays** — Record what the AI agent did step-by-step as a reviewable video.

The key insight: because Buster already renders to a raw pixel buffer, it skips the expensive screen-capture step that DOM-based apps need. Direct access to frame data is exactly what FFmpeg wants as input.

## Recommended Approach

1. Start with **CEF in off-screen mode → raw pixel buffer → canvas texture** as the baseline.
2. Add FFmpeg as an optional layer for recording and compression when needed.
3. Do not route live interactive frames through video encoding — that adds latency for no benefit in the local case.

The result: a browser panel inside Buster that looks and feels native to the canvas, has no DOM footprint in Buster's UI, and can optionally be recorded/streamed via FFmpeg.
