import { ctx } from '../state/canvas-state';
import { C } from '../constants/colors';
import { FONT_UI } from '../constants/fonts';

export function drawLine(x1: number, y1: number, x2: number, y2: number, color: string, width?: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width || 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

export function drawTable(x: number, y: number, headers: string[], rows: string[][], cw: number) {
  const rowH = 28;
  const col1W = Math.min(cw * 0.4, 260);

  ctx.strokeStyle = C.surface0;
  ctx.lineWidth = 1;

  ctx.fillStyle = C.mantle;
  ctx.fillRect(x, y, cw, rowH);
  ctx.font = `14px ${FONT_UI}`;
  ctx.fillStyle = C.text;
  ctx.textBaseline = "middle";
  ctx.fillText(headers[0], x + 10, y + rowH / 2);
  ctx.fillText(headers[1], x + col1W + 10, y + rowH / 2);

  ctx.strokeRect(x, y, cw, rowH);
  drawLine(x + col1W, y, x + col1W, y + rowH, C.surface0, 1);

  for (let i = 0; i < rows.length; i++) {
    const ry = y + (i + 1) * rowH;
    ctx.fillStyle = i % 2 === 0 ? C.base : C.crust;
    ctx.fillRect(x, ry, cw, rowH);
    ctx.strokeRect(x, ry, cw, rowH);
    drawLine(x + col1W, ry, x + col1W, ry + rowH, C.surface0, 1);

    ctx.fillStyle = C.textDim;
    ctx.fillText(rows[i][0], x + 10, ry + rowH / 2);
    ctx.fillStyle = C.text;
    ctx.fillText(rows[i][1], x + col1W + 10, ry + rowH / 2);
  }

  return (rows.length + 1) * rowH;
}

export function roundRect(x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function wrapText(text: string, maxWidth: number, font: string) {
  ctx.font = font;
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? current + " " + word : word;
    if (ctx.measureText(test).width > maxWidth) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}
