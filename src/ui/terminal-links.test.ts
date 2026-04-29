import { describe, expect, it } from "vitest";
import type { TermCell } from "./terminal-binary";
import { findTerminalUrls, terminalUrlAt } from "./terminal-links";

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

describe("terminal links", () => {
  it("detects http and https URLs in visible rows", () => {
    const matches = findTerminalUrls([
      row("dev server http://localhost:5173"),
      row("docs https://example.com/path?q=1"),
    ]);

    expect(matches.map((match) => match.url)).toEqual([
      "http://localhost:5173",
      "https://example.com/path?q=1",
    ]);
  });

  it("trims trailing sentence punctuation", () => {
    const [match] = findTerminalUrls([row("open https://example.com/test.")]);

    expect(match.url).toBe("https://example.com/test");
    expect(match.endCol).toBe("open https://example.com/test".length - 1);
  });

  it("finds the URL under a terminal cell", () => {
    const rows = [row("open http://localhost:3000 now")];

    expect(terminalUrlAt(rows, { row: 0, col: 8 })?.url).toBe("http://localhost:3000");
    expect(terminalUrlAt(rows, { row: 0, col: 2 })).toBeNull();
  });
});
