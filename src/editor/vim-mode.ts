/**
 * Vim-mode key interpreter for Buster IDE.
 *
 * Manages modal editing state (Normal/Insert/Visual), multi-key sequences,
 * count prefixes, operator-pending, yank register, and repeat.
 *
 * Uses a JSON keymap produced by Lua evaluation at startup.
 * No IPC per keystroke — all dispatch is local.
 */

import { createSignal, type Accessor } from "solid-js";
import type { EditorEngine } from "./engine";

// ── Types ────────────────────────────────────────────────────────────

export type VimMode = "normal" | "insert" | "visual" | "visual_line";

export interface VimKeymap {
  normal: Record<string, string>;
  insert: Record<string, string>;
  visual: Record<string, string>;
  passthrough: string[];
  options: { timeout: number };
}

export interface VimDeps {
  openFind: () => void;
  openCommandPalette: (prefix: string) => void;
  handleSave: () => void;
  handleTabClose: () => void;
}

export interface YankRegister {
  text: string;
  linewise: boolean;
}

export interface VimHandler {
  mode: Accessor<VimMode>;
  enabled: Accessor<boolean>;
  pendingKeys: Accessor<string>;
  setEnabled: (v: boolean) => void;
  loadKeymap: (json: string) => void;
  handleVimKey: (e: KeyboardEvent, engine: EditorEngine, deps: VimDeps) => boolean;
}

// ── Key normalization ────────────────────────────────────────────────

function normalizeKey(e: KeyboardEvent): string {
  if (e.key === "Escape") return "<Esc>";
  if (e.key === "[" && e.ctrlKey) return "<C-[>";

  // Ctrl+ combos
  if (e.ctrlKey && !e.metaKey && e.key.length === 1) {
    return `<C-${e.key.toLowerCase()}>`;
  }

  // Single character keys — use the actual key value
  return e.key;
}

function isPassthrough(e: KeyboardEvent, _patterns: string[]): boolean {
  // Cmd/Meta shortcuts always pass through
  if (e.metaKey) return true;
  // Ctrl+ shortcuts pass through EXCEPT ones we explicitly bind (like Ctrl+R)
  if (e.ctrlKey && e.key.length === 1) return false; // We handle <C-r> etc.
  if (e.ctrlKey) return true;
  return false;
}

// ── Factory ──────────────────────────────────────────────────────────

