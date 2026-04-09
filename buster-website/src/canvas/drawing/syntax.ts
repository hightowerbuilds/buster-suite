import { ctx } from '../state/canvas-state';
import { C } from '../constants/colors';
import { FONT_CODE } from '../constants/fonts';

export function drawTomlLine(line: string, x: number, y: number) {
  ctx.font = `14px ${FONT_CODE}`;
  ctx.textBaseline = "top";

  if (line.trim() === "") return;

  if (/^\[.+\]$/.test(line.trim())) {
    ctx.fillStyle = C.mauve;
    ctx.fillText(line, x, y);
    return;
  }

  const commentIdx = line.indexOf("#");
  let mainPart = line;
  let commentPart = "";
  if (commentIdx >= 0) {
    const beforeHash = line.substring(0, commentIdx);
    const quoteCount = (beforeHash.match(/"/g) || []).length;
    if (quoteCount % 2 === 0) {
      mainPart = line.substring(0, commentIdx);
      commentPart = line.substring(commentIdx);
    }
  }

  const eqIdx = mainPart.indexOf("=");
  if (eqIdx >= 0) {
    const key = mainPart.substring(0, eqIdx);
    const val = mainPart.substring(eqIdx + 1).trim();

    ctx.fillStyle = C.blue;
    ctx.fillText(key, x, y);
    const keyW = ctx.measureText(key).width;

    ctx.fillStyle = C.text;
    ctx.fillText("=", x + keyW, y);
    const eqW = ctx.measureText("= ").width;

    if (val.startsWith('"')) {
      ctx.fillStyle = C.green;
    } else if (val === "true" || val === "false") {
      ctx.fillStyle = C.peach;
    } else {
      ctx.fillStyle = C.text;
    }
    const valX = x + keyW + eqW;
    ctx.fillText(val, valX, y);

    if (commentPart) {
      const valW = ctx.measureText(val).width;
      ctx.fillStyle = C.comment;
      ctx.fillText(commentPart, valX + valW + ctx.measureText(" ").width, y);
    }
  } else {
    ctx.fillStyle = C.text;
    ctx.fillText(mainPart, x, y);
    if (commentPart) {
      const mw = ctx.measureText(mainPart).width;
      ctx.fillStyle = C.comment;
      ctx.fillText(commentPart, x + mw, y);
    }
  }
}

export function drawJsonLine(line: string, x: number, y: number) {
  ctx.font = `14px ${FONT_CODE}`;
  ctx.textBaseline = "top";

  let cx = x;
  const tokens = line.match(/("(?:[^"\\]|\\.)*")\s*:|("(?:[^"\\]|\\.)*")|([{}[\],])|(\s+)|([^"{}[\],\s]+)/g);
  if (!tokens) return;

  for (const token of tokens) {
    if (/^\s+$/.test(token)) {
      cx += ctx.measureText(token).width;
      continue;
    }
    if (token.endsWith(":") && token.startsWith('"')) {
      ctx.fillStyle = C.blue;
    } else if (token.startsWith('"')) {
      ctx.fillStyle = C.green;
    } else if (/^[{}[\],]$/.test(token)) {
      ctx.fillStyle = C.text;
    } else {
      ctx.fillStyle = C.peach;
    }
    ctx.fillText(token, cx, y);
    cx += ctx.measureText(token).width;
  }
}
