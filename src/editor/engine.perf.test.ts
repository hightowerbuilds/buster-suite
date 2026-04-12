/**
 * Performance tests for the editor engine.
 *
 * These measure timing of hot-path operations on realistic document sizes.
 * When a performance change lands, these tests show the impact directly
 * in the test output. If an operation exceeds its budget, the test fails.
 */

import { describe, it, expect } from "vitest";
import { createEditorEngine, computeDisplayRows } from "./engine";
import baselines from "../../benchmarks/baselines.json";

type BenchmarkId = keyof typeof baselines.benchmarks;

/** Check a benchmark result against stored baselines. Warns if >15% regression from baseline. */
function checkBaseline(id: BenchmarkId, ms: number) {
  const entry = baselines.benchmarks[id];
  if (!entry) return;
  const ratio = ms / entry.baseline_ms;
  if (ratio > 1.15 && ms > 1) {
    console.warn(`  WARNING: ${id} regressed — ${ms.toFixed(2)}ms vs baseline ${entry.baseline_ms}ms (+${((ratio - 1) * 100).toFixed(0)}%)`);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function generateDoc(lineCount: number, avgLineLen = 60): string {
  const chars = "abcdefghijklmnopqrstuvwxyz     {}()[];,.=+-*/";
  const lines: string[] = [];
  for (let i = 0; i < lineCount; i++) {
    let line = "";
    const len = 20 + Math.floor(Math.random() * (avgLineLen - 20));
    for (let j = 0; j < len; j++) {
      line += chars[Math.floor(Math.random() * chars.length)];
    }
    lines.push(line);
  }
  return lines.join("\n");
}

function time(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

// ── computeDisplayRows ───────────────────────────────────────────────

describe("perf: computeDisplayRows", () => {
  const smallDoc = generateDoc(100).split("\n");
  const medDoc = generateDoc(5_000).split("\n");
  const largeDoc = generateDoc(20_000).split("\n");

  it("100 lines, no wrap", () => {
    const ms = time(() => computeDisplayRows(smallDoc, 8, 800, false, 50));
    console.log(`  computeDisplayRows 100 lines (no wrap): ${ms.toFixed(2)} ms`);
    checkBaseline("displayRows_100_noWrap", ms);
    expect(ms).toBeLessThan(5);
  });

  it("5,000 lines, no wrap", () => {
    const ms = time(() => computeDisplayRows(medDoc, 8, 800, false, 50));
    console.log(`  computeDisplayRows 5k lines (no wrap): ${ms.toFixed(2)} ms`);
    checkBaseline("displayRows_5k_noWrap", ms);
    expect(ms).toBeLessThan(20);
  });

  it("20,000 lines, no wrap", () => {
    const ms = time(() => computeDisplayRows(largeDoc, 8, 800, false, 50));
    console.log(`  computeDisplayRows 20k lines (no wrap): ${ms.toFixed(2)} ms`);
    checkBaseline("displayRows_20k_noWrap", ms);
    expect(ms).toBeLessThan(50);
  });

  it("5,000 lines, word wrap", () => {
    const ms = time(() => computeDisplayRows(medDoc, 8, 800, true, 50));
    console.log(`  computeDisplayRows 5k lines (wrap): ${ms.toFixed(2)} ms`);
    checkBaseline("displayRows_5k_wrap", ms);
    expect(ms).toBeLessThan(50);
  });

  it("20,000 lines, word wrap", () => {
    const ms = time(() => computeDisplayRows(largeDoc, 8, 800, true, 50));
    console.log(`  computeDisplayRows 20k lines (wrap): ${ms.toFixed(2)} ms`);
    checkBaseline("displayRows_20k_wrap", ms);
    expect(ms).toBeLessThan(150);
  });
});

// ── Engine: document load ────────────────────────────────────────────

describe("perf: engine load", () => {
  it("load 10,000-line document", () => {
    const doc = generateDoc(10_000);
    const ms = time(() => createEditorEngine(doc));
    console.log(`  engine load 10k lines: ${ms.toFixed(2)} ms`);
    checkBaseline("engineLoad_10k", ms);
    expect(ms).toBeLessThan(50);
  });

  it("loadText swap on existing engine", () => {
    const e = createEditorEngine(generateDoc(1_000));
    const newDoc = generateDoc(10_000);
    const ms = time(() => e.loadText(newDoc));
    console.log(`  engine loadText 10k lines: ${ms.toFixed(2)} ms`);
    checkBaseline("engineLoadText_10k", ms);
    expect(ms).toBeLessThan(50);
  });
});

// ── Engine: editing on large documents ───────────────────────────────

describe("perf: editing large docs", () => {
  it("1,000 sequential inserts", () => {
    const e = createEditorEngine(generateDoc(1_000));
    e.setCursor({ line: 500, col: 0 });
    const ms = time(() => {
      for (let i = 0; i < 1_000; i++) {
        e.insert("x");
      }
    });
    console.log(`  1,000 inserts at mid-doc: ${ms.toFixed(2)} ms`);
    checkBaseline("inserts_1000", ms);
    expect(ms).toBeLessThan(100);
  });

  it("1,000 sequential backspaces", () => {
    const e = createEditorEngine(generateDoc(1_000));
    e.setCursor({ line: 500, col: 30 });
    // Insert first so we have chars to delete
    for (let i = 0; i < 1_000; i++) e.insert("x");
    const ms = time(() => {
      for (let i = 0; i < 1_000; i++) {
        e.backspace();
      }
    });
    console.log(`  1,000 backspaces: ${ms.toFixed(2)} ms`);
    checkBaseline("backspaces_1000", ms);
    expect(ms).toBeLessThan(100);
  });

  it("undo/redo 500 times on large doc", () => {
    const e = createEditorEngine(generateDoc(2_000));
    e.setCursor({ line: 0, col: 0 });
    // Build up undo history
    for (let i = 0; i < 500; i++) {
      e.insert("x");
    }
    const msUndo = time(() => {
      for (let i = 0; i < 500; i++) e.undo();
    });
    const msRedo = time(() => {
      for (let i = 0; i < 500; i++) e.redo();
    });
    console.log(`  500 undos: ${msUndo.toFixed(2)} ms, 500 redos: ${msRedo.toFixed(2)} ms`);
    expect(msUndo).toBeLessThan(200);
    expect(msRedo).toBeLessThan(200);
  });
});

// ── Engine: cursor movement on large documents ───────────────────────

describe("perf: cursor movement", () => {
  it("10,000 arrow-down movements", () => {
    const e = createEditorEngine(generateDoc(15_000));
    e.setCursor({ line: 0, col: 0 });
    const ms = time(() => {
      for (let i = 0; i < 10_000; i++) {
        e.moveCursor("down");
      }
    });
    console.log(`  10,000 arrow-down: ${ms.toFixed(2)} ms`);
    checkBaseline("arrowDown_10000", ms);
    expect(ms).toBeLessThan(100);
  });

  it("1,000 word movements", () => {
    const e = createEditorEngine(generateDoc(5_000));
    e.setCursor({ line: 0, col: 0 });
    const ms = time(() => {
      for (let i = 0; i < 1_000; i++) {
        e.moveWord("right");
      }
    });
    console.log(`  1,000 word-right: ${ms.toFixed(2)} ms`);
    checkBaseline("wordRight_1000", ms);
    expect(ms).toBeLessThan(100);
  });
});
