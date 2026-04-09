import { Component, createSignal, Show, onCleanup } from "solid-js";
import { palette } from "../lib/app-state";

export type LayoutMode = "tabs" | "columns" | "grid" | "trio" | "quint" | "restack" | "hq";

interface LayoutPickerProps {
  current: LayoutMode;
  onChange: (mode: LayoutMode) => void;
}

const LAYOUTS: { mode: LayoutMode; label: string }[] = [
  { mode: "tabs", label: "Tabs" },
  { mode: "columns", label: "Columns" },
  { mode: "trio", label: "Trio" },
  { mode: "grid", label: "Grid" },
  { mode: "quint", label: "Five" },
  { mode: "restack", label: "Rerack" },
  { mode: "hq", label: "HQ" },
];

// Mini canvas previews of each layout
function drawLayoutPreview(
  canvas: HTMLCanvasElement,
  mode: LayoutMode,
  active: boolean,
  staticIntensity: number = 0,
  bgColor?: string,
  fgColor?: string
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = 36;
  const h = 24;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.scale(dpr, dpr);

  const bg = bgColor ?? (active ? "#313244" : "#1e1e2e");
  const fg = fgColor ?? (active ? "#89b4fa" : "#585b70");
  const gap = 2;

  // Background
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = fg;

  switch (mode) {
    case "tabs": {
      ctx.fillRect(gap, gap, w - gap * 2, h - gap * 2);
      break;
    }
    case "columns": {
      const colW = (w - gap * 4) / 3;
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(gap + i * (colW + gap), gap, colW, h - gap * 2);
      }
      break;
    }
    case "grid": {
      const cellW = (w - gap * 3) / 2;
      const cellH = (h - gap * 3) / 2;
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
          ctx.fillRect(
            gap + col * (cellW + gap),
            gap + row * (cellH + gap),
            cellW,
            cellH
          );
        }
      }
      break;
    }
    case "trio": {
      const leftW = (w - gap * 3) * 0.6;
      const rightW = w - gap * 3 - leftW;
      const rightH = (h - gap * 3) / 2;
      ctx.fillRect(gap, gap, leftW, h - gap * 2);
      ctx.fillRect(gap * 2 + leftW, gap, rightW, rightH);
      ctx.fillRect(gap * 2 + leftW, gap * 2 + rightH, rightW, rightH);
      break;
    }
    case "quint": {
      // Left column + right 2x2 grid
      const qLeftW = (w - gap * 3) * 0.35;
      const qRightW = w - gap * 3 - qLeftW;
      const qCellW = (qRightW - gap) / 2;
      const qCellH = (h - gap * 3) / 2;
      ctx.fillRect(gap, gap, qLeftW, h - gap * 2);
      ctx.fillRect(gap * 2 + qLeftW, gap, qCellW, qCellH);
      ctx.fillRect(gap * 3 + qLeftW + qCellW, gap, qCellW, qCellH);
      ctx.fillRect(gap * 2 + qLeftW, gap * 2 + qCellH, qCellW, qCellH);
      ctx.fillRect(gap * 3 + qLeftW + qCellW, gap * 2 + qCellH, qCellW, qCellH);
      break;
    }
    case "restack": {
      // 3 columns on left + 2 stacked panels on right
      const rsLeftW = (w - gap * 3) * 0.6;
      const rsRightW = w - gap * 3 - rsLeftW;
      const rsColW = (rsLeftW - gap * 2) / 3;
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(gap + i * (rsColW + gap), gap, rsColW, h - gap * 2);
      }
      const rsHalfH = (h - gap * 3) / 2;
      ctx.fillRect(gap * 2 + rsLeftW, gap, rsRightW, rsHalfH);
      ctx.fillRect(gap * 2 + rsLeftW, gap * 2 + rsHalfH, rsRightW, rsHalfH);
      break;
    }
    case "hq": {
      // 3 columns x 2 rows
      const hqColW = (w - gap * 4) / 3;
      const hqRowH = (h - gap * 3) / 2;
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
          ctx.fillRect(
            gap + col * (hqColW + gap),
            gap + row * (hqRowH + gap),
            hqColW,
            hqRowH
          );
        }
      }
      break;
    }
  }

  // TV static overlay
  if (staticIntensity > 0) {
    const imageData = ctx.getImageData(0, 0, w * dpr, h * dpr);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (Math.random() < staticIntensity) {
        const v = Math.random() * 255;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 90 + Math.random() * 38;
      }
    }
    // Occasional horizontal tear lines
    const tearCount = Math.floor(Math.random() * 3);
    for (let t = 0; t < tearCount; t++) {
      const y = Math.floor(Math.random() * h * dpr);
      const shift = Math.floor(Math.random() * 6) - 3;
      if (shift !== 0) {
        const rowStart = y * w * dpr * 4;
        const rowEnd = rowStart + w * dpr * 4;
        if (rowEnd <= data.length) {
          const row = data.slice(rowStart, rowEnd);
          const absShift = Math.abs(shift) * 4;
          for (let p = 0; p < row.length; p++) {
            const src = shift > 0 ? (p + absShift) % row.length : (p - absShift + row.length) % row.length;
            data[rowStart + p] = row[src];
          }
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);

    // Faint scanlines
    ctx.fillStyle = `rgba(0, 0, 0, ${0.06 * staticIntensity})`;
    for (let sy = 0; sy < h; sy += 2) {
      ctx.fillRect(0, sy, w, 1);
    }
  }
}

