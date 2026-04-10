import { measureTextWidth } from "../editor/text-measure";

export const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789{}[]()<>/*+-=_|\\;:'\",.<>?!@#$%^&~`";
export const TERM_GLYPHS = "$>|/\\#~-=@_%^&*!?:;[]{}()<>0123456789abcdef";
export const TERM_FRAGMENTS = [
  "stdin", "stdout", "stderr", "/bin/zsh", "pty", "vt100", "ansi",
  "fork()", "exec()", "pipe()", "kill -9", "chmod 755", "ssh",
  "grep -r", "cat /dev/", "echo $PATH", "sudo", "curl -s",
  "ls -la", "cd ~", "git push", "npm run", "cargo build",
  "exit 0", "&&", "||", ">>", "2>&1", "/dev/null", "EOF",
  "#!/bin/bash", "export", "alias", "source", ".bashrc",
];

export const PALETTE = [
  "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF",
  "#FFFFFF", "#FFFFFF", "#FFFFFF", "#FFFFFF",
];

export const GREEN_PALETTE = ["#a6e3a1", "#00A896", "#6BCB77", "#2ECC71", "#27AE60", "#1ABC9C", "#C4CED4", "#FFFFFF"];

export const SCATTER_IN_FRAMES = 60;
export const SCATTER_OUT_FRAMES = 40;
export const BG_COLOR = "#1e1e2e";

export interface Particle {
  tx: number; ty: number;
  x: number; y: number;
  vx: number; vy: number;
  ch: string; color: string;
  alpha: number; targetAlpha: number;
  settled: boolean;
}

export interface RainDrop {
  x: number; y: number;
  speed: number; ch: string; alpha: number;
}

export type Phase = "scatter-in" | "assemble" | "settled" | "scatter-out";

export function sampleTextPixels(
  text: string,
  fontSize: number,
  offsetX: number,
  offsetY: number,
  step: number,
  fontFamily?: string
): { x: number; y: number }[] {
  const c = document.createElement("canvas");
  c.width = 2000;
  c.height = 600;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  const family = fontFamily || '"JetBrains Mono", "Menlo", "Monaco", monospace';
  ctx.font = `${fontSize}px ${family}`;
  ctx.textBaseline = "top";
  ctx.fillText(text, 10, 10);

  const textW = measureTextWidth(text, `${fontSize}px ${family}`);
  const width = Math.min(Math.ceil(textW) + 20, 2000);
  const height = Math.min(fontSize + 40, 600);

  const imageData = ctx.getImageData(0, 0, width, height);
  const points: { x: number; y: number }[] = [];

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      if (imageData.data[idx + 3] > 128) {
        points.push({ x: x + offsetX, y: y + offsetY });
      }
    }
  }
  return points;
}

// Pre-computed rain alpha strings (avoids per-frame string allocation)
export const RAIN_COLORS: string[] = [];
for (let i = 0; i <= 100; i++) {
  RAIN_COLORS.push(`rgba(88, 91, 112, ${(i / 100).toFixed(2)})`);
}

// Quantized-alpha cache for hex→rgba (avoids per-frame string allocation)
const rgbaCache = new Map<string, string>();
export function hexToRgba(hex: string, alpha: number): string {
  const qa = Math.round(Math.min(1, alpha) * 50) / 50;
  const key = hex + qa;
  let cached = rgbaCache.get(key);
  if (cached) return cached;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  cached = `rgba(${r}, ${g}, ${b}, ${qa})`;
  rgbaCache.set(key, cached);
  return cached;
}

export function computeTitleFontSize(text: string, canvasWidth: number, fontFamily?: string): number {
  const maxWidth = canvasWidth * 0.85;
  let size = 72;
  const family = fontFamily || '"JetBrains Mono", "Menlo", "Monaco", monospace';
  while (size > 24) {
    if (measureTextWidth(text, `${size}px ${family}`) <= maxWidth) break;
    size -= 4;
  }
  return size;
}

export function initRain(w: number, h: number): RainDrop[] {
  const drops: RainDrop[] = [];
  for (let i = 0; i < 30; i++) {
    drops.push({
      x: Math.random() * w, y: Math.random() * h,
      speed: 0.5 + Math.random() * 1.5,
      ch: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
      alpha: 0.03 + Math.random() * 0.06,
    });
  }
  return drops;
}
