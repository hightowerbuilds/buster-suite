import { ctx, W, MAX_WIDTH, contentX } from '../../state/canvas-state';
import { C } from '../../constants/colors';
import { FONT_UI } from '../../constants/fonts';
import { FEATURES, TECH_STACK, SHORTCUTS } from '../../constants/data';
import { sectionOffsets } from '../../state/scroll-state';
import { drawLine, drawTable, wrapText } from '../helpers';

export function drawFeatures() {
  const cx = contentX();
  const cw = Math.min(MAX_WIDTH, W - 40);
  let y = sectionOffsets.features + 80;

  ctx.font = `28px ${FONT_UI}`;
  ctx.fillStyle = C.text;
  ctx.textBaseline = "top";
  ctx.fillText("What Buster Does", cx, y);
  y += 28 + 10;

  drawLine(cx, y, cx + cw, y, C.surface0, 1);
  y += 30;

  for (const f of FEATURES) {
    ctx.font = `18px ${FONT_UI}`;
    ctx.fillStyle = C.blue;
    ctx.textBaseline = "top";
    ctx.fillText(f.name, cx, y);
    y += 18 + 8;

    ctx.font = `14px ${FONT_UI}`;
    ctx.fillStyle = C.textDim;
    const lines = wrapText(f.desc, cw, `14px ${FONT_UI}`);
    for (const line of lines) {
      ctx.fillText(line, cx, y);
      y += 14 * 1.6;
    }
    y += 24;
  }

  y += 40;

  ctx.font = `18px ${FONT_UI}`;
  ctx.fillStyle = C.text;
  ctx.fillText("Tech Stack", cx, y);
  y += 18 + 16;
  const th = drawTable(cx, y, ["Layer", "Technology"], TECH_STACK, cw);
  y += th + 20;

  y += 40;

  ctx.font = `18px ${FONT_UI}`;
  ctx.fillStyle = C.text;
  ctx.fillText("Keyboard Shortcuts", cx, y);
  y += 18 + 16;

  ctx.font = `14px ${FONT_UI}`;
  ctx.textBaseline = "top";
  const shortcutKeyW = Math.min(cw * 0.4, 240);
  for (const [key, desc] of SHORTCUTS) {
    ctx.fillStyle = C.peach;
    ctx.fillText(key, cx + 10, y);
    ctx.fillStyle = C.textDim;
    ctx.fillText(desc, cx + shortcutKeyW, y);
    y += 24;
  }
}
