import { TERM_GLYPHS, TERM_FRAGMENTS } from "./tour-utils";

interface MatrixColumn {
  x: number;
  headY: number;
  speed: number;
  trailLen: number;
  chars: string[];
  /** Frame counter for character mutation pacing */
  tick: number;
}

interface FloatingFragment {
  text: string;
  x: number;
  y: number;
  alpha: number;
  life: number;
  maxLife: number;
}

// Pre-computed green palette for trail fade (head → tail)
const TRAIL_COLORS: string[] = [];
for (let i = 0; i <= 100; i++) {
  const t = i / 100; // 0 = head, 1 = tail
  const r = Math.round(180 - t * 160);   // 180 → 20
  const g = Math.round(255 - t * 175);   // 255 → 80
  const b = Math.round(180 - t * 160);   // 180 → 20
  TRAIL_COLORS.push(`rgb(${r}, ${g}, ${b})`);
}

const HEAD_COLOR = "rgba(220, 255, 220, 0.95)";
const COL_SPACING = 14;
const CHAR_H = 14;

export function createMatrixRain() {
  let columns: MatrixColumn[] = [];
  let fragments: FloatingFragment[] = [];
  let initialized = false;
  let w = 0;
  let h = 0;

  function init(canvasW: number, canvasH: number) {
    w = canvasW;
    h = canvasH;
    initialized = true;

    const colCount = Math.ceil(w / COL_SPACING) + 1;
    columns = [];
    for (let i = 0; i < colCount; i++) {
      columns.push(makeColumn(i * COL_SPACING));
    }

    fragments = [];
    for (let i = 0; i < 8; i++) {
      fragments.push(makeFragment());
    }
  }

  function makeColumn(x: number): MatrixColumn {
    const trailLen = 8 + Math.floor(Math.random() * 22);
    const chars: string[] = [];
    for (let j = 0; j < trailLen; j++) {
      chars.push(TERM_GLYPHS[Math.floor(Math.random() * TERM_GLYPHS.length)]);
    }
    return {
      x,
      headY: -Math.random() * h * 1.5,
      speed: 1.5 + Math.random() * 4.5,
      trailLen,
      chars,
      tick: Math.floor(Math.random() * 100),
    };
  }

  function makeFragment(): FloatingFragment {
    const maxLife = 80 + Math.floor(Math.random() * 120);
    return {
      text: TERM_FRAGMENTS[Math.floor(Math.random() * TERM_FRAGMENTS.length)],
      x: 40 + Math.random() * (w - 80),
      y: 40 + Math.random() * (h - 80),
      alpha: 0,
      life: maxLife,
      maxLife,
    };
  }

  function render(ctx: CanvasRenderingContext2D, _w: number, _h: number, _time: number) {
    if (!initialized) return;

    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    // ── Matrix columns ──────────────────────────────────────
    ctx.font = `${CHAR_H}px "JetBrains Mono", monospace`;

    for (const col of columns) {
      col.tick++;
      col.headY += col.speed;

      // Wrap when entire trail is off screen
      if (col.headY - col.trailLen * CHAR_H > h) {
        col.headY = -Math.random() * h * 0.5;
        col.speed = 1.5 + Math.random() * 4.5;
        col.trailLen = 8 + Math.floor(Math.random() * 22);
        const newChars: string[] = [];
        for (let j = 0; j < col.trailLen; j++) {
          newChars.push(TERM_GLYPHS[Math.floor(Math.random() * TERM_GLYPHS.length)]);
        }
        col.chars = newChars;
      }

      // Mutate random characters in trail
      if (col.tick % 3 === 0) {
        const idx = Math.floor(Math.random() * col.chars.length);
        col.chars[idx] = TERM_GLYPHS[Math.floor(Math.random() * TERM_GLYPHS.length)];
      }

      // Draw trail (tail first, head last)
      for (let j = 0; j < col.chars.length; j++) {
        const charY = col.headY - (col.chars.length - 1 - j) * CHAR_H;
        if (charY < -CHAR_H || charY > h + CHAR_H) continue;

        const isHead = j === col.chars.length - 1;
        if (isHead) {
          ctx.fillStyle = HEAD_COLOR;
        } else {
          // Fade: 0 = closest to head (bright), 1 = tail (dim)
          const distFromHead = (col.chars.length - 1 - j) / col.chars.length;
          const colorIdx = Math.min(100, Math.round(distFromHead * 100));
          const alpha = Math.max(0.05, 0.7 - distFromHead * 0.65);
          ctx.globalAlpha = alpha;
          ctx.fillStyle = TRAIL_COLORS[colorIdx];
        }

        ctx.fillText(col.chars[j], col.x, charY);
        ctx.globalAlpha = 1;
      }
    }

    // ── Floating terminal fragments ─────────────────────────
    ctx.font = '13px "JetBrains Mono", monospace';
    for (const f of fragments) {
      f.life--;

      // Fade in for first 20 frames, fade out for last 20
      if (f.life > f.maxLife - 20) {
        f.alpha = Math.min(f.alpha + 0.025, 0.5);
      } else if (f.life < 20) {
        f.alpha *= 0.9;
      }

      if (f.life <= 0) {
        Object.assign(f, makeFragment());
      }

      if (f.alpha > 0.01) {
        ctx.globalAlpha = f.alpha;
        ctx.fillStyle = "#a6e3a1";
        ctx.fillText(f.text, f.x, f.y);
        ctx.globalAlpha = 1;
      }
    }
  }

  function reset() {
    columns = [];
    fragments = [];
    initialized = false;
  }

  return { init, render, reset };
}
