import { createSignal } from "solid-js";
import type { AppSettings } from "./ipc";
import { loadSettings as loadSettingsIpc, saveSettings as saveSettingsIpc, loadApiKey as loadApiKeyIpc, storeApiKey as storeApiKeyIpc } from "./ipc";
import { type ThemePalette, CATPPUCCIN, LIGHT_THEME, generatePalette, applyPaletteToCss, clearCssOverrides } from "./theme";

// --- Settings ---

const DEFAULT_SETTINGS: AppSettings = {
  word_wrap: true,
  font_size: 14,
  tab_size: 4,
  minimap: false,
  line_numbers: true,
  cursor_blink: true,
  autocomplete: true,
  ui_zoom: 100,
  recent_folders: [],
  theme_mode: "dark",
  theme_hue: -1,
  effect_cursor_glow: 0,
  effect_vignette: 0,
  effect_grain: 0,
  agent_max_tool_calls: 50,
  agent_max_writes: 10,
  agent_max_commands: 5,
  agent_timeout_secs: 300,
};

const [settings, setSettingsRaw] = createSignal<AppSettings>(DEFAULT_SETTINGS);
const [palette, setPalette] = createSignal<ThemePalette>(CATPPUCCIN);

export { settings, palette };

// Raw setters for BusterProvider bridge sync (temporary — removed when consumers migrate)
export { setSettingsRaw as _setSettingsRaw, setPalette as _setPalette };

// --- Theme integration ---

function rebuildPalette(s: AppSettings) {
  const fx = {
    bgGlow: 0,
    cursorGlow: s.effect_cursor_glow ?? 0,
    vignette: s.effect_vignette ?? 0,
    grain: s.effect_grain ?? 0,
  };

  const mode = s.theme_mode || "dark";

  if (mode === "custom" && s.theme_hue >= 0) {
    const p = generatePalette(s.theme_hue, fx);
    setPalette(p);
    applyPaletteToCss(p);
  } else if (mode === "light") {
    const p = { ...LIGHT_THEME, ...fx };
    setPalette(p);
    applyPaletteToCss(p);
  } else {
    // dark (Catppuccin Mocha) + effects
    setPalette({ ...CATPPUCCIN, ...fx });
    clearCssOverrides();
  }
}

export function updateSettings(newSettings: AppSettings) {
  setSettingsRaw(newSettings);
  saveSettingsIpc(newSettings).catch((e) => console.warn("Failed to save settings:", e));
  document.documentElement.style.fontSize = `${newSettings.ui_zoom}%`;
  rebuildPalette(newSettings);
}

export async function initSettings() {
  try {
    const s = await loadSettingsIpc();
    setSettingsRaw(s);
    document.documentElement.style.fontSize = `${s.ui_zoom}%`;
    rebuildPalette(s);
  } catch (e) { console.warn("Failed to load settings:", e); }
}

// --- API Key ---

const [apiKey, setApiKeyRaw] = createSignal("");
export { apiKey };
export { setApiKeyRaw as _setApiKeyRaw };

export async function initApiKey() {
  // Try keyring first
  try {
    const stored = await loadApiKeyIpc();
    if (stored) {
      setApiKeyRaw(stored);
      console.log("[api-key] loaded from keyring");
      return;
    }
  } catch (e) {
    console.warn("[api-key] keyring load failed:", e);
  }

  // Try localStorage fallback
  const legacy = localStorage.getItem("buster-ai-key");
  if (legacy) {
    setApiKeyRaw(legacy);
    console.log("[api-key] loaded from localStorage");
    // Attempt to migrate to keyring
    try {
      await storeApiKeyIpc(legacy);
      localStorage.removeItem("buster-ai-key");
      console.log("[api-key] migrated to keyring");
    } catch {
      // keep in localStorage
    }
  }
}

export async function saveApiKey(key: string) {
  setApiKeyRaw(key);

  // Try keyring
  try {
    await storeApiKeyIpc(key);
    console.log("[api-key] saved to keyring");
    // Clear localStorage if keyring succeeded
    localStorage.removeItem("buster-ai-key");
    return;
  } catch (e) {
    console.warn("[api-key] keyring save failed:", e);
  }

  // Fallback to localStorage
  localStorage.setItem("buster-ai-key", key);
  console.log("[api-key] saved to localStorage (keyring unavailable)");
}

// --- Workspace ---

const [workspaceRoot, setWorkspaceRoot] = createSignal<string | null>(null);
export { workspaceRoot, setWorkspaceRoot };

// --- Active file ---

const [activeFilePath, setActiveFilePath] = createSignal<string | null>(null);
export { activeFilePath, setActiveFilePath };

// --- Recently opened files ---

const MAX_RECENT_FILES = 20;
const RECENT_FILES_KEY = "buster-recent-files";

export interface RecentFile {
  path: string;
  name: string;
}

const [recentFiles, setRecentFilesRaw] = createSignal<RecentFile[]>(
  JSON.parse(localStorage.getItem(RECENT_FILES_KEY) || "[]")
);
export { recentFiles };

export function addRecentFile(path: string, name: string) {
  setRecentFilesRaw(prev => {
    const filtered = prev.filter(f => f.path !== path);
    const next = [{ path, name }, ...filtered].slice(0, MAX_RECENT_FILES);
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(next));
    return next;
  });
}

// --- Tab trapping (Ctrl+M toggle) ---

const [tabTrapping, setTabTrapping] = createSignal(true);
export { tabTrapping, setTabTrapping };

// --- LSP state ---

export type LspState = "inactive" | "starting" | "active" | "error";
const [lspState, setLspState] = createSignal<LspState>("inactive");
const [lspLanguages, setLspLanguages] = createSignal<string[]>([]);
export { lspState, setLspState, lspLanguages, setLspLanguages };

// Raw setters for BusterProvider bridge (temporary)
export {
  setWorkspaceRoot as _setWorkspaceRoot,
  setActiveFilePath as _setActiveFilePath,
  setRecentFilesRaw as _setRecentFiles,
  setTabTrapping as _setTabTrapping,
  setLspState as _setLspState,
  setLspLanguages as _setLspLanguages,
};
