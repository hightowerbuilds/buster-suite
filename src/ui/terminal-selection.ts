import type { TermCell } from "./terminal-binary";

export interface TerminalCellPos {
  row: number;
  col: number;
}

export interface TerminalSelection {
  start: TerminalCellPos;
  end: TerminalCellPos;
}

const SHELL_WORD_DELIMITERS = new Set([
  " ", "\t", "\n", "\r",
  ";", "|", "&", "(", ")", "<", ">", "`",
  "\"", "'", "$", "\\",
]);

export function normalizeTerminalSelection(
  start: TerminalCellPos | null,
  end: TerminalCellPos | null,
): TerminalSelection | null {
  if (!start || !end) return null;
  if (start.row > end.row || (start.row === end.row && start.col > end.col)) {
    return { start: end, end: start };
  }
  return { start, end };
}

export function terminalRowText(rowCells: TermCell[] | undefined): string {
  return (rowCells ?? []).map((cell) => cell?.ch || " ").join("");
}

export function isTerminalWordChar(ch: string): boolean {
  return ch.length > 0 && !SHELL_WORD_DELIMITERS.has(ch);
}

export function findTerminalWordBounds(rowText: string, col: number): { start: number; end: number } {
  if (!rowText) return { start: 0, end: 0 };
  let target = Math.max(0, Math.min(col, rowText.length - 1));

  if (!isTerminalWordChar(rowText[target])) {
    let right = target + 1;
    while (right < rowText.length && !isTerminalWordChar(rowText[right])) right++;
    if (right < rowText.length) target = right;
  }

  if (!isTerminalWordChar(rowText[target])) return { start: target, end: target };

  let start = target;
  while (start > 0 && isTerminalWordChar(rowText[start - 1])) start--;

  let end = target;
  while (end + 1 < rowText.length && isTerminalWordChar(rowText[end + 1])) end++;

  return { start, end };
}

export function getTerminalSelectedText(
  rows: (TermCell[] | undefined)[],
  start: TerminalCellPos | null,
  end: TerminalCellPos | null,
): string {
  const sel = normalizeTerminalSelection(start, end);
  if (!sel) return "";

  let text = "";
  for (let row = sel.start.row; row <= sel.end.row; row++) {
    const rowText = terminalRowText(rows[row]);
    const cs = row === sel.start.row ? sel.start.col : 0;
    const ce = row === sel.end.row ? sel.end.col : rowText.length - 1;
    text += rowText.slice(cs, ce + 1);
    if (row < sel.end.row) text += "\n";
  }
  return text.replace(/\s+$/gm, "");
}
