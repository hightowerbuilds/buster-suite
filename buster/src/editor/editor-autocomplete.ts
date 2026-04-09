import { createSignal } from "solid-js";
import type { CompletionItem } from "../lib/ipc";
import { lspCompletion } from "../lib/ipc";

export interface AutocompleteDeps {
  filePath: () => string | null;
  autocompleteEnabled: () => boolean;
  cursorLine: () => number;
  cursorCol: () => number;
  lines: () => string[];
  updateCursor: (line: number, col: number) => void;
  insertText: (text: string) => void;
  resetCursorBlink: () => void;
  clearHighlightCache: () => void;
}

export function createAutocomplete(deps: AutocompleteDeps) {
  const [completions, setCompletions] = createSignal<CompletionItem[]>([]);
  const [completionIdx, setCompletionIdx] = createSignal(0);
  const [completionVisible, setCompletionVisible] = createSignal(false);
  let triggerTimer: number | undefined;

  function dismiss() {
    setCompletionVisible(false);
    setCompletions([]);
    setCompletionIdx(0);
    if (triggerTimer) clearTimeout(triggerTimer);
  }

  function showItems(items: CompletionItem[]) {
    if (items.length > 0) {
      setCompletions(items);
      setCompletionIdx(0);
      setCompletionVisible(true);
    } else {
      dismiss();
    }
  }

  function trigger() {
    if (!deps.autocompleteEnabled() || !deps.filePath()) return;
    if (triggerTimer) clearTimeout(triggerTimer);
    triggerTimer = setTimeout(async () => {
      const fp = deps.filePath();
      if (!fp) return;
      try {
        const items = await lspCompletion(fp, deps.cursorLine(), deps.cursorCol());
        showItems(items.map(i => ({ label: i.label, detail: i.detail ?? "" })));
      } catch {
        dismiss();
      }
    }, 100) as unknown as number;
  }

  /** Parse snippet text into plain text, returning cursor offset for first tab stop. */
  function parseSnippet(text: string): { plain: string; cursorOffset: number } {
    let plain = "";
    let cursorOffset = -1;
    let i = 0;
    while (i < text.length) {
      if (text[i] === "$") {
        if (text[i + 1] === "{") {
          // ${1:placeholder} — extract placeholder text
          const close = text.indexOf("}", i + 2);
          if (close !== -1) {
            const inner = text.slice(i + 2, close);
            const colonIdx = inner.indexOf(":");
            const tabStop = colonIdx >= 0 ? parseInt(inner.slice(0, colonIdx)) : parseInt(inner);
            const placeholder = colonIdx >= 0 ? inner.slice(colonIdx + 1) : "";
            if (tabStop === 1 || (tabStop === 0 && cursorOffset < 0)) {
              cursorOffset = plain.length;
            }
            plain += placeholder;
            i = close + 1;
            continue;
          }
        } else if (/\d/.test(text[i + 1] ?? "")) {
          // $1, $0 — tab stop without placeholder
          const tabStop = parseInt(text[i + 1]);
          if (tabStop === 1 || (tabStop === 0 && cursorOffset < 0)) {
            cursorOffset = plain.length;
          }
          i += 2;
          continue;
        }
      }
      plain += text[i];
      i++;
    }
    return { plain, cursorOffset };
  }

  function accept() {
    const items = completions();
    const idx = completionIdx();
    if (idx < 0 || idx >= items.length) return;

    const item = items[idx];
    const line = deps.cursorLine();
    const col = deps.cursorCol();
    const lineText = deps.lines()[line] || "";
    const chars = [...lineText];
    let start = col;
    while (start > 0 && /[\w]/.test(chars[start - 1] || "")) {
      start--;
    }
    const prefix = chars.slice(start, col).join("");
    let remaining = item.label.slice(prefix.length);

    // Check if the completion text contains snippet syntax
    const hasSnippet = remaining.includes("$");
    if (hasSnippet) {
      const { plain, cursorOffset } = parseSnippet(remaining);
      remaining = plain;
      if (remaining.length > 0) {
        deps.insertText(remaining);
        deps.clearHighlightCache();
        // Move cursor to first tab stop if found
        if (cursorOffset >= 0 && cursorOffset < remaining.length) {
          const newCol = col + cursorOffset;
          deps.updateCursor(line, newCol);
        }
      }
    } else if (remaining.length > 0) {
      deps.insertText(remaining);
      deps.clearHighlightCache();
    }
    dismiss();
    deps.resetCursorBlink();
  }

  function navigateDown() {
    setCompletionIdx(Math.min(completionIdx() + 1, Math.min(completions().length - 1, 7)));
  }

  function navigateUp() {
    setCompletionIdx(Math.max(completionIdx() - 1, 0));
  }

  return {
    completions,
    completionIdx,
    completionVisible,
    dismiss,
    trigger,
    showItems,
    accept,
    navigateDown,
    navigateUp,
  };
}
