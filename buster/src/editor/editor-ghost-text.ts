import { createSignal } from "solid-js";
import type { PhantomText } from "./canvas-renderer";

export interface GhostTextDeps {
  filePath: () => string | null;
  cursorLine: () => number;
  cursorCol: () => number;
  content: () => { lines: string[] } | null;
  apiKey: () => string;
}

export function createGhostText(deps: GhostTextDeps) {
  const [ghostLine, setGhostLine] = createSignal<number | null>(null);
  const [ghostCol, setGhostCol] = createSignal<number | null>(null);
  const [ghostText, setGhostText] = createSignal("");
  let debounceTimer: number | undefined;
  let abortController: AbortController | null = null;

  function dismiss() {
    setGhostText("");
    setGhostLine(null);
    setGhostCol(null);
    if (debounceTimer) clearTimeout(debounceTimer);
    if (abortController) { abortController.abort(); abortController = null; }
  }

  function scheduleRequest() {
    if (!deps.filePath() || !deps.apiKey()) return;
    dismiss();
    debounceTimer = setTimeout(async () => {
      if (!deps.filePath() || !deps.content()) return;

      const line = deps.cursorLine();
      const col = deps.cursorCol();
      const lines = deps.content()!.lines;

      // Build context: lines around cursor
      const contextStart = Math.max(0, line - 30);
      const contextEnd = Math.min(lines.length, line + 10);
      const before = lines.slice(contextStart, line).join("\n");
      const currentLine = lines[line] || "";
      const prefix = currentLine.slice(0, col);
      const suffix = currentLine.slice(col);
      const after = lines.slice(line + 1, contextEnd).join("\n");

      // Skip if cursor is at start of empty line (nothing to complete)
      if (prefix.trim() === "" && suffix.trim() === "" && before.trim() === "") return;

      try {
        abortController = new AbortController();
        const { invoke } = await import("@tauri-apps/api/core");
        const result = await invoke<string>("ai_inline_complete", {
          apiKey: deps.apiKey(),
          before: before + "\n" + prefix,
          after: suffix + "\n" + after,
          filePath: deps.filePath(),
        });

        if (result && result.trim()) {
          setGhostText(result);
          setGhostLine(line);
          setGhostCol(col);
        }
      } catch {
        // Request cancelled or failed
      }
      abortController = null;
    }, 800) as unknown as number;
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

    // Split ghost text into lines — first line is inline, rest are separate phantom entries
    const ghostLines = text.split("\n");
    const result: PhantomText[] = [];
    for (let i = 0; i < ghostLines.length; i++) {
      if (ghostLines[i]) {
        result.push({
          line: line + i,
          col: i === 0 ? col : 0,
          text: ghostLines[i],
          style: "ghost",
        });
      }
    }
    return result;
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
