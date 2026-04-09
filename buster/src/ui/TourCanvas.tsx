import { Component, onMount, onCleanup, createSignal } from "solid-js";
import { TOUR_STEPS } from "./tourSteps";
import {
  GLYPHS, PALETTE, GREEN_PALETTE, RAIN_COLORS,
  SCATTER_IN_FRAMES, SCATTER_OUT_FRAMES, BG_COLOR,
  type Particle, type RainDrop, type Phase,
  sampleTextPixels, hexToRgba, computeTitleFontSize, initRain,
} from "./tour-utils";
import { createMatrixRain } from "./tour-matrix-rain";
import { renderSettledSlide, resetBlogState, type SlideState } from "./tour-slide-renderer";

interface TourCanvasProps {
  onClose: () => void;
}

const TourCanvas: Component<TourCanvasProps> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined;
  let animId: number;
  let particles: Particle[] = [];
  let rainDrops: RainDrop[] = [];
  let time = 0;
  let currentStep = 0;
  let pendingStep = -1;
  let phase: Phase = "scatter-in";
  let phaseTimer = 0;

  const slideState: SlideState = {
    subtitleProgress: 0,
    hintProgress: 0,
    indicatorAlpha: 0,
    navHintAlpha: 0,
  };

  const matrixRain = createMatrixRain();

  // Parallel DOM for screen readers — announces current slide content
  const [a11yText, setA11yText] = createSignal("");

  function announceStep(stepIdx: number) {
    const step = TOUR_STEPS[stepIdx];
    if (!step) return;
    const parts = [step.title];
    if (step.subtitle) parts.push(step.subtitle);
    if (step.hint) parts.push(step.hint);
    parts.push(`Slide ${stepIdx + 1} of ${TOUR_STEPS.length}. Use arrow keys to navigate, Escape to exit.`);
    setA11yText(parts.join(". "));
  }

  function initStep(stepIdx: number) {
    announceStep(stepIdx);
    if (!canvasRef) return;
    const w = canvasRef.clientWidth;
    const h = canvasRef.clientHeight;
    if (w === 0 || h === 0) return;

    const step = TOUR_STEPS[stepIdx];
    if (!step) return;

    const isBusterStep = step.title === "BUSTER";
    const isTerminalStep = step.special === "terminal";
    const displayTitle = isBusterStep ? "Buster" : step.title;
    const fontFamily = isBusterStep
      ? '"UnifrakturMaguntia", "JetBrains Mono", monospace'
      : '"JetBrains Mono", "Menlo", "Monaco", monospace';

    // Size the title
    const c = document.createElement("canvas");
    c.width = 1; c.height = 1;
    const ctx = c.getContext("2d")!;
    let finalSize: number;
    if (isBusterStep) {
      finalSize = 320;
      const maxWidth = w * 0.85;
      while (finalSize > 48) {
        ctx.font = `${finalSize}px ${fontFamily}`;
        if (ctx.measureText(displayTitle).width <= maxWidth) break;
        finalSize -= 8;
      }
    } else if (isTerminalStep) {
      finalSize = 500;
      const maxWidth = w * 0.85;
      while (finalSize > 48) {
        ctx.font = `${finalSize}px ${fontFamily}`;
        if (ctx.measureText(displayTitle).width <= maxWidth) break;
        finalSize -= 8;
      }
    } else {
      finalSize = computeTitleFontSize(displayTitle, w, fontFamily);
    }

    const samplingStep = finalSize >= 100 ? 5 : finalSize >= 48 ? 6 : 4;
    ctx.font = `${finalSize}px ${fontFamily}`;
    const titleW = ctx.measureText(displayTitle).width;
    const offsetX = (w - titleW) / 2 - 10;
    const offsetY = isBusterStep ? (h - finalSize) * 0.35 : h * 0.25;

    const points = sampleTextPixels(displayTitle, finalSize, offsetX, offsetY, samplingStep, fontFamily);
    const stepPalette = isTerminalStep ? GREEN_PALETTE : PALETTE;

    particles = points.map((p) => ({
      tx: p.x, ty: p.y,
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4,
      ch: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
      color: stepPalette[Math.floor(Math.random() * stepPalette.length)],
      alpha: 0.1 + Math.random() * 0.3,
      targetAlpha: 0.7 + Math.random() * 0.3,
      settled: false,
    }));

    phase = "scatter-in";
    phaseTimer = 0;
    slideState.subtitleProgress = 0;
    slideState.hintProgress = 0;
    slideState.indicatorAlpha = 0;
    slideState.navHintAlpha = 0;
  }

  function transitionToStep(newIdx: number) {
    pendingStep = newIdx;
    phase = "scatter-out";
    phaseTimer = 0;
    for (const p of particles) {
      p.vx = (Math.random() - 0.5) * 8;
      p.vy = (Math.random() - 0.5) * 8;
    }
  }

  function render() {
    if (!canvasRef) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvasRef.clientWidth;
    const h = canvasRef.clientHeight;
    if (w === 0 || h === 0) { animId = requestAnimationFrame(render); return; }

    const targetW = w * dpr;
    const targetH = h * dpr;
    if (canvasRef.width !== targetW || canvasRef.height !== targetH) {
      canvasRef.width = targetW;
      canvasRef.height = targetH;
    }
    const ctx = canvasRef.getContext("2d", { alpha: false })!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    time++;
    phaseTimer++;

    const step = TOUR_STEPS[currentStep];

    // Background
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    // Phase transitions
    if (phase === "scatter-in" && phaseTimer > SCATTER_IN_FRAMES) {
      phase = "assemble";
      phaseTimer = 0;
    }
    if (phase === "scatter-out" && phaseTimer > SCATTER_OUT_FRAMES) {
      currentStep = pendingStep;
      pendingStep = -1;
      matrixRain.reset();
      resetBlogState();
      initStep(currentStep);
    }

    // Rain
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.textAlign = "left";
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
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    let settledCount = 0;
    for (const p of particles) {
      if (phase === "scatter-in") {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        p.alpha += (0.15 - p.alpha) * 0.05;
      } else if (phase === "assemble") {
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 1) {
          p.x += dx * 0.06; p.y += dy * 0.06;
        } else {
          p.x = p.tx; p.y = p.ty; p.settled = true; settledCount++;
        }
        p.alpha += (p.targetAlpha - p.alpha) * 0.03;
      } else if (phase === "settled") {
        p.x = p.tx + Math.sin(time * 0.015 + p.tx * 0.01) * 0.5;
        p.y = p.ty + Math.cos(time * 0.012 + p.ty * 0.01) * 0.5;
        settledCount++;
        if (Math.random() < 0.002) p.ch = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        if (Math.random() < 0.001) p.color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
      } else if (phase === "scatter-out") {
        p.x += p.vx; p.y += p.vy;
        p.alpha *= 0.94;
      }

      ctx.fillStyle = hexToRgba(p.color, Math.min(1, Math.max(0, p.alpha)));
      ctx.fillText(p.ch, p.x, p.y);
    }

    if (phase === "assemble" && settledCount > particles.length * 0.9) {
      phase = "settled";
      phaseTimer = 0;
    }

    // Settled: delegate to slide renderer
    if (phase === "settled" && step) {
      renderSettledSlide(ctx, slideState, currentStep, w, h, time, matrixRain);
    }

    // Scan line
    const scanY = (time * 2) % h;
    ctx.fillStyle = "rgba(205, 214, 244, 0.008)";
    ctx.fillRect(0, scanY, w, 2);

    animId = requestAnimationFrame(render);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (phase !== "settled") return;
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      if (currentStep >= TOUR_STEPS.length - 1) props.onClose();
      else transitionToStep(currentStep + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      if (currentStep > 0) transitionToStep(currentStep - 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      props.onClose();
    }
  }

  function handleClick() {
    if (phase !== "settled") return;
    if (currentStep >= TOUR_STEPS.length - 1) props.onClose();
    else transitionToStep(currentStep + 1);
  }

  onMount(() => {
    if (!canvasRef) return;
    canvasRef.focus();

    setTimeout(() => {
      const w = canvasRef!.clientWidth;
      const h = canvasRef!.clientHeight;
      rainDrops = initRain(w, h);
      initStep(0);
      if (particles.length > 0) render();
      else setTimeout(() => { initStep(0); render(); }, 500);
    }, 100);

    const obs = new ResizeObserver(() => {
      const w = canvasRef!.clientWidth;
      const h = canvasRef!.clientHeight;
      cancelAnimationFrame(animId);
      rainDrops = initRain(w, h);
      initStep(currentStep);
      render();
    });
    obs.observe(canvasRef);

    onCleanup(() => {
      cancelAnimationFrame(animId);
      obs.disconnect();
    });
  });

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }} role="region" aria-label="Guided tour">
      <canvas
        ref={canvasRef}
        tabindex={0}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        aria-hidden="true"
        style={{ width: "100%", height: "100%", display: "block", outline: "none" }}
      />
      <div class="visually-hidden" aria-live="assertive" aria-atomic="true">
        {a11yText()}
      </div>
    </div>
  );
};

export default TourCanvas;
