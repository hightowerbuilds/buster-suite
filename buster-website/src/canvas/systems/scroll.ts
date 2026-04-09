import { canvas, H } from '../state/canvas-state';
import { scrollY, scrollVelocity, totalContentHeight, setScrollY, setScrollVelocity } from '../state/scroll-state';

let scrollAnimId: number | null = null;
let requestRenderFn: () => void;

export function attachScrollHandlers(requestRender: () => void) {
  requestRenderFn = requestRender;

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    setScrollVelocity(scrollVelocity + e.deltaY);
    if (!scrollAnimId) {
      scrollAnimId = requestAnimationFrame(tickScroll);
    }
  }, { passive: false });

  let touchStartY = 0;
  let touchLastY = 0;

  canvas.addEventListener("touchstart", (e) => {
    touchStartY = e.touches[0].clientY;
    touchLastY = touchStartY;
    setScrollVelocity(0);
  }, { passive: true });

  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    const ty = e.touches[0].clientY;
    const delta = touchLastY - ty;
    setScrollY(scrollY + delta);
    touchLastY = ty;
    const maxScroll = Math.max(0, totalContentHeight - H);
    setScrollY(Math.max(0, Math.min(scrollY, maxScroll)));
    requestRenderFn();
  }, { passive: false });

  canvas.addEventListener("touchend", () => {
    setScrollVelocity((touchLastY - touchStartY) > 0 ? -2 : 2);
    if (Math.abs(scrollVelocity) > 0.5 && !scrollAnimId) {
      scrollAnimId = requestAnimationFrame(tickScroll);
    }
  }, { passive: true });
}

function tickScroll() {
  setScrollY(scrollY + scrollVelocity * 0.5);
  setScrollVelocity(scrollVelocity * 0.85);

  const maxScroll = Math.max(0, totalContentHeight - H);
  setScrollY(Math.max(0, Math.min(scrollY, maxScroll)));

  requestRenderFn();

  if (Math.abs(scrollVelocity) > 0.5) {
    scrollAnimId = requestAnimationFrame(tickScroll);
  } else {
    setScrollVelocity(0);
    scrollAnimId = null;
  }
}

export function smoothScrollTo(targetY: number) {
  const maxScroll = Math.max(0, totalContentHeight - H);
  targetY = Math.max(0, Math.min(targetY, maxScroll));

  const startY = scrollY;
  const dist = targetY - startY;
  const duration = 600;
  const startTime = performance.now();

  function step(now: number) {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / duration);
    const ease = 1 - Math.pow(1 - t, 3);
    setScrollY(startY + dist * ease);
    requestRenderFn();
    if (t < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}
