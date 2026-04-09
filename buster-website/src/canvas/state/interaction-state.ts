export interface Clickable {
  x: number; y: number; w: number; h: number;
  label: string;
  action: string;
  target?: string;
  url?: string;
  fixed?: boolean;
}

export interface WarpSource {
  x: number; y: number;
  radius: number;
  force: number;
}

export let clickables: Clickable[] = [];
export let hoveredLink: Clickable | null = null;
export let warpSources: WarpSource[] = [];

// Drag state (rubber-sheet pull effect)
export let dragActive = false;
export let dragGrabX = 0;
export let dragGrabY = 0;
export let dragPullX = 0;
export let dragPullY = 0;
export let dragVelX = 0;
export let dragVelY = 0;

export function resetClickables() { clickables = []; }
export function setHoveredLink(v: Clickable | null) { hoveredLink = v; }
export function pushClickable(c: Clickable) { clickables.push(c); }
export function pushWarp(w: WarpSource) { warpSources.push(w); }

export function startDrag(x: number, y: number) {
  dragActive = true;
  dragGrabX = x;
  dragGrabY = y;
  dragPullX = 0;
  dragPullY = 0;
  dragVelX = 0;
  dragVelY = 0;
}

export function updateDragPull(px: number, py: number) {
  dragPullX = px;
  dragPullY = py;
}

export function releaseDrag() {
  dragActive = false;
  // Velocity is set from last pull for momentum
  dragVelX = dragPullX * 0.3;
  dragVelY = dragPullY * 0.3;
}

export function setDragPhysics(px: number, py: number, vx: number, vy: number) {
  dragPullX = px;
  dragPullY = py;
  dragVelX = vx;
  dragVelY = vy;
}
