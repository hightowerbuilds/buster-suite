export const canvas = document.getElementById("canvas") as HTMLCanvasElement;
export const ctx = canvas.getContext("2d")!;

export let dpr = window.devicePixelRatio || 1;
export let W = window.innerWidth;
export let H = window.innerHeight;

export const NAV_HEIGHT = 40;
export const MAX_WIDTH = 800;

export function contentX() {
  return Math.max(20, (W - MAX_WIDTH) / 2);
}

export function resize(onLayout: () => void, onRender: () => void) {
  dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  onLayout();
  onRender();
}
