import { ctx, W, H } from '../../state/canvas-state';
import { C } from '../../constants/colors';
import { FONT_CODE } from '../../constants/fonts';
import { rainDrops, animFrame } from '../../state/particle-state';

export function drawRain() {
  const time = animFrame;

  const scanY = (time * 2) % H;
  ctx.fillStyle = C.text;
  ctx.globalAlpha = 0.008;
  ctx.fillRect(0, scanY, W, 1);
  ctx.globalAlpha = 1;

  ctx.font = `7px ${FONT_CODE}`;
  ctx.textBaseline = "middle";
  for (const r of rainDrops) {
    if (r.captured) continue;
    ctx.globalAlpha = r.alpha;
    ctx.fillStyle = r.color;
    ctx.fillText(r.ch, r.x, r.y);
  }
  ctx.globalAlpha = 1;
}
