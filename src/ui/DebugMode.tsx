/**
 * DebugMode — full-screen debug overlay.
 *
 * Takes over the screen when a debug session is active.
 * Canvas-rendered header with controls, source view (CanvasEditor),
 * canvas-rendered variables and call stack panels, console output.
 */

import { Component, Show, For, createSignal, createEffect, on } from "solid-js";
import { useBuster } from "../lib/buster-context";
import CanvasChrome, { CHROME_FONT, CHROME_MONO, type HitRegion, type PaintFn } from "./canvas-chrome";
import CanvasEditor from "../editor/CanvasEditor";
import {
  debugContinue, debugStepOver, debugStepInto, debugStepOut,
  debugStop, debugPause, debugVariables, readFile,
} from "../lib/ipc";
import type { DebugStackFrame } from "../lib/ipc";
import { basename } from "buster-path";
import "../styles/debug-mode.css";

interface DebugModeProps {
  onMinimize: () => void;
}

const HEADER_H = 40;

const DebugMode: Component<DebugModeProps> = (props) => {
  const { store, setStore } = useBuster();
  const [sourceText, setSourceText] = createSignal<string>("");
  const [sourceFilePath, setSourceFilePath] = createSignal<string | null>(null);
  let sourceEngine: any = null;
  let consoleRef: HTMLDivElement | undefined;

  const isPaused = () => store.debugSessionState === "paused";
  const isRunning = () => store.debugSessionState === "running";
  const isActive = () => isPaused() || isRunning();
  const isStopped = () => store.debugSessionState === "stopped";

  // Load source file when selected frame changes
  createEffect(on(
    () => store.debugSelectedFrameId,
    async (frameId) => {
      if (frameId === null) return;
      const frame = store.debugStackFrames.find((f: DebugStackFrame) => f.id === frameId);
      if (!frame?.file_path) return;
      try {
        const file = await readFile(frame.file_path);
        setSourceText(file.content);
        setSourceFilePath(frame.file_path);
      } catch {
        setSourceText("// Could not load source file");
        setSourceFilePath(null);
      }
    },
  ));

  // Scroll source to stopped line when engine is ready and frame changes
  createEffect(on(
    () => [store.debugSelectedFrameId, sourceEngine] as const,
    ([frameId, engine]) => {
      if (!engine || frameId === null) return;
      const frame = store.debugStackFrames.find((f: DebugStackFrame) => f.id === frameId);
      if (frame) {
        engine.setCursor({ line: Math.max(0, frame.line - 1), col: frame.col });
      }
    },
  ));

  // Auto-scroll console output
  createEffect(on(
    () => store.debugOutput.length,
    () => {
      if (consoleRef) consoleRef.scrollTop = consoleRef.scrollHeight;
    },
  ));

  // Escape to minimize
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      props.onMinimize();
    }
  }

  // ── Header controls (canvas-rendered) ─────────────────

  function css(prop: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(prop).trim();
  }

  const paintHeader: PaintFn = (ctx, w, h, hovered) => {
    const regions: HitRegion[] = [];
    const bg = css("--bg-surface0") || "#1e1e2e";
    const text = css("--text") || "#cdd6f4";
    const accent = css("--accent") || "#89b4fa";
    const dim = css("--text-subtext0") || "#6c7086";
    const green = css("--green") || "#a6e3a1";
    const red = css("--red") || "#f38ba8";
    const yellow = css("--yellow") || "#f9e2af";

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Title
    ctx.font = `bold 13px ${CHROME_FONT}`;
    ctx.fillStyle = accent;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText("DEBUG MODE", 14, h / 2);

    // State badge
    const state = store.debugSessionState;
    const stateColor = state === "paused" ? yellow : state === "running" ? green : state === "stopped" ? red : dim;
    const stateLabel = state.toUpperCase();
    ctx.font = `bold 11px ${CHROME_MONO}`;
    ctx.fillStyle = stateColor;
    ctx.fillText(stateLabel, 130, h / 2);

    // Control buttons
    type Btn = { id: string; label: string; enabled: boolean; onClick: () => void };
    const buttons: Btn[] = [];

    if (isPaused()) {
      buttons.push({ id: "continue", label: "Continue  F5", enabled: true, onClick: () => debugContinue() });
      buttons.push({ id: "stepOver", label: "Step Over  F10", enabled: true, onClick: () => debugStepOver() });
      buttons.push({ id: "stepInto", label: "Step Into  F11", enabled: true, onClick: () => debugStepInto() });
      buttons.push({ id: "stepOut", label: "Step Out  ⇧F11", enabled: true, onClick: () => debugStepOut() });
    }
    if (isRunning()) {
      buttons.push({ id: "pause", label: "Pause  F6", enabled: true, onClick: () => debugPause() });
    }
    if (isActive()) {
      buttons.push({ id: "stop", label: "Stop  ⇧F5", enabled: true, onClick: () => debugStop() });
    }

    let bx = 220;
    ctx.font = `12px ${CHROME_MONO}`;
    for (const btn of buttons) {
      const tw = ctx.measureText(btn.label).width + 16;
      const isHov = hovered === btn.id;
      const isStop = btn.id === "stop";

      ctx.fillStyle = isHov ? (isStop ? red : accent) : "transparent";
      ctx.fillRect(bx, 6, tw, h - 12);
      if (!isHov) {
        ctx.strokeStyle = isStop ? red : dim;
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + 0.5, 6.5, tw - 1, h - 13);
      }

      ctx.fillStyle = isHov ? bg : (isStop ? red : text);
      ctx.textAlign = "center";
      ctx.fillText(btn.label, bx + tw / 2, h / 2);

      regions.push({
        id: btn.id,
        x: bx, y: 6, w: tw, h: h - 12,
        cursor: "pointer",
        onClick: btn.onClick,
      });
      bx += tw + 8;
    }

    // Minimize button (right side)
    const minW = 28;
    const minX = w - minW - 10;
    const isMinHov = hovered === "minimize";
    ctx.fillStyle = isMinHov ? accent : "transparent";
    ctx.fillRect(minX, 6, minW, h - 12);
    ctx.fillStyle = isMinHov ? bg : dim;
    ctx.font = `16px ${CHROME_MONO}`;
    ctx.textAlign = "center";
    ctx.fillText("_", minX + minW / 2, h / 2 - 2);
    regions.push({
      id: "minimize",
      x: minX, y: 6, w: minW, h: h - 12,
      cursor: "pointer",
      onClick: props.onMinimize,
    });

    return regions;
  };

  // ── Variable click handler ──────────────────────────────

  async function expandVariable(ref: number) {
    try {
      const children = await debugVariables(ref);
      setStore("debugVariables", children);
    } catch { /* ignore */ }
  }

  async function selectFrame(frame: DebugStackFrame) {
    setStore("debugSelectedFrameId", frame.id);
    try {
      const vars = await debugVariables(frame.id);
      setStore("debugVariables", vars);
    } catch { /* ignore */ }
  }

  // ── Render ────────────────────────────────────────────

  return (
    <div class="debug-mode-overlay" onKeyDown={handleKeyDown} tabindex={-1}
      ref={(el) => requestAnimationFrame(() => el.focus())}>
      <CanvasChrome height={HEADER_H} paint={paintHeader} />
      <div class="debug-mode-body">
        <Show when={sourceText() && isActive()}
          fallback={
            <div class="debug-mode-idle-msg">
              {isStopped() ? "Session ended. Press Escape to return." : "Waiting for debugger to pause..."}
            </div>
          }
        >
          <div class="debug-mode-source">
            <CanvasEditor
              initialText={sourceText()}
              filePath={sourceFilePath()}
              active={true}
              lineNumbers={true}
              wordWrap={false}
              fontSize={store.settings.font_size}
              autocomplete={false}
              onEngineReady={(engine) => { sourceEngine = engine; }}
            />
          </div>
          <div class="debug-mode-right">
            <div class="debug-mode-variables">
              <div class="debug-mode-section-header">VARIABLES</div>
              <div class="debug-mode-scroll-list">
                <For each={store.debugVariables}>
                  {(v) => (
                    <div
                      class="debug-mode-var-row"
                      onClick={v.variables_reference > 0 ? () => expandVariable(v.variables_reference) : undefined}
                      style={{ cursor: v.variables_reference > 0 ? "pointer" : "default" }}
                    >
                      <span class="debug-mode-var-name">{v.name}</span>
                      <span class="debug-mode-var-value">{v.value}</span>
                      <Show when={v.var_type}>
                        <span class="debug-mode-var-type">{v.var_type}</span>
                      </Show>
                    </div>
                  )}
                </For>
                <Show when={store.debugVariables.length === 0}>
                  <div class="debug-mode-empty">No variables</div>
                </Show>
              </div>
            </div>
            <div class="debug-mode-stack">
              <div class="debug-mode-section-header">CALL STACK</div>
              <div class="debug-mode-scroll-list">
                <For each={store.debugStackFrames}>
                  {(frame) => (
                    <div
                      class={`debug-mode-frame-row ${store.debugSelectedFrameId === frame.id ? "selected" : ""}`}
                      onClick={() => selectFrame(frame)}
                    >
                      <span class="debug-mode-frame-name">{frame.name}</span>
                      <Show when={frame.file_path}>
                        <span class="debug-mode-frame-loc">{basename(frame.file_path!)}:{frame.line}</span>
                      </Show>
                    </div>
                  )}
                </For>
                <Show when={store.debugStackFrames.length === 0}>
                  <div class="debug-mode-empty">No frames</div>
                </Show>
              </div>
            </div>
          </div>
        </Show>
      </div>
      <div class="debug-mode-console">
        <div class="debug-mode-console-header">Debug Console</div>
        <div class="debug-mode-console-output" ref={consoleRef}>
          <For each={store.debugOutput}>
            {(line) => <div class="debug-mode-console-line">{line}</div>}
          </For>
          <Show when={store.debugOutput.length === 0}>
            <div class="debug-mode-console-line" style={{ color: "var(--text-subtext0)" }}>
              Waiting for output...
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default DebugMode;
