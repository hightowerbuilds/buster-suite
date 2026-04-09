import { W, H, MAX_WIDTH } from './state/canvas-state';
import { FONT_UI } from './constants/fonts';
import { FEATURES, TECH_STACK, SHORTCUTS, HOST_API, TOML_CODE, JSON_CODE, GATEWAY_PROTOCOLS, CAPABILITIES_TABLE } from './constants/data';
import { sectionOffsets, setTotalContentHeight } from './state/scroll-state';
import { wrapText } from './drawing/helpers';

export function computeLayout() {
  const cw = Math.min(MAX_WIDTH, W - 40);
  let y = 0;

  sectionOffsets.hero = 0;
  y = H;

  sectionOffsets.features = y;
  y += 80;
  y += 28 + 10;
  y += 1 + 30;

  const featureFont = `14px ${FONT_UI}`;
  for (const f of FEATURES) {
    y += 18 + 8;
    const lines = wrapText(f.desc, cw, featureFont);
    y += lines.length * (14 * 1.6);
    y += 24;
  }

  y += 40;
  y += 18 + 16;
  y += (TECH_STACK.length + 1) * 28 + 20;
  y += 40;
  y += 18 + 16;
  y += SHORTCUTS.length * 24 + 20;
  y += 80;

  sectionOffsets.extensions = y;
  y += 80;
  y += 28 + 10;
  y += 1 + 30;

  const introText = "Buster extensions are WASM modules that run in a sandboxed Wasmtime runtime. Each extension declares the capabilities it needs in a TOML manifest. The host exposes functions for file I/O, command execution, notifications, and external service connections. Extensions are installed by copying their folder into the extensions directory.";
  const introLines = wrapText(introText, cw, `14px ${FONT_UI}`);
  y += introLines.length * (14 * 1.6) + 30;

  y += 18 + 16;
  const tomlLines = TOML_CODE.split("\n");
  y += 32 + tomlLines.length * (14 * 1.6) + 32 + 30;

  y += 18 + 16;
  for (const api of HOST_API) {
    y += 16 + 8;
    const apiLines = wrapText(api.desc, cw - 20, `14px ${FONT_UI}`);
    y += apiLines.length * (14 * 1.6);
    y += 20;
  }
  y += 10;

  const dangerLines = wrapText("Dangerous commands (rm -rf, sudo, etc.) are blocked by a shared safety blocklist.", cw, `14px ${FONT_UI}`);
  y += dangerLines.length * (14 * 1.6) + 30;

  y += 18 + 16;
  const gatewayIntro = "Extensions with the network capability can connect to external services via WebSocket or HTTP Server-Sent Events.";
  const gatewayIntroLines = wrapText(gatewayIntro, cw, `14px ${FONT_UI}`);
  y += gatewayIntroLines.length * (14 * 1.6) + 16;

  const jsonLines = JSON_CODE.split("\n");
  y += 32 + jsonLines.length * (14 * 1.6) + 32 + 20;

  y += 14 * 1.6 + 10;
  for (const gp of GATEWAY_PROTOCOLS) {
    const gpLines = wrapText(`${gp[0]}: ${gp[1]}`, cw - 20, `14px ${FONT_UI}`);
    y += gpLines.length * (14 * 1.6) + 4;
  }
  y += 30;

  y += 18 + 16;
  y += (CAPABILITIES_TABLE.length + 1) * 28 + 20;
  y += 80;

  sectionOffsets.footer = y;
  y += 12 + 16 + 11 + 12 + 13 + 40 + 40;

  setTotalContentHeight(y);
}
