import { ctx, W } from '../../state/canvas-state';
import { C } from '../../constants/colors';
import { FONT_UI } from '../../constants/fonts';
import { sectionOffsets } from '../../state/scroll-state';
import { hoveredLink, pushClickable } from '../../state/interaction-state';
import { drawLine } from '../helpers';

export function drawFooter() {
  const y = sectionOffsets.footer + 40;

  ctx.textBaseline = "top";
  ctx.textAlign = "center";

  ctx.font = `12px ${FONT_UI}`;
  ctx.fillStyle = C.textMuted;
  ctx.fillText("buster.mom", W / 2, y);

  ctx.font = `11px ${FONT_UI}`;
  ctx.fillText("Built by Hightower Builds", W / 2, y + 20);

  ctx.font = `13px ${FONT_UI}`;
  ctx.fillStyle = C.blue;
  const ghText = "github.com/hightowerbuilds/buster";
  ctx.fillText(ghText, W / 2, y + 40);

  const ghW = ctx.measureText(ghText).width;
  pushClickable({
    x: W / 2 - ghW / 2, y: y + 40, w: ghW, h: 16,
    label: "github-footer",
    action: "link",
    url: "https://github.com/hightowerbuilds/buster",
  });

  const isHover = hoveredLink && hoveredLink.label === "github-footer";
  if (isHover) {
    drawLine(W / 2 - ghW / 2, y + 55, W / 2 + ghW / 2, y + 55, C.blue, 1);
  }

  ctx.textAlign = "left";
}
