/**
 * Text measurement utilities for the canvas editor, powered by Pretext.
 *
 * Pretext uses a two-phase approach:
 *   prepare(text, font) — segments text, measures via canvas, caches widths.
 *   layout(prepared, maxWidth, lineHeight) — pure arithmetic, ~0.0002ms per call.
 *
 * For monospace character width we still cache per-fontSize since the editor
 * relies on uniform charW for cursor positioning and gutter math.
 */

import { prepareWithSegments, layoutWithLines, clearCache as pretextClearCache } from "@chenglou/pretext";
import type { PreparedText, PreparedTextWithSegments, LayoutLinesResult } from "@chenglou/pretext";

const FONT_FAMILY = "JetBrains Mono, Menlo, Monaco, Consolas, monospace";

// ─── Monospace character width (cached per font size) ────────────────

const charWidthCache = new Map<number, number>();

/**
 * Get the width of a single monospace character at the given font size.
 * Uses Pretext's prepare() for measurement instead of raw OffscreenCanvas.
 */
export function getCharWidth(fontSize: number = 14): number {
  let w = charWidthCache.get(fontSize);
  if (w !== undefined) return w;

  const font = `${fontSize}px ${FONT_FAMILY}`;
  const seg = prepareWithSegments("M", font);
  const lines = layoutWithLines(seg, Infinity, fontSize);
  w = lines.lines.length > 0 ? lines.lines[0].width : fontSize * 0.6;
  charWidthCache.set(fontSize, w);
  return w;
}

// ─── Pretext text measurement ────────────────────────────────────────

/**
 * Measure the pixel width of an arbitrary string using Pretext.
 * Uses prepare + layoutWithLines for accurate measurement.
 */
export function measureTextWidth(text: string, font: string): number {
  if (text.length === 0) return 0;
  const seg = prepareWithSegments(text, font);
  const result = layoutWithLines(seg, Infinity, parseLineHeight(font));
  return result.lines.length > 0 ? result.lines[0].width : 0;
}

/**
 * Prepare text for word-wrap layout using Pretext.
 * Returns a PreparedTextWithSegments handle that can be passed to
 * layoutWrappedLines() for pure-arithmetic line breaking.
 */
export function prepareForLayout(text: string, font: string): PreparedTextWithSegments {
  return prepareWithSegments(text, font);
}

/**
 * Compute word-wrapped lines from a Pretext prepared handle.
 * Pure arithmetic — no canvas calls. Safe to call on every resize.
 */
export function layoutWrappedLines(prepared: PreparedTextWithSegments, maxWidth: number, lineHeight: number): LayoutLinesResult {
  return layoutWithLines(prepared, maxWidth, lineHeight);
}

/** Extract a numeric line height from a CSS font string. */
function parseLineHeight(font: string): number {
  const match = font.match(/(\d+(?:\.\d+)?)px/);
  return match ? parseFloat(match[1]) : 14;
}

/** Clear all Pretext internal caches. */
export function clearMeasurementCache(): void {
  charWidthCache.clear();
  pretextClearCache();
}

export { FONT_FAMILY };
export type { PreparedText, PreparedTextWithSegments, LayoutLinesResult };
