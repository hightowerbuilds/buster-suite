/**
 * Line cache for large files.
 *
 * Holds a sliding window of lines around the viewport, fetching from
 * the Rust FileBufferManager via IPC when the user scrolls past the
 * cached range.
 *
 * For files under 1MB, the editor uses its normal string[] buffer and
 * this module is not involved.
 */

import { largeFileOpen, largeFileReadLines, largeFileClose } from "../lib/ipc";

/** How many lines to keep cached above and below the viewport. */
const CACHE_BUFFER = 1000;

/** How many lines to fetch per IPC request. */
const FETCH_CHUNK = 1000;

export interface LineCache {
  /** Total line count in the file. */
  totalLines: number;
  /** File path this cache is for. */
  filePath: string;

  /**
   * Get a line by index. Returns the cached line or empty string if not yet loaded.
   * Triggers a background fetch if the line is outside the cached range.
   */
  getLine: (idx: number) => string;

  /**
   * Get a range of lines for rendering. Returns whatever is cached,
   * and triggers a fetch for any missing lines.
   */
  getLines: (start: number, count: number) => string[];

  /**
   * Notify the cache that the viewport has moved. Triggers prefetching
   * if the viewport is approaching the edge of the cached range.
   */
  updateViewport: (firstVisibleLine: number, visibleCount: number) => void;

  /**
   * Apply a local edit to the cached lines. The edit is tracked so it
   * can be flushed to disk on save.
   */
  editLine: (idx: number, content: string) => void;

  /**
   * Insert a new line at the given index.
   */
  insertLine: (idx: number, content: string) => void;

  /**
   * Delete a line at the given index.
   */
  deleteLine: (idx: number) => void;

  /**
   * Get all locally modified lines as a map of lineIdx → content.
   */
  getDirtyLines: () => Map<number, string>;

  /**
   * Get the full text (for saving). Fetches all lines if needed.
   */
  getFullText: () => Promise<string>;

  /** Close the Rust buffer and free memory. */
  close: () => Promise<void>;
}

export async function createLineCache(filePath: string): Promise<LineCache> {
  const totalLines = await largeFileOpen(filePath);

  // Cached lines: sparse map of lineIdx → content
  const cache = new Map<number, string>();
  // Lines that were locally edited (not yet on disk)
  const dirtyLines = new Map<number, string>();
  let currentTotal = totalLines;

  // Track what ranges are loaded
  let loadedStart = -1;
  let loadedEnd = -1;
  let fetchInFlight = false;
  // Last-write-wins: track the most recent viewport request
  let pendingViewport: { start: number; count: number } | null = null;

  async function fetchRange(start: number, count: number) {
    if (fetchInFlight) {
      // Don't drop the request — save it for when the current fetch completes
      pendingViewport = { start, count };
      return;
    }
    const clampedStart = Math.max(0, start);
    const clampedCount = Math.min(count, totalLines - clampedStart);
    if (clampedCount <= 0) return;

    fetchInFlight = true;
    try {
      const lines = await largeFileReadLines(filePath, clampedStart, clampedCount);
      for (let i = 0; i < lines.length; i++) {
        const lineIdx = clampedStart + i;
        // Don't overwrite locally edited lines
        if (!dirtyLines.has(lineIdx)) {
          cache.set(lineIdx, lines[i]);
        }
      }
      // Expand loaded range
      if (loadedStart < 0 || clampedStart < loadedStart) loadedStart = clampedStart;
      if (loadedEnd < 0 || clampedStart + lines.length > loadedEnd) loadedEnd = clampedStart + lines.length;
    } finally {
      fetchInFlight = false;
      // If the viewport moved while we were fetching, service the latest request
      if (pendingViewport) {
        const { start: ps, count: pc } = pendingViewport;
        pendingViewport = null;
        fetchRange(ps, pc);
      }
    }
  }

  // Initial fetch — load the first chunk
  await fetchRange(0, FETCH_CHUNK);

  return {
    totalLines: currentTotal,
    filePath,

    getLine(idx: number): string {
      if (dirtyLines.has(idx)) return dirtyLines.get(idx)!;
      return cache.get(idx) ?? "";
    },

    getLines(start: number, count: number): string[] {
      const result: string[] = [];
      for (let i = start; i < start + count && i < currentTotal; i++) {
        result.push(dirtyLines.get(i) ?? cache.get(i) ?? "");
      }
      return result;
    },

    updateViewport(firstVisibleLine: number, visibleCount: number) {
      const wantStart = Math.max(0, firstVisibleLine - CACHE_BUFFER);
      const wantEnd = Math.min(currentTotal, firstVisibleLine + visibleCount + CACHE_BUFFER);

      // Check if we need to fetch more
      if (wantStart < loadedStart || wantEnd > loadedEnd) {
        const fetchStart = Math.max(0, firstVisibleLine - FETCH_CHUNK / 2);
        fetchRange(fetchStart, FETCH_CHUNK);
      }
    },

    editLine(idx: number, content: string) {
      dirtyLines.set(idx, content);
      cache.set(idx, content);
    },

    insertLine(idx: number, content: string) {
      // Shift all entries at idx and above up by one (iterate descending to avoid overwrites)
      const keys = [...cache.keys()].filter(k => k >= idx).sort((a, b) => b - a);
      for (const k of keys) {
        cache.set(k + 1, cache.get(k)!);
        if (!dirtyLines.has(k + 1) && dirtyLines.has(k)) dirtyLines.set(k + 1, dirtyLines.get(k)!);
      }
      // Shift dirty lines the same way
      const dirtyKeys = [...dirtyLines.keys()].filter(k => k >= idx).sort((a, b) => b - a);
      for (const k of dirtyKeys) {
        dirtyLines.set(k + 1, dirtyLines.get(k)!);
      }
      cache.set(idx, content);
      dirtyLines.set(idx, content);
      currentTotal++;
    },

    deleteLine(idx: number) {
      // Shift all entries above idx down by one (iterate ascending to avoid overwrites)
      const maxKey = Math.max(...cache.keys(), ...dirtyLines.keys(), idx);
      for (let k = idx; k < maxKey; k++) {
        if (cache.has(k + 1)) cache.set(k, cache.get(k + 1)!);
        else cache.delete(k);
        if (dirtyLines.has(k + 1)) dirtyLines.set(k, dirtyLines.get(k + 1)!);
        else dirtyLines.delete(k);
      }
      cache.delete(maxKey);
      dirtyLines.delete(maxKey);
      currentTotal--;
    },

    getDirtyLines() {
      return new Map(dirtyLines);
    },

    async getFullText(): Promise<string> {
      // Fetch everything we don't have cached
      const allLines: string[] = [];
      const chunkSize = 5000;
      for (let start = 0; start < currentTotal; start += chunkSize) {
        // Check if we have this range cached
        let allCached = true;
        for (let i = start; i < Math.min(start + chunkSize, currentTotal); i++) {
          if (!cache.has(i) && !dirtyLines.has(i)) {
            allCached = false;
            break;
          }
        }
        if (!allCached) {
          const lines = await largeFileReadLines(filePath, start, chunkSize);
          for (let i = 0; i < lines.length; i++) {
            if (!dirtyLines.has(start + i)) {
              cache.set(start + i, lines[i]);
            }
          }
        }
      }
      for (let i = 0; i < currentTotal; i++) {
        allLines.push(dirtyLines.get(i) ?? cache.get(i) ?? "");
      }
      return allLines.join("\n");
    },

    async close() {
      await largeFileClose(filePath);
      cache.clear();
      dirtyLines.clear();
    },
  };
}
