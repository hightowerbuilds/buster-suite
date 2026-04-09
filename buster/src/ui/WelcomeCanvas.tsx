import { Component, onMount, onCleanup } from "solid-js";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789{}[]()<>/*+-=_|\\;:'\",.<>?!@#$%^&~`";

// Baseball team palettes
const TEAMS = [
  { // Seattle Mariners
    name: "Mariners",
    colors: ["#005C5C", "#00857A", "#00A896", "#4A9AD9", "#6BB3F0", "#C4CED4", "#E8EDF2", "#FFFFFF"],
  },
  { // San Diego Padres
    name: "Padres",
    colors: ["#2F241D", "#FFC425", "#A37B45", "#D4AA6A", "#E8D5A3", "#FFFFFF", "#473729", "#8B6914"],
  },
  { // LA Dodgers
    name: "Dodgers",
    colors: ["#005A9C", "#EF3E42", "#A5ACAF", "#FFFFFF", "#003DA5", "#1E73BE", "#73B1E2", "#C4CED4"],
  },
  { // Chicago White Sox
    name: "White Sox",
    colors: ["#27251F", "#C4CED4", "#FFFFFF", "#808080", "#A0A0A0", "#E0E0E0", "#4A4A4A", "#D0D0D0"],
  },
  { // NY Mets
    name: "Mets",
    colors: ["#002D72", "#FF5910", "#FFFFFF", "#4A8FE7", "#FF8C55", "#C4CED4", "#003B8E", "#E8EDF2"],
  },
  { // Cincinnati Reds
    name: "Reds",
    colors: ["#C6011F", "#000000", "#FFFFFF", "#E8384A", "#8B0000", "#C4CED4", "#FF4444", "#E0E0E0"],
  },
  { // Pittsburgh Pirates
    name: "Pirates",
    colors: ["#27251F", "#FDB827", "#FFFFFF", "#C4A32A", "#E8D44D", "#808080", "#473B1D", "#C4CED4"],
  },
  { // Oakland Athletics
    name: "Athletics",
    colors: ["#003831", "#EFB21E", "#FFFFFF", "#00594C", "#C4A32A", "#4A7A6F", "#F5D76E", "#C4CED4"],
  },
];

const CYCLE_DURATION = 480; // frames per team (~8 seconds at 60fps)
const TRANSITION_FRAMES = 60; // fade between palettes

// Module-level cache for sampled pixel positions — survives component remounts
// so we don't re-allocate a 2000x500 canvas + getImageData every time.
let cachedPixelPoints: { x: number; y: number }[] | null = null;
let cachedPixelKey = ""; // "text:fontSize:offsetX:offsetY:step"

// Pre-computed rain alpha strings (avoids per-frame string allocation)
const RAIN_COLORS: string[] = [];
for (let i = 0; i <= 100; i++) {
  const a = (i / 100).toFixed(2);
  RAIN_COLORS.push(`rgba(88, 91, 112, ${a})`);
}

// Pre-computed hex-to-rgba cache for team palette colors
const rgbaCache = new Map<string, string>();
function cachedHexToRgba(hex: string, alpha: number): string {
  // Quantize alpha to nearest 0.02 for cache efficiency
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

interface Particle {
  tx: number; ty: number;
  x: number; y: number;
  vx: number; vy: number;
  ch: string;
  colorIdx: number; // index into current palette
  alpha: number; targetAlpha: number;
  settled: boolean;
}

interface RainDrop {
  x: number; y: number;
  speed: number; ch: string; alpha: number;
}

interface WelcomeCanvasProps {
  recentFolders?: string[];
  onOpenFolder?: (path: string) => void;
  onStartTour?: () => void;
}

const WelcomeCanvas: Component<WelcomeCanvasProps> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined;
  let animId: number;
  let particles: Particle[] = [];
  let rainDrops: RainDrop[] = [];
  let time = 0;
  let subtitleProgress = 0;
  let tourBtnProgress = 0;
  let tourBtnHitArea: { x: number; y: number; w: number; h: number } | null = null;
  let phase: "scatter" | "assemble" | "settled" = "scatter";
  let mouseX = 0;
  let mouseY = 0;
  let folderHitAreas: { x: number; y: number; w: number; h: number; path: string }[] = [];
  let phaseTimer = 0;

  const SUBTITLE = "canvas-rendered ide";
  const TOUR_LABEL = "Take the tour";

  function getCurrentPalette(): string[] {
    const teamIdx = Math.floor(time / CYCLE_DURATION) % TEAMS.length;
    const nextIdx = (teamIdx + 1) % TEAMS.length;

    // Last TRANSITION_FRAMES of each cycle: blend into next palette
    const cycleFrame = time % CYCLE_DURATION;
    if (cycleFrame > CYCLE_DURATION - TRANSITION_FRAMES) {
      const blend = (cycleFrame - (CYCLE_DURATION - TRANSITION_FRAMES)) / TRANSITION_FRAMES;
      return TEAMS[teamIdx].colors.map((c, i) => {
        const next = TEAMS[nextIdx].colors[i % TEAMS[nextIdx].colors.length];
        return lerpColor(c, next, blend);
      });
    }
    return TEAMS[teamIdx].colors;
  }

  function lerpColor(a: string, b: string, t: number): string {
    const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
    const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
  }

  function sampleTextPixels(
    text: string,
    fontSize: number,
    offsetX: number,
    offsetY: number,
    step: number
  ): { x: number; y: number }[] {
    const key = `${text}:${fontSize}:${Math.round(offsetX)}:${Math.round(offsetY)}:${step}`;
    if (cachedPixelPoints && cachedPixelKey === key) return cachedPixelPoints;

    const c = document.createElement("canvas");
    c.width = 2000;
    c.height = 500;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.font = `${fontSize}px "UnifrakturMaguntia", "JetBrains Mono", monospace`;
    ctx.textBaseline = "top";
    ctx.fillText(text, 10, 10);

    const metrics = ctx.measureText(text);
    const width = Math.min(Math.ceil(metrics.width) + 20, 2000);
    const height = Math.min(fontSize + 40, 500);

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

    cachedPixelPoints = points;
    cachedPixelKey = key;
    return points;
  }

  function hexToRgba(hex: string, a: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  function init() {
    if (!canvasRef) return;
    const w = canvasRef.clientWidth;
    const h = canvasRef.clientHeight;
    if (w === 0 || h === 0) return;

    // Measure title — scale to fit 85% of canvas width, starting at 160px
    const measure = document.createElement("canvas");
    measure.width = 1; measure.height = 1;
    const mCtx = measure.getContext("2d")!;
    let titleSize = 320;
    const maxWidth = w * 0.85;
    while (titleSize > 48) {
      mCtx.font = `${titleSize}px "UnifrakturMaguntia", "JetBrains Mono", monospace`;
      if (mCtx.measureText("Buster").width <= maxWidth) break;
      titleSize -= 8;
    }

    mCtx.font = `${titleSize}px "UnifrakturMaguntia", "JetBrains Mono", monospace`;
    const titleW = mCtx.measureText("Buster").width;
    const offsetX = (w - titleW) / 2 - 10;
    const offsetY = (h - titleSize) * 0.35;

    const points = sampleTextPixels("Buster", titleSize, offsetX, offsetY, 5);
    const palette = TEAMS[0].colors;

    particles = points.map((p) => ({
      tx: p.x, ty: p.y,
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 4,
      ch: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
      colorIdx: Math.floor(Math.random() * palette.length),
      alpha: 0.1 + Math.random() * 0.3,
      targetAlpha: 0.7 + Math.random() * 0.3,
      settled: false,
    }));

    rainDrops = [];
    for (let i = 0; i < 30; i++) {
      rainDrops.push({
        x: Math.random() * w, y: Math.random() * h,
        speed: 0.5 + Math.random() * 1.5,
        ch: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
        alpha: 0.03 + Math.random() * 0.06,
      });
    }

    phase = "scatter";
    phaseTimer = 0;
    subtitleProgress = 0;
    tourBtnProgress = 0;
    tourBtnHitArea = null;
  }

  function render() {
    if (!canvasRef) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvasRef.clientWidth;
    const h = canvasRef.clientHeight;
    if (w === 0 || h === 0) { animId = requestAnimationFrame(render); return; }

    // Only resize backing store when dimensions change
    const targetW = Math.round(w * dpr);
    const targetH = Math.round(h * dpr);
    if (canvasRef.width !== targetW || canvasRef.height !== targetH) {
      canvasRef.width = targetW;
      canvasRef.height = targetH;
    }
    const ctx = canvasRef.getContext("2d", { alpha: false })!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    time++;
    phaseTimer++;

    const palette = getCurrentPalette();

    // Background
    ctx.fillStyle = "#1e1e2e";
    ctx.fillRect(0, 0, w, h);

    if (phase === "scatter" && phaseTimer > 15) {
      phase = "assemble";
      phaseTimer = 0;
    }

    // Background rain
    const rainFont = '12px "JetBrains Mono", monospace';
    ctx.font = rainFont;
    ctx.textBaseline = "top";
    for (const drop of rainDrops) {
      drop.y += drop.speed;
      if (drop.y > h) {
        drop.y = -10;
        drop.x = Math.random() * w;
        drop.ch = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      ctx.fillStyle = RAIN_COLORS[Math.round(drop.alpha * 100)];
      ctx.fillText(drop.ch, drop.x, drop.y);
    }

    // Particles
    const particleFont = '8px "JetBrains Mono", monospace';

    let settledCount = 0;
    for (const p of particles) {
      if (phase === "scatter") {
        p.x += p.vx * 2; p.y += p.vy * 2;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        p.alpha += (0.15 - p.alpha) * 0.12;
      } else if (phase === "assemble") {
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 1) {
          p.x += dx * 0.18; p.y += dy * 0.18;
        } else {
          p.x = p.tx; p.y = p.ty; p.settled = true; settledCount++;
        }
        p.alpha += (p.targetAlpha - p.alpha) * 0.12;
      } else {
        p.x = p.tx + Math.sin(time * 0.015 + p.tx * 0.01) * 0.5;
        p.y = p.ty + Math.cos(time * 0.012 + p.ty * 0.01) * 0.5;
        settledCount++;
        if (Math.random() < 0.002) p.ch = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        // Slowly shift color indices for variety
        if (Math.random() < 0.003) p.colorIdx = Math.floor(Math.random() * palette.length);
      }

      const color = palette[p.colorIdx % palette.length];
      ctx.font = particleFont;
      ctx.fillStyle = cachedHexToRgba(color, p.alpha);
      ctx.fillText(p.ch, p.x - 4, p.y - 5);
    }

    if (phase === "assemble" && settledCount > particles.length * 0.9) {
      phase = "settled";
      phaseTimer = 0;
    }

    // Subtitle + hint
    if (phase === "settled") {
      subtitleProgress = Math.min(subtitleProgress + 1.2, SUBTITLE.length);
      const subText = SUBTITLE.slice(0, Math.floor(subtitleProgress));

      ctx.font = '16px "Courier New", Courier, monospace';
      ctx.textAlign = "center";
      ctx.textBaseline = "top";

      const subY = h * 0.72;

      ctx.fillStyle = `rgba(166, 173, 200, ${Math.min(1, subtitleProgress * 0.1)})`;
      ctx.fillText(subText, w / 2, subY);

      // Cursor — use accent from current palette
      if (subtitleProgress < SUBTITLE.length || Math.floor(time / 30) % 2 === 0) {
        const cursorX = w / 2 + ctx.measureText(subText).width / 2 + 2;
        const cursorColor = palette[0];
        ctx.fillStyle = hexToRgba(cursorColor, subtitleProgress < SUBTITLE.length ? 1 : 0.6);
        ctx.fillRect(cursorX, subY, 2, 16);
      }

      // "Take the tour" button
      if (subtitleProgress >= SUBTITLE.length) {
        tourBtnProgress = Math.min(tourBtnProgress + 0.06, 1);
        const btnAlpha = tourBtnProgress;

        ctx.font = '16px "Courier New", Courier, monospace';
        ctx.textAlign = "center";
        const btnTextW = ctx.measureText(TOUR_LABEL).width;
        const btnPadX = 18;
        const btnPadY = 8;
        const btnW = btnTextW + btnPadX * 2;
        const btnH = 16 + btnPadY * 2;
        const btnX = w / 2 - btnW / 2;
        const btnY = subY + 30;

        tourBtnHitArea = { x: btnX, y: btnY, w: btnW, h: btnH };
        const isHover = mouseX >= btnX && mouseX <= btnX + btnW && mouseY >= btnY && mouseY <= btnY + btnH;

        // Button border
        const borderColor = isHover ? palette[0] : `rgba(88, 91, 112, ${btnAlpha * 0.7})`;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(btnX, btnY, btnW, btnH, 4);
        ctx.stroke();

        // Button text
        ctx.textBaseline = "middle";
        ctx.fillStyle = isHover
          ? `rgba(232, 237, 242, ${btnAlpha * 0.95})`
          : `rgba(166, 173, 200, ${btnAlpha * 0.7})`;
        ctx.fillText(TOUR_LABEL, w / 2, btnY + btnH / 2);

        // Recent folders (inline)
        const folders = props.recentFolders ?? [];
        if (folders.length > 0 && tourBtnProgress > 0.5) {
          const folderAlpha = Math.min(1, (tourBtnProgress - 0.5) * 2);
          const fy = btnY + btnH + 25;
          folderHitAreas = [];

          ctx.font = '16px "JetBrains Mono", monospace';

          // Build display names and measure total width
          const gap = 20;
          const items = folders.map((f) => {
            const name = f.split("/").pop() || f;
            return { display: `/${name}`, path: f, width: ctx.measureText(`/${name}`).width };
          });
          const totalW = items.reduce((sum, item) => sum + item.width, 0) + gap * (items.length - 1);
          let curX = w / 2 - totalW / 2;

          for (const item of items) {
            const hitX = curX - 6;
            const hitW = item.width + 12;
            const isHover = mouseX >= hitX && mouseX <= hitX + hitW && mouseY >= fy - 4 && mouseY <= fy + 18;

            folderHitAreas.push({ x: hitX, y: fy - 4, w: hitW, h: 22, path: item.path });

            ctx.textAlign = "left";
            ctx.fillStyle = isHover
              ? `rgba(232, 237, 242, ${folderAlpha * 0.95})`
              : `rgba(166, 173, 200, ${folderAlpha * 0.6})`;
            ctx.fillText(item.display, curX, fy);
            curX += item.width + gap;
          }
        }
      }
    }

    // Scan line
    const scanY = (time * 2) % h;
    ctx.fillStyle = "rgba(205, 214, 244, 0.008)";
    ctx.fillRect(0, scanY, w, 2);

    animId = requestAnimationFrame(render);
  }

  function handleMouseMove(e: MouseEvent) {
    if (!canvasRef) return;
    const rect = canvasRef.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
    // Update cursor based on hover
    const overFolder = folderHitAreas.some(
      (a) => mouseX >= a.x && mouseX <= a.x + a.w && mouseY >= a.y && mouseY <= a.y + a.h
    );
    const overTour = tourBtnHitArea != null &&
      mouseX >= tourBtnHitArea.x && mouseX <= tourBtnHitArea.x + tourBtnHitArea.w &&
      mouseY >= tourBtnHitArea.y && mouseY <= tourBtnHitArea.y + tourBtnHitArea.h;
    canvasRef.style.cursor = (overFolder || overTour) ? "pointer" : "default";
  }

  function handleClick(e: MouseEvent) {
    if (!canvasRef) return;
    const rect = canvasRef.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    // Tour button
    if (tourBtnHitArea != null &&
      cx >= tourBtnHitArea.x && cx <= tourBtnHitArea.x + tourBtnHitArea.w &&
      cy >= tourBtnHitArea.y && cy <= tourBtnHitArea.y + tourBtnHitArea.h) {
      props.onStartTour?.();
      return;
    }
    for (const area of folderHitAreas) {
      if (cx >= area.x && cx <= area.x + area.w && cy >= area.y && cy <= area.y + area.h) {
        props.onOpenFolder?.(area.path);
        return;
      }
    }
  }

  onMount(() => {
    if (!canvasRef) return;

    canvasRef.addEventListener("mousemove", handleMouseMove);
    canvasRef.addEventListener("click", handleClick);

    // Short delay to let the canvas measure before initializing particles
    requestAnimationFrame(() => {
      init();
      render();
    });

    const obs = new ResizeObserver(() => {
      particles = [];
      cancelAnimationFrame(animId);
      init();
      // On resize, skip scatter and go straight to fast assembly
      phase = "assemble";
      phaseTimer = 0;
      // Start particles closer to their targets for quicker assembly
      for (const p of particles) {
        p.x = p.tx + (Math.random() - 0.5) * 80;
        p.y = p.ty + (Math.random() - 0.5) * 80;
        p.alpha = 0.3;
      }
      render();
    });
    obs.observe(canvasRef);

    onCleanup(() => {
      cancelAnimationFrame(animId);
      obs.disconnect();
      canvasRef?.removeEventListener("mousemove", handleMouseMove);
      canvasRef?.removeEventListener("click", handleClick);
    });
  });

  return (
    <canvas
      ref={canvasRef}
      class="welcome-canvas"
      style={{
        width: "100%",
        height: "100%",
        display: "block",
      }}
    />
  );
};

export default WelcomeCanvas;
