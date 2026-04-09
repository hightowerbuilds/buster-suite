import { createSignal, Index, type JSX } from "solid-js";
import { createDebouncedAnnounce } from "../lib/a11y";

// ─── Types ──────────────────────────────────────────────────────────

interface ChangedRow {
  index: number;
  cells: { ch: string }[];
}

interface TermScreenDelta {
  rows: number;
  cols: number;
  cursor_row: number;
  cursor_col: number;
  changed_rows: ChangedRow[];
  full: boolean;
}

// ─── Factory ────────────────────────────────────────────────────────

export function createTerminalA11y() {
  const [rowTexts, setRowTexts] = createSignal<string[]>([]);
  const [outputAnnouncement, setOutputAnnouncement] = createSignal("");

  const debouncedOutput = createDebouncedAnnounce(200, "polite");

  let prevRowTexts: string[] = [];

  // ── Called from the terminal-screen event listener ───────────────

  function onScreenDelta(delta: TermScreenDelta) {
    // Update row text signals
    setRowTexts((prev) => {
      const next = delta.full || prev.length !== delta.rows
        ? new Array<string>(delta.rows).fill("")
        : [...prev];

      for (const cr of delta.changed_rows) {
        next[cr.index] = cr.cells.map((c) => c.ch).join("").replace(/\s+$/, "");
      }
      return next;
    });

    // Detect new output (content changes beyond just cursor movement)
    const currentTexts = rowTexts();
    let newOutput = "";
    for (const cr of delta.changed_rows) {
      const newText = currentTexts[cr.index] ?? "";
      const oldText = prevRowTexts[cr.index] ?? "";
      if (newText !== oldText && newText.trim()) {
        newOutput = newText;
      }
    }

    if (newOutput) {
      setOutputAnnouncement(newOutput);
      debouncedOutput(newOutput);
    }

    prevRowTexts = currentTexts.slice();
  }

  // ── Cleanup ─────────────────────────────────────────────────────

  function cleanup() {
    // reserved for future timer cleanup
  }

  // ── Parallel DOM component ──────────────────────────────────────

  function ParallelDOM(): JSX.Element {
    return (
      <div
        class="visually-hidden"
        role="log"
        aria-label="Terminal output"
        aria-roledescription="terminal"
      >
        <Index each={rowTexts()}>
          {(row) => <div>{row() || "\u00A0"}</div>}
        </Index>
        <div aria-live="polite" aria-atomic="true">
          {outputAnnouncement()}
        </div>
      </div>
    ) as unknown as JSX.Element;
  }

  return { ParallelDOM, onScreenDelta, cleanup };
}
