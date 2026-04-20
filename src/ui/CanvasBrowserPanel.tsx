/**
 * CanvasBrowserPanel — canvas-rendered browser chrome + native Tauri webview.
 *
 * Top 32px: canvas-rendered nav buttons (back, forward, refresh) + URL bar.
 * Below: native Tauri webview positioned by absolute window coordinates.
 */

import { Component, createSignal, createEffect, on, onMount, onCleanup, Show } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import CanvasChrome, { CHROME_FONT, type HitRegion, type PaintFn } from "./canvas-chrome";
import { useBuster } from "../lib/buster-context";
import {
  createBrowserView,
  navigateBrowserView,
  resizeBrowserView,
  showBrowserView,
  hideBrowserView,
  closeBrowserView,
  browserGoBack,
  browserGoForward,
  browserReload,
  scanLocalPorts,
} from "../lib/ipc";

// ── Constants ──────────────────────────────────────────────────────────

const CHROME_H = 32;
const BTN_W = 28;
const BTN_GAP = 2;
const NAV_START = 4;
const URL_START = NAV_START + (BTN_W + BTN_GAP) * 3 + 8;
const URL_PAD = 8;
const FONT = `12px ${CHROME_FONT}`;
const BTN_FONT = `14px ${CHROME_FONT}`;

// ── Props ──────────────────────────────────────────────────────────────

interface CanvasBrowserPanelProps {
  tabId: string;
  active: boolean;
  initialUrl?: string;
}

// ── Component ──────────────────────────────────────────────────────────

