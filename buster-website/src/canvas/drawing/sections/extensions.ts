import { ctx, W, MAX_WIDTH, contentX } from '../../state/canvas-state';
import { C } from '../../constants/colors';
import { FONT_UI, FONT_CODE } from '../../constants/fonts';
import { HOST_API, TOML_CODE, JSON_CODE, GATEWAY_PROTOCOLS, CAPABILITIES_TABLE } from '../../constants/data';
import { sectionOffsets } from '../../state/scroll-state';
import { drawLine, drawTable, roundRect, wrapText } from '../helpers';
import { drawTomlLine, drawJsonLine } from '../syntax';

export function drawExtensions() {
  const cx = contentX();
  const cw = Math.min(MAX_WIDTH, W - 40);
  let y = sectionOffsets.extensions + 80;

  ctx.font = `28px ${FONT_UI}`;
  ctx.fillStyle = C.text;
  ctx.textBaseline = "top";
  ctx.fillText("Building Extensions", cx, y);
  y += 28 + 10;

  drawLine(cx, y, cx + cw, y, C.surface0, 1);
  y += 30;

  const introText = "Buster extensions are WASM modules that run in a sandboxed Wasmtime runtime. Each extension declares the capabilities it needs in a TOML manifest. The host exposes functions for file I/O, command execution, notifications, and external service connections. Extensions are installed by copying their folder into the extensions directory.";
  ctx.font = `14px ${FONT_UI}`;
  ctx.fillStyle = C.textDim;
  const introLines = wrapText(introText, cw, `14px ${FONT_UI}`);
  for (const line of introLines) {
    ctx.fillText(line, cx, y);
    y += 14 * 1.6;
  }
  y += 30;

  ctx.font = `18px ${FONT_UI}`;
  ctx.fillStyle = C.text;
  ctx.fillText("Extension Manifest", cx, y);
  y += 18 + 16;

  const tomlLines = TOML_CODE.split("\n");
  const codeBlockH = 32 + tomlLines.length * (14 * 1.6) + 32;
  ctx.fillStyle = C.surface0;
  roundRect(cx, y, cw, codeBlockH, 6);
  ctx.fill();

  const codeX = cx + 16;
  let codeY = y + 16;
  for (const line of tomlLines) {
    drawTomlLine(line, codeX, codeY);
    codeY += 14 * 1.6;
  }
  y += codeBlockH + 30;

  ctx.font = `18px ${FONT_UI}`;
  ctx.fillStyle = C.text;
  ctx.fillText("Host API Reference", cx, y);
  y += 18 + 16;

  for (const api of HOST_API) {
    ctx.font = `16px ${FONT_CODE}`;
    ctx.fillStyle = C.blue;
    ctx.textBaseline = "top";
    ctx.fillText(api.sig, cx, y);
    y += 16 + 8;

    ctx.font = `14px ${FONT_UI}`;
    ctx.fillStyle = C.textDim;
    const apiLines = wrapText(api.desc, cw - 20, `14px ${FONT_UI}`);
    for (const line of apiLines) {
      ctx.fillText(line, cx + 10, y);
      y += 14 * 1.6;
    }
    y += 20;
  }

  ctx.font = `14px ${FONT_UI}`;
  ctx.fillStyle = C.textMuted;
  const dangerLines = wrapText("Dangerous commands (rm -rf, sudo, etc.) are blocked by a shared safety blocklist.", cw, `14px ${FONT_UI}`);
  for (const line of dangerLines) {
    ctx.fillText(line, cx, y);
    y += 14 * 1.6;
  }
  y += 30;

  ctx.font = `18px ${FONT_UI}`;
  ctx.fillStyle = C.text;
  ctx.fillText("Gateway Connections", cx, y);
  y += 18 + 16;

  ctx.font = `14px ${FONT_UI}`;
  ctx.fillStyle = C.textDim;
  const gatewayIntro = "Extensions with the network capability can connect to external services via WebSocket or HTTP Server-Sent Events.";
  const gatewayIntroLines = wrapText(gatewayIntro, cw, `14px ${FONT_UI}`);
  for (const line of gatewayIntroLines) {
    ctx.fillText(line, cx, y);
    y += 14 * 1.6;
  }
  y += 16;

  const jsonLines = JSON_CODE.split("\n");
  const jsonBlockH = 32 + jsonLines.length * (14 * 1.6) + 32;
  ctx.fillStyle = C.surface0;
  roundRect(cx, y, cw, jsonBlockH, 6);
  ctx.fill();

  let jsonY = y + 16;
  for (const line of jsonLines) {
    drawJsonLine(line, cx + 16, jsonY);
    jsonY += 14 * 1.6;
  }
  y += jsonBlockH + 20;

  ctx.font = `14px ${FONT_UI}`;
  ctx.fillStyle = C.textDim;
  ctx.fillText("The gateway supports three message protocols:", cx, y);
  y += 14 * 1.6 + 10;

  for (const [name, example] of GATEWAY_PROTOCOLS) {
    ctx.fillStyle = C.pink;
    ctx.fillText(name + ": ", cx + 10, y);
    const nameW = ctx.measureText(name + ": ").width;
    ctx.fillStyle = C.textMuted;
    ctx.font = `14px ${FONT_CODE}`;
    ctx.fillText(example, cx + 10 + nameW, y);
    ctx.font = `14px ${FONT_UI}`;
    y += 14 * 1.6 + 4;
  }
  y += 30;

  ctx.font = `18px ${FONT_UI}`;
  ctx.fillStyle = C.text;
  ctx.fillText("Capabilities Summary", cx, y);
  y += 18 + 16;

  drawTable(cx, y, ["Capability", "What it grants"], CAPABILITIES_TABLE, cw);
}
