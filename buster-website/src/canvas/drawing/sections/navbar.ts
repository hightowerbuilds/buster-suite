import { ctx, W, NAV_HEIGHT } from '../../state/canvas-state';
import { C } from '../../constants/colors';
import { FONT_HERO, FONT_UI } from '../../constants/fonts';
import { hoveredLink, pushClickable } from '../../state/interaction-state';
import { drawLine } from '../helpers';

export function drawTopBar() {
  ctx.fillStyle = C.mantle;
  ctx.fillRect(0, 0, W, NAV_HEIGHT);
  drawLine(0, NAV_HEIGHT, W, NAV_HEIGHT, C.surface0, 1);

  ctx.textBaseline = "middle";
  const midY = NAV_HEIGHT / 2;

  ctx.font = `16px ${FONT_HERO}`;
  ctx.fillStyle = C.text;
  ctx.fillText("Buster", 16, midY);

  ctx.font = `13px ${FONT_UI}`;
  const navItems = [
    { label: "Features", action: "scroll", target: "features" },
    { label: "Extensions", action: "scroll", target: "extensions" },
    { label: "GitHub", action: "link", url: "https://github.com/hightowerbuilds/buster" },
  ];

  let rx = W - 16;
  for (let i = navItems.length - 1; i >= 0; i--) {
    const item = navItems[i];
    const tw = ctx.measureText(item.label).width;
    rx -= tw;

    const isHover = hoveredLink && hoveredLink.label === item.label;
    ctx.fillStyle = isHover ? C.blue : C.textDim;
    ctx.fillText(item.label, rx, midY);

    if (isHover) {
      drawLine(rx, midY + 8, rx + tw, midY + 8, C.blue, 1);
    }

    pushClickable({
      x: rx, y: 0, w: tw, h: NAV_HEIGHT,
      label: item.label,
      action: item.action,
      target: item.target,
      url: item.url,
      fixed: true,
    });

    rx -= 24;
  }
}
