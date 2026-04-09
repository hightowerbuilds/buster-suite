/**
 * Text measurement utilities for the canvas editor.
 *
 * All measurements are in CSS pixels. The cached charWidth is per-fontSize
 * so the editor works correctly when the user changes font size.
 */

const FONT_FAMILY = "JetBrains Mono, Menlo, Monaco, Consolas, monospace";

// Cache charWidth per font size (px)
const charWidthCache = new Map<number, number>();

/**
 * Get the width of a single monospace character at the given font size.
 * Cached per size — only measures once per unique fontSize.
 */
export function getCharWidth(fontSize: number = 14): number {
  let w = charWidthCache.get(fontSize);
  if (w !== undefined) return w;

  const canvas = new OffscreenCanvas(1, 1);
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${fontSize}px ${FONT_FAMILY}`;
  w = ctx.measureText("M").width;
  charWidthCache.set(fontSize, w);
  return w;
}

/**
 * Build a CSS font string for a given size.
 */
export function editorFont(fontSize: number = 14): string {
  return `${fontSize}px ${FONT_FAMILY}`;
}

/**
 * Convert a pixel x-offset to a character column.
 */
export function xToCol(x: number, lineText: string, fontSize: number = 14): number {
  const charW = getCharWidth(fontSize);
  return Math.max(0, Math.min(Math.round(x / charW), lineText.length));
}

/**
 * Convert a character column to a pixel x-offset.
 */
export function colToX(col: number, fontSize: number = 14): number {
  return col * getCharWidth(fontSize);
}

/**
 * Clear all caches. Call when font family changes (not needed for size changes).
 */
export function clearMeasurementCache() {
  charWidthCache.clear();
}

export { FONT_FAMILY };
