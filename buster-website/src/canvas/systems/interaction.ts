import { canvas, NAV_HEIGHT } from '../state/canvas-state';
import { scrollY, sectionOffsets } from '../state/scroll-state';
import {
  clickables, hoveredLink, setHoveredLink, pushWarp,
  startDrag, updateDragPull, releaseDrag,
} from '../state/interaction-state';
import { WARP_RADIUS, WARP_FORCE } from './warp';
import { smoothScrollTo } from './scroll';

const CLICK_THRESHOLD = 5; // pixels — below this it's a click, above it's a drag

export function attachInteractionHandlers(requestRender: () => void) {
  let mouseDownX = 0;
  let mouseDownY = 0;
  let mouseIsDown = false;
  let didDrag = false;

  canvas.addEventListener("mousemove", (e) => {
    const mx = e.clientX;
    const my = e.clientY;

    // Handle active drag
    if (mouseIsDown) {
      const dx = mx - mouseDownX;
      const dy = my - mouseDownY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (!didDrag && dist > CLICK_THRESHOLD) {
        didDrag = true;
        startDrag(mouseDownX, mouseDownY + scrollY); // grab point in content space
        canvas.style.cursor = "grabbing";
      }

      if (didDrag) {
        updateDragPull(dx, dy);
        requestRender();
        return;
      }
    }

    // Hover detection
    let found = null;
    for (const c of clickables) {
      const cy = c.fixed ? c.y : c.y - scrollY;
      if (mx >= c.x && mx <= c.x + c.w && my >= cy && my <= cy + c.h) {
        found = c;
        break;
      }
    }

    if (found !== hoveredLink) {
      setHoveredLink(found);
      canvas.style.cursor = found ? "pointer" : "default";
      requestRender();
    }
  });

  canvas.addEventListener("mousedown", (e) => {
    mouseDownX = e.clientX;
    mouseDownY = e.clientY;
    mouseIsDown = true;
    didDrag = false;
  });

  canvas.addEventListener("mouseup", (e) => {
    const mx = e.clientX;
    const my = e.clientY;
    mouseIsDown = false;

    if (didDrag) {
      // Release the rubber sheet
      releaseDrag();
      canvas.style.cursor = "default";
      requestRender();
      didDrag = false;
      return;
    }

    // It was a click — check clickables first
    let handled = false;
    for (const c of clickables) {
      const cy = c.fixed ? c.y : c.y - scrollY;
      if (mx >= c.x && mx <= c.x + c.w && my >= cy && my <= cy + c.h) {
        if (c.action === "link") {
          window.open(c.url, "_blank");
        } else if (c.action === "scroll") {
          const offset = (sectionOffsets as any)[c.target!] || 0;
          smoothScrollTo(offset - NAV_HEIGHT);
        }
        handled = true;
        break;
      }
    }

    // Warp effect on non-link clicks
    if (!handled) {
      pushWarp({ x: mx, y: my + scrollY, radius: WARP_RADIUS, force: WARP_FORCE });
      requestRender();
    }
  });

  // Cancel drag if mouse leaves the canvas
  canvas.addEventListener("mouseleave", () => {
    if (mouseIsDown && didDrag) {
      releaseDrag();
      canvas.style.cursor = "default";
      requestRender();
    }
    mouseIsDown = false;
    didDrag = false;
  });
}
