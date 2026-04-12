/**
 * Performance comparison: Pretext vs raw OffscreenCanvas.measureText()
 *
 * Measures both approaches side-by-side on realistic editor workloads:
 *   1. Single monospace char width (the getCharWidth hot path)
 *   2. Arbitrary string measurement (signature help, tooltips)
 *   3. Repeated measurement of the same string (cache behavior)
 *   4. Batch measurement of many different strings (real-world diversity)
 */

import { describe, it, expect } from "vitest";
import { getCharWidth, measureTextWidth, FONT_FAMILY } from "./text-measure";
import { prepareWithSegments, layoutWithLines } from "@chenglou/pretext";

const FONT = `14px ${FONT_FAMILY}`;
const ITERATIONS = 5_000;

// ── Old approach (raw OffscreenCanvas) for comparison ────────────────

function oldMeasureChar(fontSize: number): number {
  const canvas = new OffscreenCanvas(1, 1);
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  return ctx.measureText("M").width;
}

function oldMeasureText(text: string, font: string): number {
  const canvas = new OffscreenCanvas(1, 1);
  const ctx = canvas.getContext("2d")!;
  ctx.font = font;
  return ctx.measureText(text).width;
}

// Cached version (what we actually had before — one canvas, cached per size)
const oldCharCache = new Map<number, number>();
function oldGetCharWidthCached(fontSize: number): number {
  let w = oldCharCache.get(fontSize);
  if (w !== undefined) return w;
  const canvas = new OffscreenCanvas(1, 1);
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  w = ctx.measureText("M").width;
  oldCharCache.set(fontSize, w);
  return w;
}

// ── Test strings ─────────────────────────────────────────────────────

const SHORT_STRINGS = [
  "function",
  "const x = 42;",
  "return result;",
  "import { foo } from 'bar';",
  "if (condition) {",
];

const LONG_STRINGS = [
  "export async function handleEditorKeydown(event: KeyboardEvent, engine: EditorEngine): Promise<void> {",
  "const displayRows = computeDisplayRows(lines, charW, editorWidth, wordWrap, gutterW, foldedLines);",
  "// This is a very long comment that describes the behavior of the following function in great detail for documentation purposes",
  "throw new Error(`Unexpected token '${token.type}' at line ${token.line}, column ${token.col}`);",
];

const ALL_STRINGS = [...SHORT_STRINGS, ...LONG_STRINGS];

// ── Benchmarks ───────────────────────────────────────────────────────

