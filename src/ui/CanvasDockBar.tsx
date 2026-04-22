/**
 * CanvasDockBar — canvas-rendered dock bar.
 *
 * Contains: quick-panel button (left), split-right / split-down / unsplit buttons (right).
 */

import { Component } from "solid-js";
import CanvasChrome, { CHROME_FONT, type HitRegion, type PaintFn } from "./canvas-chrome";
import { useBuster } from "../lib/buster-context";

// ── Props ────────────────────────────────────────────────────────────

interface CanvasDockBarProps {
  currentPanelCount: number;
  onSplitRight: () => void;
  onSplitDown: () => void;
  onCloseSplit: () => void;
  onQuickPanel: () => void;
}

// ── Constants ────────────────────────────────────────────────────────

const BAR_H = 38;
const BTN_PAD = 8;

// ── Component ────────────────────────────────────────────────────────

const CanvasDockBar: Component<CanvasDockBarProps> = (props) => {
  const { store } = useBuster();

  const paint: PaintFn = (ctx, w, h, hovered) => {
    const p = store.palette;
    const regions: HitRegion[] = [];

    // Background + top border
    ctx.fillStyle = p.cssCrust;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = p.surface0;
    ctx.fillRect(0, 0, w, 1);

    ctx.font = `13px ${CHROME_FONT}`;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    // ── Quick-panel button (left) ────────────────────────────────────
    const qpText = "~~~";
    const qpW = ctx.measureText(qpText).width + BTN_PAD * 2;
    const qpH = 26;
    const qpX = 4;
    const qpY = (h - qpH) / 2;
    const qpHovered = hovered === "quick-panel";

    ctx.fillStyle = qpHovered ? p.surface0 : "transparent";
    ctx.beginPath();
    ctx.roundRect(qpX, qpY, qpW, qpH, 3);
    ctx.fill();
    ctx.strokeStyle = qpHovered ? p.border : p.surface0;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(qpX, qpY, qpW, qpH, 3);
    ctx.stroke();
    ctx.fillStyle = qpHovered ? p.text : p.textDim;
    ctx.fillText(qpText, qpX + BTN_PAD, h / 2);

    regions.push({
      id: "quick-panel",
      x: qpX, y: qpY, w: qpW, h: qpH,
      cursor: "pointer",
      onClick: () => props.onQuickPanel(),
    });

    // ── Split buttons (right) ────────────────────────────────────────
    ctx.textAlign = "center";
    const btnH = 26;
    const btnGap = 4;
    const canClose = props.currentPanelCount > 1;

    // Button definitions: label, id, action
    const buttons: { label: string; id: string; action: () => void; enabled: boolean }[] = [
      { label: "\u2590\u258C", id: "split-right", action: props.onSplitRight, enabled: props.currentPanelCount < 6 },   // ▐▌ split right
      { label: "\u2580\u2584", id: "split-down", action: props.onSplitDown, enabled: props.currentPanelCount < 6 },      // ▀▄ split down
      { label: "\u2715", id: "close-split", action: props.onCloseSplit, enabled: canClose },                              // ✕ close split
    ];

    let bx = w - 4;
    for (let i = buttons.length - 1; i >= 0; i--) {
      const btn = buttons[i];
      const btnW = ctx.measureText(btn.label).width + BTN_PAD * 2;
      bx -= btnW;
      const by = (h - btnH) / 2;
      const isHovered = hovered === btn.id;

      if (isHovered && btn.enabled) {
        ctx.fillStyle = p.surface0;
        ctx.beginPath();
        ctx.roundRect(bx, by, btnW, btnH, 3);
        ctx.fill();
      }

      ctx.fillStyle = !btn.enabled ? p.surface0 : isHovered ? p.text : p.textDim;
      ctx.fillText(btn.label, bx + btnW / 2, h / 2);

      if (btn.enabled) {
        regions.push({
          id: btn.id,
          x: bx, y: by, w: btnW, h: btnH,
          cursor: "pointer",
          onClick: () => btn.action(),
        });
      }

      bx -= btnGap;
    }

    return regions;
  };

  return (
    <CanvasChrome
      class="dock-bar"
      height={BAR_H}
      paint={paint}
      style={{ "flex-shrink": "0" }}
      role="toolbar"
      aria-label="Panel layout"
    />
  );
};

export default CanvasDockBar;
