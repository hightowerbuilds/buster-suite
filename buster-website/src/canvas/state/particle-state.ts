interface Target {
  x: number; y: number;
  ch: string;
  color: string;
  filled: boolean;
  alpha: number;
}

interface RainDrop {
  x: number; y: number;
  speed: number;
  ch: string;
  color: string;
  alpha: number;
  captured: boolean;
}

export let targets: Target[] = [];
export let targetGrid: Record<number, Target[]> = {};
export let rainDrops: RainDrop[] = [];

export let animFrame = 0;
export let animating = true;
export let heroSettled = false;
export let subtitleAlpha = 0;
export let filledCount = 0;

export function setTargets(t: Target[]) { targets = t; }
export function setTargetGrid(g: Record<number, Target[]>) { targetGrid = g; }
export function setRainDrops(r: RainDrop[]) { rainDrops = r; }
export function setAnimFrame(v: number) { animFrame = v; }
export function setAnimating(v: boolean) { animating = v; }
export function setHeroSettled(v: boolean) { heroSettled = v; }
export function setSubtitleAlpha(v: number) { subtitleAlpha = v; }
export function setFilledCount(v: number) { filledCount = v; }
export function incFilledCount() { filledCount++; }
export function incAnimFrame() { animFrame++; }
