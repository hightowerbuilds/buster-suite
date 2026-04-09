import { ctx, W, H } from '../../state/canvas-state';
import { C } from '../../constants/colors';
import { FONT_UI, FONT_CODE } from '../../constants/fonts';
import { PARTICLE_CHARS } from '../../constants/colors';
import { targets, animFrame, subtitleAlpha } from '../../state/particle-state';

export function drawHero() {
  const time = animFrame;

  ctx.font = `7px ${FONT_CODE}`;
  ctx.textBaseline = "middle";
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (!t.filled) continue;
    const ox = Math.sin(time * 0.008 + i) * 0.4;
    const oy = Math.cos(time * 0.006 + i * 0.7) * 0.4;
    if (t.alpha >= 1 && Math.random() < 0.003) {
      t.ch = PARTICLE_CHARS[Math.floor(Math.random() * PARTICLE_CHARS.length)];
    }
    ctx.globalAlpha = t.alpha;
    ctx.fillStyle = t.color;
    ctx.fillText(t.ch, t.x + ox, t.y + oy);
  }
  ctx.globalAlpha = 1;

  if (subtitleAlpha > 0) {
    const centerY = H / 2;
    const subY = centerY + Math.max(76, Math.floor(W * 0.24)) * 0.55;

    ctx.globalAlpha = subtitleAlpha;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";

    ctx.font = `16px ${FONT_UI}`;
    ctx.fillStyle = C.textDim;
    ctx.fillText("canvas-rendered ide", W / 2, subY);

    ctx.font = `13px ${FONT_UI}`;
    ctx.fillStyle = C.textMuted;
    ctx.fillText("11 MB.", W / 2, subY + 28);

    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }
}