describe("Text measurement: Pretext vs OffscreenCanvas", () => {

  it("single char width — cold (first call)", () => {
    // Old approach: uncached
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) oldMeasureChar(14 + (i % 5));
    const oldMs = performance.now() - t0;

    // Pretext approach
    const t1 = performance.now();
    for (let i = 0; i < 100; i++) {
      const seg = prepareWithSegments("M", `${14 + (i % 5)}px ${FONT_FAMILY}`);
      layoutWithLines(seg, Infinity, 14 + (i % 5));
    }
    const pretextMs = performance.now() - t1;

    console.log(`  Single char (cold, 100 calls):`);
    console.log(`    OffscreenCanvas: ${oldMs.toFixed(2)}ms`);
    console.log(`    Pretext:         ${pretextMs.toFixed(2)}ms`);
    console.log(`    Ratio:           ${(oldMs / pretextMs).toFixed(2)}x`);

    expect(true).toBe(true); // benchmark, not assertion
  });

  it("single char width — warm (cached, repeated)", () => {
    // Warm up both caches
    oldGetCharWidthCached(14);
    getCharWidth(14);

    const t0 = performance.now();
    for (let i = 0; i < ITERATIONS; i++) oldGetCharWidthCached(14);
    const oldMs = performance.now() - t0;

    const t1 = performance.now();
    for (let i = 0; i < ITERATIONS; i++) getCharWidth(14);
    const pretextMs = performance.now() - t1;

    console.log(`  Single char (warm, ${ITERATIONS} calls):`);
    console.log(`    OffscreenCanvas (cached): ${oldMs.toFixed(2)}ms`);
    console.log(`    Pretext (cached):         ${pretextMs.toFixed(2)}ms`);
    console.log(`    Ratio:                    ${(oldMs / pretextMs).toFixed(2)}x`);

    expect(true).toBe(true);
  });

  it("arbitrary string width — short strings", () => {
    const t0 = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      oldMeasureText(SHORT_STRINGS[i % SHORT_STRINGS.length], FONT);
    }
    const oldMs = performance.now() - t0;

    const t1 = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      measureTextWidth(SHORT_STRINGS[i % SHORT_STRINGS.length], FONT);
    }
    const pretextMs = performance.now() - t1;

    console.log(`  Short strings (${ITERATIONS} calls):`);
    console.log(`    OffscreenCanvas: ${oldMs.toFixed(2)}ms`);
    console.log(`    Pretext:         ${pretextMs.toFixed(2)}ms`);
    console.log(`    Ratio:           ${(oldMs / pretextMs).toFixed(2)}x`);

    expect(true).toBe(true);
  });

  it("arbitrary string width — long strings", () => {
    const t0 = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      oldMeasureText(LONG_STRINGS[i % LONG_STRINGS.length], FONT);
    }
    const oldMs = performance.now() - t0;

    const t1 = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      measureTextWidth(LONG_STRINGS[i % LONG_STRINGS.length], FONT);
    }
    const pretextMs = performance.now() - t1;

    console.log(`  Long strings (${ITERATIONS} calls):`);
    console.log(`    OffscreenCanvas: ${oldMs.toFixed(2)}ms`);
    console.log(`    Pretext:         ${pretextMs.toFixed(2)}ms`);
    console.log(`    Ratio:           ${(oldMs / pretextMs).toFixed(2)}x`);

    expect(true).toBe(true);
  });

  it("batch measurement — diverse strings (simulates real editor frame)", () => {
    // Simulate measuring many different strings in one frame
    // (e.g., visible lines, completions, tooltips)
    const t0 = performance.now();
    for (let round = 0; round < 100; round++) {
      for (const s of ALL_STRINGS) oldMeasureText(s, FONT);
    }
    const oldMs = performance.now() - t0;

    const t1 = performance.now();
    for (let round = 0; round < 100; round++) {
      for (const s of ALL_STRINGS) measureTextWidth(s, FONT);
    }
    const pretextMs = performance.now() - t1;

    const totalCalls = 100 * ALL_STRINGS.length;
    console.log(`  Batch diverse (${totalCalls} calls, ${ALL_STRINGS.length} unique strings):`);
    console.log(`    OffscreenCanvas: ${oldMs.toFixed(2)}ms`);
    console.log(`    Pretext:         ${pretextMs.toFixed(2)}ms`);
    console.log(`    Ratio:           ${(oldMs / pretextMs).toFixed(2)}x`);

    expect(true).toBe(true);
  });

  it("Pretext two-phase advantage — prepare once, layout many times", () => {
    const text = "export async function handleEditorKeydown(event: KeyboardEvent, engine: EditorEngine): Promise<void> {";
    const widths = [200, 400, 600, 800, 1000, 1200];

    // Old: re-measure for each width (canvas doesn't benefit from width changes)
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) {
      for (const _w of widths) oldMeasureText(text, FONT);
    }
    const oldMs = performance.now() - t0;

    // Pretext: prepare once, layout at different widths (pure arithmetic)
    const t1 = performance.now();
    for (let i = 0; i < 1000; i++) {
      const seg = prepareWithSegments(text, FONT);
      for (const w of widths) layoutWithLines(seg, w, 14);
    }
    const pretextMs = performance.now() - t1;

    const totalCalls = 1000 * widths.length;
    console.log(`  Two-phase (prepare once + ${widths.length} layouts, x1000):`);
    console.log(`    OffscreenCanvas (${totalCalls} measureText calls): ${oldMs.toFixed(2)}ms`);
    console.log(`    Pretext (1000 prepare + ${totalCalls} layout):     ${pretextMs.toFixed(2)}ms`);
    console.log(`    Ratio:           ${(oldMs / pretextMs).toFixed(2)}x`);

    expect(true).toBe(true);
  });

  it("both paths return numeric widths", () => {
    // In the test environment OffscreenCanvas is mocked (returns 8.4 for everything).
    // Pretext also uses canvas internally, so both hit the same mock.
    // Real accuracy comparison must be done in the Tauri webview with actual fonts.
    for (const text of ALL_STRINGS) {
      const oldW = oldMeasureText(text, FONT);
      const newW = measureTextWidth(text, FONT);
      expect(typeof oldW).toBe("number");
      expect(typeof newW).toBe("number");
      expect(oldW).toBeGreaterThan(0);
      expect(newW).toBeGreaterThan(0);
    }
  });
});
