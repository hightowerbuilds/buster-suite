import { ctx, W, H } from './state/canvas-state';
import { C } from './constants/colors';
import { scrollY } from './state/scroll-state';
import { resetClickables } from './state/interaction-state';
import { animating } from './state/particle-state';
import { updateParticles } from './systems/particles';
import { updateWarps, applyWarpPost, updateDrag, applyDragPost } from './systems/warp';
import { drawHero } from './drawing/sections/hero';
import { drawFeatures } from './drawing/sections/features';
import { drawExtensions } from './drawing/sections/extensions';
import { drawFooter } from './drawing/sections/footer';
import { drawRain } from './drawing/sections/rain';
import { drawTopBar } from './drawing/sections/navbar';

let needsRender = true;

export function render() {
  if (!needsRender && !animating) return;
  needsRender = false;

  resetClickables();

  if (animating) {
    updateParticles();
  }

  updateWarps();
  updateDrag();

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = C.base;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(0, -scrollY);
  drawHero();
  drawFeatures();
  drawExtensions();
  drawFooter();
  ctx.restore();

  applyWarpPost();
  applyDragPost();

  drawRain();
  drawTopBar();

  requestAnimationFrame(render);
}

export function requestRender() {
  needsRender = true;
  if (!animating) {
    requestAnimationFrame(render);
  }
}
