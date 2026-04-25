/**
 * Ghost text — AI inline code completion via streaming.
 *
 * Supports local models (Ollama) and cloud providers (Anthropic, OpenAI).
 * Debounces requests, streams tokens as they arrive, renders as semi-transparent
 * PhantomText on the canvas. Tab accepts, Escape or any keystroke dismisses.
 */

import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { PhantomText } from "./canvas-renderer";
import type { AppSettings } from "../lib/ipc";

export interface GhostTextDeps {
  filePath: () => string | null;
  cursorLine: () => number;
  cursorCol: () => number;
  content: () => { lines: string[]; total_lines?: number; file_path?: string | null; edit_seq?: number } | null;
  settings: () => AppSettings;
}

interface CompletionToken {
  request_id: number;
  token: string;
  done: boolean;
}

interface CompletionError {
  request_id: number;
  message: string;
}

export function createGhostText(deps: GhostTextDeps) {
  const [ghostText, setGhostText] = createSignal("");
  const [ghostLine, setGhostLine] = createSignal<number | null>(null);
  const [ghostCol, setGhostCol] = createSignal<number | null>(null);

  let requestCounter = 0;
  let activeRequestId = 0;
  let debounceTimer: number | null = null;
  let accumulator = "";

  // Set up Tauri event listeners
  listen<CompletionToken>("ai-completion-token", (event) => {
    const { request_id, token, done } = event.payload;
    // Ignore stale responses
    if (request_id !== activeRequestId) return;

    accumulator += token;

    setGhostText(accumulator);
    setGhostLine(deps.cursorLine());
    setGhostCol(deps.cursorCol());

    if (done) {
      activeRequestId = 0;
    }
  });

  listen<CompletionError>("ai-completion-error", (event) => {
    if (event.payload.request_id === activeRequestId) {
      dismiss();
      activeRequestId = 0;
    }
  });

  function dismiss() {
    setGhostText("");
    setGhostLine(null);
    setGhostCol(null);
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (activeRequestId > 0) {
      invoke("ai_completion_cancel").catch(() => {});
      activeRequestId = 0;
      accumulator = "";
    }
  }

  function scheduleRequest() {
    // Always dismiss current ghost text when user types
    dismiss();

    const settings = deps.settings();
    if (!settings.ai_completion_enabled) return;
    if (!deps.filePath()) return;

    // Debounce: longer for local models (slow), shorter for cloud (fast)
    const delay = settings.ai_provider === "ollama" ? 1500 : 500;

    debounceTimer = setTimeout(() => {
      fireRequest();
    }, delay) as unknown as number;
  }

  async function fireRequest() {
    const content = deps.content();
    if (!content) return;

    const line = deps.cursorLine();
    const col = deps.cursorCol();
    const lines = content.lines;

    // Build prefix: up to 50 lines before cursor + current line up to cursor
    const prefixStart = Math.max(0, line - 50);
    const prefixLines = lines.slice(prefixStart, line);
    const currentLinePrefix = (lines[line] ?? "").slice(0, col);
    const prefix = [...prefixLines, currentLinePrefix].join("\n");

    // Build suffix: rest of current line after cursor + up to 10 lines after
    const currentLineSuffix = (lines[line] ?? "").slice(col);
    const suffixEnd = Math.min(lines.length, line + 11);
    const suffixLines = lines.slice(line + 1, suffixEnd);
    const suffix = [currentLineSuffix, ...suffixLines].join("\n");

    // Skip if prefix is too short
    if (prefix.trim().length < 3) return;

    const requestId = ++requestCounter;
    activeRequestId = requestId;
    accumulator = "";

    // Derive language from file extension
    const fp = deps.filePath() ?? "";
    const ext = fp.split(".").pop() ?? "";

    try {
      await invoke("ai_completion_request", {
        request: {
          request_id: requestId,
          file_path: fp,
          language: ext,
          prefix,
          suffix,
          cursor_line: line,
          cursor_col: col,
        },
      });
    } catch {
      // Connection error — silently ignore
      activeRequestId = 0;
    }
  }

  function accept(): string | null {
    const text = ghostText();
    if (!text) return null;
    dismiss();
    return text;
  }

  function getPhantomTexts(): PhantomText[] {
    const text = ghostText();
    const line = ghostLine();
    const col = ghostCol();
    if (!text || line === null || col === null) return [];

    // Split multiline ghost text into per-line phantoms
    const parts = text.split("\n");
    return parts.map((part, i) => ({
      line: line + i,
      col: i === 0 ? col : 0,
      text: part,
      style: "ghost" as const,
    }));
  }

  return {
    ghostText,
    ghostLine,
    ghostCol,
    dismiss,
    scheduleRequest,
    accept,
    getPhantomTexts,
  };
}