const CanvasBrowserPanel: Component<CanvasBrowserPanelProps> = (props) => {
  const { store } = useBuster();
  const palette = () => store.palette;

  let containerRef!: HTMLDivElement;
  let browserId: string | null = null;

  const [currentUrl, setCurrentUrl] = createSignal(props.initialUrl || "");
  const [editing, setEditing] = createSignal(false);
  const [editValue, setEditValue] = createSignal("");
  const [urlBarRect, setUrlBarRect] = createSignal({ x: URL_START, w: 400 });

  // ── URL helpers ────────────────────────────────────────────────────

  function normalizeUrl(input: string): string {
    const trimmed = input.trim();
    if (!trimmed) return "about:blank";
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^localhost/i.test(trimmed) || /^127\.0\.0\.1/i.test(trimmed)) return `http://${trimmed}`;
    if (trimmed.includes(".") && !trimmed.includes(" ")) return `https://${trimmed}`;
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  }

  async function navigateToUrl(input: string) {
    const url = normalizeUrl(input);
    setCurrentUrl(url);
    if (browserId) {
      navigateBrowserView(browserId, url).catch(() => {});
    }
  }

  function startEditing() {
    setEditValue(currentUrl());
    setEditing(true);
  }

  // ── Webview positioning ────────────────────────────────────────────

  function updateWebviewPosition() {
    if (!browserId || !containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    const h = Math.max(0, rect.height - CHROME_H);
    if (rect.width <= 0 || h <= 0) return;
    resizeBrowserView(browserId, rect.left, rect.top + CHROME_H, rect.width, h).catch(() => {});
  }

  // ── Paint function ─────────────────────────────────────────────────

  const paint: PaintFn = (ctx, w, h, hovered) => {
    const p = palette();
    const regions: HitRegion[] = [];

    // Background
    ctx.fillStyle = p.editorBg;
    ctx.fillRect(0, 0, w, h);

    // Bottom border
    ctx.fillStyle = p.border;
    ctx.fillRect(0, h - 1, w, 1);

    const cy = h / 2;
    ctx.textBaseline = "middle";

    // ── Nav buttons ────────────────────────────────────────────────
    const buttons = [
      { id: "back", label: "\u2190", action: () => browserId && browserGoBack(browserId).catch(() => {}) },
      { id: "forward", label: "\u2192", action: () => browserId && browserGoForward(browserId).catch(() => {}) },
      { id: "refresh", label: "\u21BB", action: () => browserId && browserReload(browserId).catch(() => {}) },
    ];

    ctx.font = BTN_FONT;
    ctx.textAlign = "center";

    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const bx = NAV_START + i * (BTN_W + BTN_GAP);

      if (hovered === btn.id) {
        ctx.fillStyle = p.surface0;
        ctx.beginPath();
        ctx.roundRect(bx, 4, BTN_W, h - 8, 4);
        ctx.fill();
      }

      ctx.fillStyle = hovered === btn.id ? p.text : p.textDim;
      ctx.fillText(btn.label, bx + BTN_W / 2, cy);

      regions.push({
        id: btn.id,
        x: bx, y: 0, w: BTN_W, h,
        cursor: "pointer",
        onClick: () => btn.action(),
      });
    }

    // ── URL bar ──────────────────────────────────────────────────
    const urlX = URL_START;
    const urlW = w - urlX - URL_PAD;
    const urlH = 22;
    const urlY = (h - urlH) / 2;

    // Store rect for input overlay positioning
    setUrlBarRect({ x: urlX, w: urlW });

    // Background
    ctx.fillStyle = hovered === "url" ? p.surface1 : p.surface0;
    ctx.beginPath();
    ctx.roundRect(urlX, urlY, urlW, urlH, 4);
    ctx.fill();

    // URL text (only when not editing — the input overlay covers it)
    if (!editing()) {
      ctx.font = FONT;
      ctx.textAlign = "left";
      ctx.fillStyle = p.textDim;
      const displayUrl = currentUrl() || "Enter URL or search...";
      // Truncate to fit
      const maxTextW = urlW - 12;
      let text = displayUrl;
      while (ctx.measureText(text).width > maxTextW && text.length > 1) {
        text = text.slice(0, -1);
      }
      if (text.length < displayUrl.length) text += "\u2026";
      ctx.fillText(text, urlX + 6, cy);
    }

    regions.push({
      id: "url",
      x: urlX, y: urlY, w: urlW, h: urlH,
      cursor: "text",
      onClick: () => startEditing(),
    });

    ctx.textAlign = "left";
    return regions;
  };

  // ── Lifecycle ──────────────────────────────────────────────────────

  onMount(async () => {
    // Determine initial URL
    let startUrl = props.initialUrl || "";
    if (!startUrl) {
      try {
        const ports = await scanLocalPorts();
        if (ports.length > 0) startUrl = ports[0].url;
      } catch { /* fall through */ }
    }
    if (startUrl) setCurrentUrl(startUrl);

    // Create webview
    const rect = containerRef.getBoundingClientRect();
    const x = rect.left;
    const y = rect.top + CHROME_H;
    const w = rect.width;
    const h = Math.max(0, rect.height - CHROME_H);

    if (w > 0 && h > 0) {
      try {
        browserId = await createBrowserView(startUrl || "about:blank", x, y, w, h);
      } catch (e) {
        console.error("Failed to create browser view:", e);
      }
    }

    // Track container resizes
    const ro = new ResizeObserver(() => {
      if (props.active) updateWebviewPosition();
    });
    ro.observe(containerRef);

    // Track window moves (webview uses absolute coords)
    const unlistenMove = await listen("tauri://move", () => updateWebviewPosition());

    onCleanup(() => {
      ro.disconnect();
      unlistenMove();
      if (browserId) {
        closeBrowserView(browserId).catch(() => {});
      }
    });
  });

  // Show/hide webview on tab switch
  createEffect(
    on(
      () => props.active,
      (active, prevActive) => {
        if (!browserId) return;
        if (active && !prevActive) {
          showBrowserView(browserId).catch(() => {});
          requestAnimationFrame(() => updateWebviewPosition());
        } else if (!active && prevActive) {
          hideBrowserView(browserId).catch(() => {});
        }
      }
    )
  );

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div
      ref={(el) => { containerRef = el; }}
      style={{
        width: "100%",
        height: "100%",
        display: props.active ? "flex" : "none",
        "flex-direction": "column",
        background: palette().editorBg,
      }}
    >
      <CanvasChrome class="browser-chrome" height={CHROME_H} paint={paint}>
        <Show when={editing()}>
          <input
            ref={(el) => requestAnimationFrame(() => { el.focus(); el.select(); })}
            type="text"
            value={editValue()}
            onInput={(e) => setEditValue(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                navigateToUrl(editValue());
                setEditing(false);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditing(false);
              }
              e.stopPropagation();
            }}
            onBlur={() => setEditing(false)}
            style={{
              position: "absolute",
              left: `${urlBarRect().x}px`,
              top: `${(CHROME_H - 22) / 2}px`,
              width: `${urlBarRect().w}px`,
              height: "22px",
              background: palette().surface0,
              color: palette().text,
              border: `1px solid ${palette().accent}`,
              "border-radius": "4px",
              "font-size": "12px",
              "font-family": CHROME_FONT,
              padding: "0 6px",
              outline: "none",
              "z-index": "10",
              "box-sizing": "border-box",
            }}
          />
        </Show>
      </CanvasChrome>
      {/* Native Tauri webview occupies remaining space via absolute positioning */}
    </div>
  );
};

export default CanvasBrowserPanel;
