/**
 * Tests for the syntax highlighter's byte-to-char-offset conversion.
 *
 * spansToLineTokens is the bridge between tree-sitter (byte offsets)
 * and the canvas renderer (char offsets per line). Getting this wrong
 * causes misaligned highlighting.
 */

import { describe, it, expect } from "vitest";
import { spansToLineTokens, type HighlightSpan } from "./ts-highlighter";

// ── Basic mapping ────────────────────────────────────────────────────

describe("spansToLineTokens", () => {
  it("maps a single span on a single line", () => {
    const lines = ["hello world"];
    const spans: HighlightSpan[] = [
      { start_byte: 0, end_byte: 5, highlight_type: "keyword" },
    ];
    const result = spansToLineTokens(spans, lines);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].start).toBe(0);
    expect(result[0][0].end).toBe(5);
  });

  it("maps multiple spans on a single line", () => {
    const lines = ["let x = 5;"];
    const spans: HighlightSpan[] = [
      { start_byte: 0, end_byte: 3, highlight_type: "keyword" },    // "let"
      { start_byte: 4, end_byte: 5, highlight_type: "variable" },   // "x"
      { start_byte: 8, end_byte: 9, highlight_type: "number" },     // "5"
    ];
    const result = spansToLineTokens(spans, lines);
    expect(result[0]).toHaveLength(3);
    expect(result[0][0]).toMatchObject({ start: 0, end: 3 });
    expect(result[0][1]).toMatchObject({ start: 4, end: 5 });
    expect(result[0][2]).toMatchObject({ start: 8, end: 9 });
  });

  it("maps spans across multiple lines", () => {
    const lines = ["aaa", "bbb"];
    // Byte layout: "aaa\nbbb" -> aaa at 0-3, \n at 3, bbb at 4-7
    const spans: HighlightSpan[] = [
      { start_byte: 0, end_byte: 3, highlight_type: "keyword" },   // "aaa"
      { start_byte: 4, end_byte: 7, highlight_type: "string" },    // "bbb"
    ];
    const result = spansToLineTokens(spans, lines);
    expect(result[0]).toHaveLength(1);
    expect(result[0][0]).toMatchObject({ start: 0, end: 3 });
    expect(result[1]).toHaveLength(1);
    expect(result[1][0]).toMatchObject({ start: 0, end: 3 });
  });

  it("handles empty lines", () => {
    const lines = ["aaa", "", "bbb"];
    // Byte layout: "aaa\n\nbbb" -> aaa at 0-3, \n at 3, \n at 4, bbb at 5-8
    const spans: HighlightSpan[] = [
      { start_byte: 5, end_byte: 8, highlight_type: "keyword" },
    ];
    const result = spansToLineTokens(spans, lines);
    expect(result[0]).toHaveLength(0);
    expect(result[1]).toHaveLength(0);
    expect(result[2]).toHaveLength(1);
    expect(result[2][0]).toMatchObject({ start: 0, end: 3 });
  });

  it("returns empty arrays when no spans", () => {
    const lines = ["hello", "world"];
    const result = spansToLineTokens([], lines);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(0);
    expect(result[1]).toHaveLength(0);
  });

  it("handles empty document", () => {
    const result = spansToLineTokens([], [""]);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(0);
  });

  it("handles multi-byte UTF-8 characters", () => {
    // "café" -> bytes: c(1) a(1) f(1) é(2) = 5 bytes but 4 chars
    const lines = ["café"];
    const spans: HighlightSpan[] = [
      { start_byte: 0, end_byte: 5, highlight_type: "string" },
    ];
    const result = spansToLineTokens(spans, lines);
    expect(result[0]).toHaveLength(1);
    // Should cover all 4 chars
    expect(result[0][0].start).toBe(0);
    expect(result[0][0].end).toBe(4);
  });

  it("handles span that crosses a line boundary", () => {
    const lines = ["aa", "bb"];
    // Byte layout: "aa\nbb" -> span covers bytes 1-4 which is "a\nb"
    const spans: HighlightSpan[] = [
      { start_byte: 1, end_byte: 4, highlight_type: "comment" },
    ];
    const result = spansToLineTokens(spans, lines);
    // Should appear on both lines
    expect(result[0].length).toBeGreaterThanOrEqual(1);
    expect(result[1].length).toBeGreaterThanOrEqual(1);
  });
});

// ── Performance ──────────────────────────────────────────────────────

describe("perf: spansToLineTokens", () => {
  it("1,000 spans over 500 lines under 20ms", () => {
    const lines: string[] = [];
    for (let i = 0; i < 500; i++) {
      lines.push("const x = someFunction(arg1, arg2);");
    }
    // Generate realistic spans
    const spans: HighlightSpan[] = [];
    let byteOffset = 0;
    for (let i = 0; i < 500; i++) {
      const lineBytes = new TextEncoder().encode(lines[i]).length;
      // Two spans per line
      spans.push({ start_byte: byteOffset, end_byte: byteOffset + 5, highlight_type: "keyword" });
      spans.push({ start_byte: byteOffset + 6, end_byte: byteOffset + 7, highlight_type: "variable" });
      byteOffset += lineBytes + 1; // +1 for \n
    }

    const start = performance.now();
    spansToLineTokens(spans, lines);
    const ms = performance.now() - start;
    console.log(`  spansToLineTokens 1k spans / 500 lines: ${ms.toFixed(2)} ms`);
    expect(ms).toBeLessThan(20);
  });
});
