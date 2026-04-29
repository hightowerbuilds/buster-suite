import type { TermCell } from "./terminal-binary";
import { terminalRowText, type TerminalCellPos } from "./terminal-selection";

export interface TerminalUrlMatch {
  row: number;
  startCol: number;
  endCol: number;
  url: string;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+/g;
const TRAILING_PUNCTUATION = /[),.;:!?]+$/;

export function findTerminalUrls(rows: (TermCell[] | undefined)[]): TerminalUrlMatch[] {
  const matches: TerminalUrlMatch[] = [];
  for (let row = 0; row < rows.length; row++) {
    const text = terminalRowText(rows[row]);
    for (const match of text.matchAll(URL_RE)) {
      const raw = match[0];
      const start = match.index ?? 0;
      const url = raw.replace(TRAILING_PUNCTUATION, "");
      if (!url) continue;
      matches.push({
        row,
        startCol: start,
        endCol: start + url.length - 1,
        url,
      });
    }
  }
  return matches;
}

export function terminalUrlAt(
  rows: (TermCell[] | undefined)[],
  pos: TerminalCellPos,
): TerminalUrlMatch | null {
  return findTerminalUrls(rows).find((match) =>
    match.row === pos.row &&
    pos.col >= match.startCol &&
    pos.col <= match.endCol
  ) ?? null;
}
