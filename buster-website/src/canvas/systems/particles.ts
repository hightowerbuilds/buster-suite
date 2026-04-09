import { W, H } from '../state/canvas-state';
import { FONT_HERO } from '../constants/fonts';
import { PALETTE_COLORS, PARTICLE_CHARS } from '../constants/colors';
import { scrollY } from '../state/scroll-state';
import {
  targets, targetGrid, rainDrops, filledCount, heroSettled, subtitleAlpha,
  setTargets, setTargetGrid, setRainDrops, setAnimFrame, setAnimating,
  setHeroSettled, setSubtitleAlpha, setFilledCount, incFilledCount, incAnimFrame,
} from '../state/particle-state';

const RAIN_COUNT = 2000;
const RAIN_SPEED_MIN = 4.0;
const RAIN_SPEED_MAX = 9.0;
const GRID_CELL = 6;

function spawnRainDrop(randomY: boolean) {
  return {
    x: Math.random() * W,
    y: randomY ? -Math.random() * H * 1.5 : -10 - Math.random() * 200,
    speed: RAIN_SPEED_MIN + Math.random() * (RAIN_SPEED_MAX - RAIN_SPEED_MIN),
    ch: PARTICLE_CHARS[Math.floor(Math.random() * PARTICLE_CHARS.length)],
    color: PALETTE_COLORS[Math.floor(Math.random() * PALETTE_COLORS.length)],
    alpha: 0.08 + Math.random() * 0.15,
    captured: false,
  };
}

export function initParticles() {
  const offscreen = document.createElement("canvas");
  const octx = offscreen.getContext("2d")!;

  const fontSize = Math.max(76, Math.floor(W * 0.24));
  offscreen.width = W;
  offscreen.height = fontSize * 1.6;

  octx.fillStyle = "#fff";
  octx.font = `${fontSize}px ${FONT_HERO}`;
  octx.textBaseline = "top";

  const textWidth = octx.measureText("Buster").width;
  const textX = (W - textWidth) / 2;
  const textY = fontSize * 0.15;
  octx.fillText("Buster", textX, textY);

  const imageData = octx.getImageData(0, 0, offscreen.width, offscreen.height);
  const data = imageData.data;

  const newTargets: typeof targets = [];
  const newGrid: typeof targetGrid = {};
  setFilledCount(0);
  const step = 5;
  const centerY = H / 2;
  const offsetY = centerY - offscreen.height / 2;

  for (let py = 0; py < offscreen.height; py += step) {
    for (let px = 0; px < offscreen.width; px += step) {
      const i = (py * offscreen.width + px) * 4;
      if (data[i + 3] > 128) {
        const t = {
          x: px,
          y: py + offsetY,
          ch: PARTICLE_CHARS[Math.floor(Math.random() * PARTICLE_CHARS.length)],
          color: PALETTE_COLORS[Math.floor(Math.random() * PALETTE_COLORS.length)],
          filled: false,
          alpha: 0,
        };
        newTargets.push(t);
        const col = Math.floor(px / GRID_CELL);
        if (!newGrid[col]) newGrid[col] = [];
        newGrid[col].push(t);
      }
    }
  }

  for (const col in newGrid) {
    newGrid[col].sort((a, b) => a.y - b.y);
  }

  setTargets(newTargets);
  setTargetGrid(newGrid);

  const drops = [];
  for (let i = 0; i < RAIN_COUNT; i++) {
    drops.push(spawnRainDrop(true));
  }
  setRainDrops(drops);

  setAnimFrame(0);
  setHeroSettled(false);
  setSubtitleAlpha(0);
  setAnimating(true);
}

export function updateParticles() {
  incAnimFrame();

  // Re-import mutable state for this frame
  const tgts = targets;
  const grid = targetGrid;
  const drops = rainDrops;
  const allFilled = filledCount >= tgts.length;

  for (let i = 0; i < drops.length; i++) {
    const r = drops[i];

    if (r.captured) {
      drops[i] = spawnRainDrop(false);
      continue;
    }

    const prevY = r.y;
    r.y += r.speed;

    if (!allFilled) {
      const col = Math.floor(r.x / GRID_CELL);
      for (let dc = -2; dc <= 2; dc++) {
        const bucket = grid[col + dc];
        if (!bucket) continue;
        for (const t of bucket) {
          if (t.filled) continue;
          const dx = Math.abs(r.x - t.x);
          if (dx > GRID_CELL) continue;
          const targetScreenY = t.y - scrollY;
          if (targetScreenY >= prevY - 2 && targetScreenY <= r.y + 2) {
            t.filled = true;
            t.ch = r.ch;
            t.alpha = 0;
            incFilledCount();
            r.captured = true;
            break;
          }
        }
        if (r.captured) break;
      }
    }

    if (r.y > H + 20) {
      drops[i] = spawnRainDrop(false);
    }
  }

  for (const t of tgts) {
    if (t.filled && t.alpha < 1) {
      t.alpha = Math.min(1, t.alpha + 0.05);
    }
  }

  const fillRatio = tgts.length > 0 ? filledCount / tgts.length : 0;
  if (fillRatio > 0.3 && subtitleAlpha < 1) {
    setSubtitleAlpha(Math.min(1, subtitleAlpha + 0.02));
  }

  if (allFilled && !heroSettled) {
    setHeroSettled(true);
  }
}