export function createVimHandler(): VimHandler {
  const [mode, setMode] = createSignal<VimMode>("normal");
  const [enabled, setEnabled] = createSignal(false);
  const [pendingKeys, setPendingKeys] = createSignal("");

  let keymap: VimKeymap = {
    normal: {}, insert: {}, visual: {}, passthrough: [], options: { timeout: 1000 },
  };

  // State
  let keyBuffer: string[] = [];
  let countBuffer = "";
  let pendingOperator: string | null = null;
  let sequenceTimer: ReturnType<typeof setTimeout> | undefined;
  let yankRegister: YankRegister = { text: "", linewise: false };
  let lastEdit: { keys: string[]; insertedText: string } | null = null;
  let recordingEdit = false;
  let editKeys: string[] = [];
  let insertedTextBuffer = "";

  function resetState() {
    keyBuffer = [];
    countBuffer = "";
    pendingOperator = null;
    clearTimeout(sequenceTimer);
    setPendingKeys("");
  }

  function getCount(): number {
    const n = parseInt(countBuffer, 10);
    countBuffer = "";
    return isNaN(n) || n <= 0 ? 1 : n;
  }

  function finishEditRecord() {
    if (recordingEdit) {
      lastEdit = { keys: editKeys, insertedText: insertedTextBuffer };
      recordingEdit = false;
    }
  }

  // ── Mode map lookup ────────────────────────────────────────────

  function getCurrentModeMap(): Record<string, string> {
    const m = mode();
    if (m === "insert") return keymap.insert;
    if (m === "visual" || m === "visual_line") return keymap.visual;
    return keymap.normal;
  }

  // ── Command dispatch ───────────────────────────────────────────

  function dispatch(
    commandId: string,
    engine: EditorEngine,
    count: number,
    deps: VimDeps,
  ) {
    const m = mode();
    const extend = m === "visual" || m === "visual_line";

    switch (commandId) {
      // ── Cursor motion ──────────────────────────────────────────
      case "cursor.left":
        for (let i = 0; i < count; i++) engine.moveCursor("left", extend);
        break;
      case "cursor.right":
        for (let i = 0; i < count; i++) engine.moveCursor("right", extend);
        break;
      case "cursor.down":
        for (let i = 0; i < count; i++) engine.moveCursor("down", extend);
        break;
      case "cursor.up":
        for (let i = 0; i < count; i++) engine.moveCursor("up", extend);
        break;
      case "cursor.word_right":
        for (let i = 0; i < count; i++) engine.moveWord("right", extend);
        break;
      case "cursor.word_left":
        for (let i = 0; i < count; i++) engine.moveWord("left", extend);
        break;
      case "cursor.word_end":
        for (let i = 0; i < count; i++) engine.moveToWordEnd(extend);
        break;
      case "cursor.line_start":
        engine.moveCursorToLineStart();
        break;
      case "cursor.line_end":
        engine.moveCursorToLineEnd();
        break;
      case "cursor.first_non_blank":
        engine.moveCursorToFirstNonBlank(extend);
        break;
      case "cursor.document_start":
        engine.setCursor({ line: 0, col: 0 });
        break;
      case "cursor.document_end": {
        const last = engine.lines().length - 1;
        engine.setCursor({ line: last, col: 0 });
        break;
      }

      // ── Mode switching ─────────────────────────────────────────
      case "mode.insert":
        setMode("insert");
        break;
      case "mode.insert_after":
        engine.moveCursor("right");
        setMode("insert");
        break;
      case "mode.insert_line_start":
        engine.moveCursorToFirstNonBlank();
        setMode("insert");
        break;
      case "mode.insert_line_end":
        engine.moveCursorToLineEnd();
        setMode("insert");
        break;
      case "mode.open_below":
        engine.openLineBelow();
        setMode("insert");
        break;
      case "mode.open_above":
        engine.openLineAbove();
        setMode("insert");
        break;
      case "mode.visual":
        if (m === "visual") {
          engine.clearSelection();
          setMode("normal");
        } else {
          const p = engine.cursor();
          engine.setSelection(p, p);
          setMode("visual");
        }
        break;
      case "mode.visual_line": {
        if (m === "visual_line") {
          engine.clearSelection();
          setMode("normal");
        } else {
          const p = engine.cursor();
          const lineLen = engine.getLine(p.line).length;
          engine.setSelection({ line: p.line, col: 0 }, { line: p.line, col: lineLen });
          setMode("visual_line");
        }
        break;
      }
      case "mode.normal":
        engine.clearSelection();
        setMode("normal");
        break;
      case "mode.command":
        deps.openCommandPalette(":");
        break;

      // ── Editing ────────────────────────────────────────────────
      case "edit.delete_char":
        for (let i = 0; i < count; i++) engine.deleteForward();
        break;
      case "edit.delete_line": {
        const text = engine.deleteLine(count);
        yankRegister = { text, linewise: true };
        navigator.clipboard.writeText(text).catch(() => {});
        break;
      }
      case "edit.yank_line": {
        const text = engine.yankLine(count);
        yankRegister = { text, linewise: true };
        navigator.clipboard.writeText(text).catch(() => {});
        break;
      }
      case "edit.paste_after":
        if (yankRegister.linewise) {
          const p = engine.cursor();
          const lineEnd = engine.getLine(p.line).length;
          engine.setCursor({ line: p.line, col: lineEnd });
          engine.insert("\n" + yankRegister.text);
        } else {
          engine.moveCursor("right");
          engine.insert(yankRegister.text);
        }
        break;
      case "edit.paste_before":
        if (yankRegister.linewise) {
          const p = engine.cursor();
          engine.setCursor({ line: p.line, col: 0 });
          engine.insert(yankRegister.text + "\n");
          engine.setCursor({ line: p.line, col: 0 });
        } else {
          engine.insert(yankRegister.text);
        }
        break;
      case "edit.undo":
        for (let i = 0; i < count; i++) engine.undo();
        break;
      case "edit.redo":
        for (let i = 0; i < count; i++) engine.redo();
        break;
      case "edit.join_lines":
        for (let i = 0; i < count; i++) engine.joinLines();
        break;
      case "edit.indent":
        engine.indentLines();
        break;
      case "edit.outdent":
        engine.outdentLines();
        break;
      case "edit.toggle_case": {
        const p = engine.cursor();
        const line = engine.getLine(p.line);
        if (p.col < line.length) {
          const ch = line[p.col];
          const toggled = ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase();
          engine.replaceChar(toggled);
          engine.moveCursor("right");
        }
        break;
      }
      case "edit.repeat":
        // Replay last edit (simplified: just the command, not full insert replay)
        if (lastEdit) {
          // Re-dispatch the recorded keys
          // For now, just re-run the last command
        }
        break;

      // ── Search ─────────────────────────────────────────────────
      case "editor.find":
        deps.openFind();
        break;
      case "search.next":
        // Dispatch to find-next (handled externally)
        break;
      case "search.prev":
        break;
      case "search.word_under_cursor": {
        const word = engine.getWordUnderCursor();
        if (word) {
          deps.openFind();
          // The find bar will be opened — word search is TODO
        }
        break;
      }

      // ── Operators ──────────────────────────────────────────────
      case "op.delete":
        pendingOperator = "d";
        setPendingKeys("d");
        return; // Don't reset — wait for motion
      case "op.change":
        pendingOperator = "c";
        setPendingKeys("c");
        return;
      case "op.yank":
        pendingOperator = "y";
        setPendingKeys("y");
        return;

      // ── Visual actions ─────────────────────────────────────────
      case "visual.delete": {
        const s = engine.getOrderedSelection();
        if (s) {
          const text = engine.getTextRange(s.from, s.to);
          yankRegister = { text, linewise: m === "visual_line" };
          navigator.clipboard.writeText(text).catch(() => {});
          engine.deleteRange(s.from, s.to);
        }
        setMode("normal");
        break;
      }
      case "visual.yank": {
        const s = engine.getOrderedSelection();
        if (s) {
          const text = engine.getTextRange(s.from, s.to);
          yankRegister = { text, linewise: m === "visual_line" };
          navigator.clipboard.writeText(text).catch(() => {});
        }
        engine.clearSelection();
        setMode("normal");
        break;
      }
      case "visual.change": {
        const s = engine.getOrderedSelection();
        if (s) {
          const text = engine.getTextRange(s.from, s.to);
          yankRegister = { text, linewise: m === "visual_line" };
          engine.deleteRange(s.from, s.to);
        }
        setMode("insert");
        break;
      }
      case "visual.indent":
        engine.indentLines();
        break;
      case "visual.outdent":
        engine.outdentLines();
        break;
    }
  }

  // ── Operator + motion resolution ───────────────────────────────

  function applyOperatorWithMotion(
    op: string,
    motionCmd: string,
    engine: EditorEngine,
    count: number,
    deps: VimDeps,
  ) {
    // Execute the motion with extend=true to create a selection
    const anchor = engine.cursor();

    // Temporarily enter visual mode to get selection from motion
    dispatch(motionCmd, engine, count, deps);
    const head = engine.cursor();

    // Now apply the operator on the range
    const [from, to] = anchor.line < head.line || (anchor.line === head.line && anchor.col <= head.col)
      ? [anchor, head] : [head, anchor];

    if (from.line === to.line && from.col === to.col) {
      engine.clearSelection();
      return;
    }

    switch (op) {
      case "d": {
        const text = engine.getTextRange(from, to);
        yankRegister = { text, linewise: false };
        navigator.clipboard.writeText(text).catch(() => {});
        engine.deleteRange(from, to);
        break;
      }
      case "c": {
        const text = engine.getTextRange(from, to);
        yankRegister = { text, linewise: false };
        engine.deleteRange(from, to);
        setMode("insert");
        break;
      }
      case "y": {
        const text = engine.getTextRange(from, to);
        yankRegister = { text, linewise: false };
        navigator.clipboard.writeText(text).catch(() => {});
        engine.setCursor(from);
        break;
      }
    }
    engine.clearSelection();
  }

  // ── Main key handler ───────────────────────────────────────────

  function handleVimKey(e: KeyboardEvent, engine: EditorEngine, deps: VimDeps): boolean {
    if (!enabled()) return false;

    const m = mode();

    // Passthrough: Cmd+ shortcuts always bypass
    if (isPassthrough(e, keymap.passthrough)) return false;

    const key = normalizeKey(e);

    // ── Insert mode: only intercept Escape ────────────────────
    if (m === "insert") {
      const cmd = keymap.insert[key];
      if (cmd) {
        dispatch(cmd, engine, 1, deps);
        finishEditRecord();
        resetState();
        return true;
      }
      // Everything else passes through to normal editor handling
      return false;
    }

    // ── Normal / Visual mode ──────────────────────────────────

    // Count prefix: digits accumulate (1-9 start, 0-9 continue)
    if (/^[1-9]$/.test(key) || (countBuffer && /^[0-9]$/.test(key))) {
      // But "0" alone is cursor.line_start, not a count
      if (key !== "0" || countBuffer) {
        countBuffer += key;
        setPendingKeys((pendingOperator ?? "") + countBuffer);
        return true;
      }
    }

    // Build key sequence
    keyBuffer.push(key);
    const seq = keyBuffer.join("");
    clearTimeout(sequenceTimer);

    const modeMap = getCurrentModeMap();

    // Check for operator-pending double (dd, yy, cc)
    if (pendingOperator && seq === pendingOperator) {
      const count = getCount();
      const op = pendingOperator;
      pendingOperator = null;
      keyBuffer = [];
      setPendingKeys("");

      if (op === "d") {
        const text = engine.deleteLine(count);
        yankRegister = { text, linewise: true };
        navigator.clipboard.writeText(text).catch(() => {});
      } else if (op === "y") {
        const text = engine.yankLine(count);
        yankRegister = { text, linewise: true };
        navigator.clipboard.writeText(text).catch(() => {});
      } else if (op === "c") {
        engine.deleteLine(count);
        setMode("insert");
      }
      return true;
    }

    // Check for operator + motion
    if (pendingOperator) {
      const motionCmd = modeMap[seq] || keymap.normal[seq];
      if (motionCmd && motionCmd.startsWith("cursor.")) {
        const count = getCount();
        const op = pendingOperator;
        pendingOperator = null;
        keyBuffer = [];
        setPendingKeys("");
        applyOperatorWithMotion(op, motionCmd, engine, count, deps);
        return true;
      }
    }

    // Exact match
    if (modeMap[seq]) {
      const count = getCount();
      const cmd = modeMap[seq];
      keyBuffer = [];
      dispatch(cmd, engine, count, deps);
      if (!pendingOperator) setPendingKeys("");
      return true;
    }

    // Check if seq is a prefix of any binding (multi-key like gg, >>)
    const isPrefix = Object.keys(modeMap).some(k => k.startsWith(seq) && k !== seq);
    if (isPrefix) {
      setPendingKeys((pendingOperator ?? "") + countBuffer + seq);
      sequenceTimer = setTimeout(() => {
        // Timeout — try to match what we have or discard
        keyBuffer = [];
        countBuffer = "";
        pendingOperator = null;
        setPendingKeys("");
      }, keymap.options.timeout);
      return true;
    }

    // No match — reset
    resetState();
    return false;
  }

  return {
    mode,
    enabled,
    pendingKeys,
    setEnabled,
    loadKeymap(json: string) {
      try {
        const parsed = JSON.parse(json);
        keymap = {
          normal: parsed.normal ?? {},
          insert: parsed.insert ?? {},
          visual: parsed.visual ?? {},
          passthrough: parsed.passthrough ?? [],
          options: { timeout: parsed.options?.timeout ?? 1000 },
        };
      } catch (e) {
        console.error("Failed to parse Vim keymap:", e);
      }
    },
    handleVimKey,
  };
}