const LayoutPicker: Component<LayoutPickerProps> = (props) => {
  const [open, setOpen] = createSignal(false);
  let triggerCanvas: HTMLCanvasElement | undefined;
  let staticAnim: number | null = null;
  let hovering = false;

  function drawTrigger(intensity: number = 0) {
    const p = palette();
    if (triggerCanvas) drawLayoutPreview(triggerCanvas, props.current, true, intensity, p.surface0, p.accent);
  }

  function startStatic() {
    hovering = true;
    const loop = () => {
      if (!hovering) {
        drawTrigger(0);
        staticAnim = null;
        return;
      }
      drawTrigger(0.3);
      staticAnim = requestAnimationFrame(loop);
    };
    if (!staticAnim) staticAnim = requestAnimationFrame(loop);
  }

  function stopStatic() {
    hovering = false;
  }

  return (
    <div class="layout-picker">
      <button
        class="layout-trigger"
        onClick={() => setOpen(!open())}
        onMouseEnter={startStatic}
        onMouseLeave={stopStatic}
        title="Change layout"
        aria-label="Change layout"
        aria-haspopup="true"
        aria-expanded={open()}
      >
        <canvas
          ref={(el) => {
            triggerCanvas = el;
            requestAnimationFrame(() => drawTrigger());
            const triggerInterval = setInterval(() => { if (!hovering) drawTrigger(); }, 500);
            onCleanup(() => clearInterval(triggerInterval));
          }}
        />
      </button>
      <Show when={open()}>
        <div class="layout-dropdown" role="menu" aria-label="Layout options">
          {LAYOUTS.map((l) => {
            let itemCanvas: HTMLCanvasElement | undefined;
            let itemHovering = false;
            let itemAnim: number | null = null;

            const isActive = () => l.mode === props.current;

            function drawItem(intensity: number = 0) {
              if (!itemCanvas) return;
              const p = palette();
              drawLayoutPreview(itemCanvas, l.mode, isActive(), intensity, p.surface0, isActive() ? p.accent : p.textMuted);
            }

            function startItemStatic() {
              itemHovering = true;
              const loop = () => {
                if (!itemHovering) { drawItem(0); itemAnim = null; return; }
                drawItem(0.3);
                itemAnim = requestAnimationFrame(loop);
              };
              if (!itemAnim) itemAnim = requestAnimationFrame(loop);
            }

            function stopItemStatic() {
              itemHovering = false;
            }

            return (
              <button
                class={`layout-dropdown-item ${isActive() ? "layout-dropdown-active" : ""}`}
                role="menuitemradio"
                aria-checked={isActive()}
                aria-label={l.label}
                onClick={() => {
                  props.onChange(l.mode);
                  setOpen(false);
                }}
                onMouseEnter={startItemStatic}
                onMouseLeave={stopItemStatic}
              >
                <canvas
                  ref={(el) => {
                    itemCanvas = el;
                    requestAnimationFrame(() => drawItem());
                  }}
                />
                <span>{l.label}</span>
              </button>
            );
          })}
        </div>
      </Show>
    </div>
  );
};

export default LayoutPicker;
