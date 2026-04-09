// Shared pointer-event-based drag state management.
// No HTML DnD API — pure pointer events for full control.

export interface DragState<T = unknown> {
  active: boolean;
  data: T | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  element: HTMLElement | null;
}

const DRAG_THRESHOLD = 5; // px before drag activates

export function createDragHandler<T>(opts: {
  onDragStart?: (data: T, e: PointerEvent) => void;
  onDragMove?: (data: T, e: PointerEvent) => void;
  onDragEnd?: (data: T, e: PointerEvent) => void;
  onCancel?: () => void;
}) {
  let state: DragState<T> = {
    active: false,
    data: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    element: null,
  };
  let pending = false;

  function onPointerDown(data: T, e: PointerEvent) {
    state.data = data;
    state.startX = e.clientX;
    state.startY = e.clientY;
    state.currentX = e.clientX;
    state.currentY = e.clientY;
    state.element = e.currentTarget as HTMLElement;
    pending = true;

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  }

  function onPointerMove(e: PointerEvent) {
    state.currentX = e.clientX;
    state.currentY = e.clientY;

    if (!state.active && pending) {
      const dx = Math.abs(e.clientX - state.startX);
      const dy = Math.abs(e.clientY - state.startY);
      if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
        state.active = true;
        pending = false;
        document.body.style.userSelect = "none";
        opts.onDragStart?.(state.data!, e);
      }
    }

    if (state.active) {
      opts.onDragMove?.(state.data!, e);
    }
  }

  function onPointerUp(e: PointerEvent) {
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);

    if (state.active) {
      document.body.style.userSelect = "";
      opts.onDragEnd?.(state.data!, e);
    }

    state.active = false;
    state.data = null;
    pending = false;
  }

  return { onPointerDown, getState: () => state };
}
