import { resize } from './canvas/state/canvas-state';
import { initParticles } from './canvas/systems/particles';
import { computeLayout } from './canvas/layout';
import { render, requestRender } from './canvas/renderer';
import { attachScrollHandlers } from './canvas/systems/scroll';
import { attachInteractionHandlers } from './canvas/systems/interaction';

async function init() {
  try {
    await document.fonts.load('48px "UnifrakturMaguntia"');
    await document.fonts.load('14px "JetBrains Mono"');
    await document.fonts.ready;
  } catch {
    // Continue even if fonts fail
  }

  resize(computeLayout, requestRender);
  window.addEventListener("resize", () => resize(computeLayout, requestRender));
  initParticles();
  computeLayout();
  attachScrollHandlers(requestRender);
  attachInteractionHandlers(requestRender);
  requestAnimationFrame(render);
}

init();
