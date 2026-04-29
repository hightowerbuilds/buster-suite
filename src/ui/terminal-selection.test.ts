import { describe, expect, it } from "vitest";
import type { TermCell } from "./terminal-binary";
import {
  findTerminalWordBounds,
  getTerminalSelectedText,
  isTerminalWordChar,
  normalizeTerminalSelection,
} from "./terminal-selection";

function row(text: string): TermCell[] {
  return [...text].map((ch) => ({
    ch,
    fg: [255, 255, 255],
    bg: [0, 0, 0],
    bold: false,
    italic: false,
    underline: false,
    inverse: false,
    strikethrough: false,
    faint: false,
    width: 1,
  }));
}

describe("terminal selection helpers", () => {
  it("normalizes reversed selections", () => {
    expect(normalizeTerminalSelection({ row: 2, col: 4 }, { row: 1, col: 3 })).toEqual({
      start: { row: 1, col: 3 },
      end: { row: 2, col: 4 },
    });
  });

  it("treats shell metacharacters as word delimiters", () => {
    expect(isTerminalWordChar("|")).toBe(false);
    expect(isTerminalWordChar(";")).toBe(false);
    expect(isTerminalWordChar("a")).toBe(true);
  });

  it("finds word bounds around shell paths and flags", () => {
    expect(findTerminalWordBounds("bun run dev | cat", 2)).toEqual({ start: 0, end: 2 });
    expect(findTerminalWordBounds("bun run dev | cat", 14)).toEqual({ start: 14, end: 16 });
    expect(findTerminalWordBounds("git commit --amend", 13)).toEqual({ start: 11, end: 17 });
  });

  it("extracts text across rows and trims right padding per line", () => {
    const text = getTerminalSelectedText(
      [row("hello   "), row("world   ")],
      { row: 0, col: 1 },
      { row: 1, col: 2 },
    );

    expect(text).toBe("ello\nwor");
  });
});
