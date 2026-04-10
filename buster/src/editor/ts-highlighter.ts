import { invoke } from "@tauri-apps/api/core";
import { type ThemePalette, CATPPUCCIN } from "../lib/theme";

export interface HighlightSpan {
  start_byte: number;
  end_byte: number;
  highlight_type: string;
}

// Active syntax colors — updated when palette changes
let activeSyntax: Record<string, string> = { ...CATPPUCCIN.syntax };
let activeDefault: string = CATPPUCCIN.syntaxDefault;

export function setSyntaxPalette(p: ThemePalette) {
  activeSyntax = p.syntax;
  activeDefault = p.syntaxDefault;
}

function getSyntaxColor(type: string): string {
  return activeSyntax[type]
    || activeSyntax[type.split(".")[0]]
    || activeDefault;
}

export interface LineToken {
  start: number; // char offset within line
  end: number;   // char offset within line
  color: string;
}

// Cache: file content hash -> computed line tokens
let cachedSpans: HighlightSpan[] = [];
let cachedSource: string | null = null;
let cachedFilePath: string | null = null;

/**
 * Request tree-sitter highlights from Rust backend.
 * Returns byte-offset spans for the entire file.
 */
export async function requestHighlights(
  source: string,
  filePath: string
): Promise<HighlightSpan[]> {
  // Cache check — skip if source hasn't changed
  if (source === cachedSource && filePath === cachedFilePath) {
    return cachedSpans;
  }

  try {
    const spans = await invoke<HighlightSpan[]>("highlight_code", {
      source,
      filePath,
    });
    cachedSpans = spans;
    cachedSource = source;
    cachedFilePath = filePath;
    return spans;
  } catch (err) {
    console.error("Tree-sitter highlight error:", err);
    return [];
  }
}

/**
 * Convert byte-offset spans into per-line character-offset tokens
 * with colors. This is what the canvas renderer consumes.
 */
export function spansToLineTokens(
  spans: HighlightSpan[],
  lines: string[]
): LineToken[][] {
  // Build byte offset -> line mapping
  const lineByteOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineByteOffsets.push(offset);
    offset += new TextEncoder().encode(line).length + 1; // +1 for \n
  }

  const result: LineToken[][] = lines.map(() => []);

  for (const span of spans) {
    // Find which lines this span covers
    let startLine = 0;
    for (let i = 0; i < lineByteOffsets.length; i++) {
      if (i + 1 < lineByteOffsets.length && lineByteOffsets[i + 1] <= span.start_byte) {
        startLine = i + 1;
      } else {
        break;
      }
    }

    let endLine = startLine;
    for (let i = startLine; i < lineByteOffsets.length; i++) {
      if (lineByteOffsets[i] < span.end_byte) {
        endLine = i;
      } else {
        break;
      }
    }

    const color = getSyntaxColor(span.highlight_type);

    for (let lineIdx = startLine; lineIdx <= endLine && lineIdx < lines.length; lineIdx++) {
      const lineStart = lineByteOffsets[lineIdx];
      const lineBytes = new TextEncoder().encode(lines[lineIdx]);

      const spanStartInLine = Math.max(0, span.start_byte - lineStart);
      const spanEndInLine = Math.min(lineBytes.length, span.end_byte - lineStart);

      if (spanStartInLine >= spanEndInLine) continue;

      // Convert byte offsets to char offsets
      const decoder = new TextDecoder();
      const startChar = decoder.decode(lineBytes.slice(0, spanStartInLine)).length;
      const endChar = decoder.decode(lineBytes.slice(0, spanEndInLine)).length;

      result[lineIdx].push({
        start: startChar,
        end: endChar,
        color,
      });
    }
  }

  return result;
}

