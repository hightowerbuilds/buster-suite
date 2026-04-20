/**
 * Extracted action implementations for the Buster IDE.
 *
 * All actions are created via createBusterActions(deps) which provides
 * dependency injection for store, setStore, engines, and IPC functions.
 * This enables testing without a full store/provider setup.
 */

import { produce } from "solid-js/store";
import type { SetStoreFunction } from "solid-js/store";
import type { BusterStoreState } from "./store-types";
import type { EngineMap, BusterActions } from "./buster-context";
import type { Tab } from "./tab-types";
import type { EditorEngine } from "../editor/engine";
import type { DirtyCloseResult } from "../ui/DirtyCloseDialog";
import type { ExternalChangeResult } from "../ui/ExternalChangeDialog";
import type { SessionSnapshot } from "./session";
import type { AppSettings } from "./ipc";
import type { ThemePalette } from "./theme";
import { basename, extname } from "buster-path";
import { isImageFile } from "./tab-types";
import { showError, showSuccess, showInfo, logWarn } from "./notify";
import { autoDemotePanelCount } from "./panel-count";
import { setRefreshDir } from "../ui/SidebarTree";
import { persistSession } from "./session";

import {
  readFile, writeFile, watchFile, unwatchFile, addRecentFolder,
  gitBranch as fetchGitBranch, gitIsRepo, gitDiffHunks,
  lspStart, lspDidSave, lspStatus, lspStop, terminalKill,
  largeFileOpen, largeFileReadLines,
  largeFileClose, loadSettings as loadSettingsIpc, saveSettings as saveSettingsIpc,
  setTerminalTheme as setTerminalThemeIpc, extUnload,
  browserModuleClose,
} from "./ipc";

import {
  CATPPUCCIN, LIGHT_THEME, generatePalette, importVSCodeTheme,
  applyPaletteToCss, clearCssOverrides, paletteToTerminalColors,
} from "./theme";

// ── Deps interface ────────────────────────────────────────────────

export interface ActionDeps {
  store: BusterStoreState;
  setStore: SetStoreFunction<BusterStoreState>;
  engines: EngineMap;
  /** Mutable ref for external change disk content (set by file watcher) */
  extChangeDiskContent: { value: string };
}

// ── Constants ─────────────────────────────────────────────────────

const RECENT_FILES_KEY = "buster-recent-files";
const MAX_RECENT_FILES = 20;
const EXT_TO_LANG: Record<string, string> = {
  rs: "rust", ts: "typescript", tsx: "typescriptreact",
  js: "javascript", jsx: "javascriptreact", py: "python", go: "go",
};

// ── Factory ───────────────────────────────────────────────────────

export function createBusterActions(deps: ActionDeps): BusterActions & {
  initSettings: () => Promise<void>;
  rebuildPalette: (s: AppSettings) => void;
  attemptLspStart: (filePath: string, workspaceRoot: string) => void;
  doTabClose: (tabId: string) => void;
} {
  const { store, setStore, engines } = deps;

  // ── Theme ─────────────────────────────────────────────────

  function rebuildPalette(s: AppSettings) {
    const fx = {
      bgGlow: 0,
      cursorGlow: s.effect_cursor_glow ?? 0,
      vignette: s.effect_vignette ?? 0,
      grain: s.effect_grain ?? 0,
    };
    const mode = s.theme_mode || "dark";
    let p: ThemePalette;

    if (mode === "imported") {
      try {
        const raw = localStorage.getItem("buster-imported-theme");
        if (raw) {
          p = importVSCodeTheme(JSON.parse(raw), fx);
          setStore("palette", p);
          applyPaletteToCss(p);
        } else {
          p = { ...CATPPUCCIN, ...fx };
          setStore("palette", p);
          clearCssOverrides();
        }
      } catch {
        p = { ...CATPPUCCIN, ...fx };
        setStore("palette", p);
        clearCssOverrides();
      }
    } else if (mode === "custom" && s.theme_hue >= 0) {
      p = generatePalette(s.theme_hue, fx);
      setStore("palette", p);
      applyPaletteToCss(p);
    } else if (mode === "light") {
      p = { ...LIGHT_THEME, ...fx };
      setStore("palette", p);
      applyPaletteToCss(p);
    } else {
      p = { ...CATPPUCCIN, ...fx };
      setStore("palette", p);
      clearCssOverrides();
    }

    setTerminalThemeIpc(paletteToTerminalColors(p!)).catch((e) =>
      console.warn("Failed to sync terminal theme:", e),
    );
  }

  // ── Settings ──────────────────────────────────────────────

  function updateSettings(newSettings: AppSettings) {
    setStore("settings", newSettings);
    saveSettingsIpc(newSettings).catch(() => showError("Failed to save settings"));
    document.documentElement.style.fontSize = `${newSettings.ui_zoom}%`;
    rebuildPalette(newSettings);
  }

  async function initSettings() {
    try {
      const s = await loadSettingsIpc();
      setStore("settings", s);
      document.documentElement.style.fontSize = `${s.ui_zoom}%`;
      rebuildPalette(s);
    } catch (e) { console.warn("Failed to load settings:", e); }
  }

  function addRecentFile(path: string, name: string) {
    const filtered = store.recentFiles.filter(f => f.path !== path);
    const next = [{ path, name }, ...filtered].slice(0, MAX_RECENT_FILES);
    setStore("recentFiles", next);
    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(next));
  }

  // ── Git ───────────────────────────────────────────────────

  async function refreshGitBranch(root: string) {
    try {
      const isRepo = await gitIsRepo(root);
      if (isRepo) { setStore("gitBranchName", await fetchGitBranch(root)); }
      else { setStore("gitBranchName", null); }
    } catch { setStore("gitBranchName", null); }
  }

  async function fetchDiffHunks(tabId: string, filePath: string) {
    const root = store.workspaceRoot;
    if (!root) return;
    try {
      const relPath = filePath.startsWith(root) ? filePath.slice(root.length + 1) : filePath;
      const hunks = await gitDiffHunks(root, relPath);
      setStore("diffHunksMap", tabId, hunks);
    } catch {
      setStore("diffHunksMap", tabId, []);
    }
  }

  // ── Workspace ─────────────────────────────────────────────

  function rememberWorkspace(path: string) {
    addRecentFolder(path)
      .then(s => updateSettings(s))
      .catch(e => console.warn("Failed to save recent folder:", e));
  }

  function openWorkspace(path: string) {
    setStore("sidebarVisible", true);
    setStore("sidebarWidth", (width) => Math.max(width, 275));
    setStore("workspaceRoot", path);
    rememberWorkspace(path);
    refreshGitBranch(path);
  }

  async function changeDirectory() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true });
    if (selected) openWorkspace(selected as string);
  }

  function closeDirectory() {
    setStore("workspaceRoot", null);
    setStore("gitBranchName", null);
    const fileTabs = store.tabs.filter(t => t.type === "file");
    for (const t of fileTabs) {
      setStore("fileTexts", produce(ft => { delete ft[t.id]; }));
      engines.delete(t.id);
      unwatchFile(t.path).catch(() => {});
    }
    const remaining = store.tabs.filter(t => t.type !== "file");
    setStore("tabs", remaining);
    if (remaining.length === 0) setStore("activeTabId", null);
  }

  // ── File loading ──────────────────────────────────────────

  async function loadFileContent(path: string): Promise<{ content: string; fileName: string; filePath: string }> {
    try {
      const file = await readFile(path);
      return { content: file.content, fileName: file.file_name, filePath: file.path };
    } catch {
      const lineCount = await largeFileOpen(path);
      const chunks: string[] = [];
      const chunkSize = 5000;
      for (let start = 0; start < lineCount; start += chunkSize) {
        const lines = await largeFileReadLines(path, start, chunkSize);
        chunks.push(...lines);
      }
      const content = chunks.join("\n");
      const fileName = basename(path);
      largeFileClose(path).catch(() => {});
      return { content, fileName, filePath: path };
    }
  }

  // ── File tabs ─────────────────────────────────────────────

  async function handleFileSelect(path: string) {
    const existing = store.tabs.find(t => t.path === path && (t.type === "file" || t.type === "image"));
    if (existing) { switchToTab(existing.id); return; }

    if (isImageFile(path)) {
      setStore("fileTabCounter", c => c + 1);
      const tabId = `file_${store.fileTabCounter}`;
      const fileName = basename(path);
      const newTab: Tab = { id: tabId, name: fileName, path, dirty: false, type: "image" };
      setStore("tabs", [...store.tabs, newTab]);
      switchToTab(tabId);
      addRecentFile(path, fileName);
      return;
    }

    setStore("fileLoading", true);
    try {
      const { content, fileName, filePath } = await loadFileContent(path);
      setStore("fileTabCounter", c => c + 1);
      const tabId = `file_${store.fileTabCounter}`;
      const newTab: Tab = { id: tabId, name: fileName, path: filePath, dirty: false, type: "file" };

      setStore("fileTexts", tabId, content);
      setStore("tabs", [...store.tabs, newTab]);
      switchToTab(tabId);
      addRecentFile(filePath, fileName);

      watchFile(filePath).catch(() => showError("File watcher failed — external changes may be missed"));
      fetchDiffHunks(tabId, filePath);

      if (store.workspaceRoot) {
        attemptLspStart(filePath, store.workspaceRoot);
      }
    } catch {
      showError("Failed to open file");
    }
    setStore("fileLoading", false);
  }

  // ── LSP lifecycle ─────────────────────────────────────────

  let lspFailCount = 0;
  const LSP_MAX_RETRIES = 3;
  const LSP_BACKOFF_BASE = 2000;

  function attemptLspStart(filePath: string, workspaceRoot: string) {
    if (store.lspState === "crashed") return;
    setStore("lspState", "starting");
    lspStart(filePath, workspaceRoot)
      .then(() => {
        lspFailCount = 0;
        setStore("lspState", "active");
        lspStatus().then(langs => setStore("lspLanguages", langs)).catch(() => {});
      })
      .catch(() => {
        lspFailCount++;
        if (lspFailCount >= LSP_MAX_RETRIES) {
          setStore("lspState", "crashed");
          showError(`Language server crashed after ${LSP_MAX_RETRIES} attempts — click LSP in status bar to restart`);
        } else {
          const delay = LSP_BACKOFF_BASE * Math.pow(2, lspFailCount - 1);
          logWarn(`LSP failed (attempt ${lspFailCount}/${LSP_MAX_RETRIES}), retrying in ${delay / 1000}s`);
          setStore("lspState", "error");
          setTimeout(() => attemptLspStart(filePath, workspaceRoot), delay);
        }
      });
  }

  function restartLsp() {
    lspFailCount = 0;
    setStore("lspState", "inactive");
    const fileTab = store.tabs.find(t => t.type === "file" && t.path);
    if (fileTab && store.workspaceRoot) {
      attemptLspStart(fileTab.path, store.workspaceRoot);
    }
  }

  // ── Tab creation ──────────────────────────────────────────

  function createTerminalTab() {
    setStore("terminalCounter", c => c + 1);
    const tabId = `term_tab_${store.terminalCounter}`;
    const newTab: Tab = { id: tabId, name: `Terminal ${store.terminalCounter}`, path: "", dirty: false, type: "terminal" };
    setStore("tabs", [...store.tabs, newTab]);
    switchToTab(tabId);
  }

  function openSingletonTab(type: Exclude<Tab["type"], "file" | "terminal">, id: string, name: string) {
    const existing = store.tabs.find(t => t.type === type);
    if (existing) { switchToTab(existing.id); return; }
    const newTab: Tab = { id, name, path: "", dirty: false, type };
    setStore("tabs", [...store.tabs, newTab]);
    switchToTab(id);
  }

  function createGitTab() { openSingletonTab("git", "git_tab", "Git"); }
  function createSettingsTab() { openSingletonTab("settings", "settings_tab", "Settings"); }
  function createExtensionsTab() { openSingletonTab("extensions", "extensions_tab", "Extensions"); }
  function createDebugTab() { openSingletonTab("debug", "debug_tab", "Debug"); }
  function createProblemsTab() { openSingletonTab("problems", "problems_tab", "Problems"); }
  function createConsoleTab() { openSingletonTab("console", "console_tab", "Console"); }

  function createBrowserTab(url?: string) {
    const tabId = `browser_tab_${Date.now()}`;
    const newTab: Tab = { id: tabId, name: "Browser", path: url || "", dirty: false, type: "browser" };
    setStore("tabs", [...store.tabs, newTab]);
    switchToTab(tabId);
  }

  function popOutSidebar() {
    setStore("sidebarVisible", false);
    openSingletonTab("explorer", "explorer_tab", "Explorer");
  }

  function handleTermIdReady(tabId: string, ptyId: string) {
    setStore("termPtyIds", tabId, ptyId);
  }

  function handleTermTitleChange(tabId: string, title: string) {
    const idx = store.tabs.findIndex(t => t.id === tabId);
    if (idx >= 0) setStore("tabs", idx, "name", title);
  }

  // ── Tab management ────────────────────────────────────────

  function switchToTab(tabId: string) {
    const tab = store.tabs.find(t => t.id === tabId);
    setStore("activeTabId", tabId);
    if (tab?.type === "file") {
      const engine = engines.get(tabId);
      const cursor = engine?.cursor();
      setStore("cursorLine", cursor?.line ?? 0);
      setStore("cursorCol", cursor?.col ?? 0);
    } else {
      setStore("cursorLine", 0);
      setStore("cursorCol", 0);
    }
  }

  function getExtFromPath(path: string): string | null {
    const ext = extname(path);
    return ext ? ext.slice(1).toLowerCase() : null;
  }

  function handleTabClose(tabId: string) {
    const tab = store.tabs.find(t => t.id === tabId);
    if (!tab) return;
    if (tab.type === "file" && tab.dirty) {
      setStore("dirtyCloseTabId", tabId);
      setStore("dirtyCloseFileName", tab.name);
      return;
    }
    doTabClose(tabId);
  }

  function handleExternalChangeResult(result: ExternalChangeResult) {
    const tabId = store.extChangeTabId;
    setStore("extChangeTabId", null);
    if (!tabId) return;
    if (result === "load-disk") {
      const engine = engines.get(tabId);
      if (engine) {
        engine.loadText(deps.extChangeDiskContent.value);
        setStore("tabs", store.tabs.map(t => t.id === tabId ? { ...t, dirty: false } : t));
        showInfo("Loaded from disk");
      }
    }
  }

  async function handleDirtyCloseResult(result: DirtyCloseResult) {
    const tabId = store.dirtyCloseTabId;
    setStore("dirtyCloseTabId", null);
    if (!tabId) return;
    if (result === "cancel") return;
    if (result === "save") {
      const tab = store.tabs.find(t => t.id === tabId);
      const engine = engines.get(tabId);
      if (tab && engine) {
        await writeFile(tab.path, engine.getText());
        engine.markClean();
        setStore("tabs", store.tabs.map(t => t.id === tabId ? { ...t, dirty: false } : t));
      }
    }
    doTabClose(tabId);
  }

  function doTabClose(tabId: string) {
    const tab = store.tabs.find(t => t.id === tabId);
    if (!tab) return;

    if (tab.type === "explorer") setStore("sidebarVisible", true);
    if (tab.type === "browser") browserModuleClose().catch(() => {});
    if (tab.type === "surface") {
      try {
        const meta = JSON.parse(tab.path || "{}");
        if (meta.extension_id) extUnload(meta.extension_id).catch(() => {});
      } catch { console.warn("Failed to parse surface tab metadata"); }
    }

    if (tab.type === "file") {
      setStore("fileTexts", produce(ft => { delete ft[tabId]; }));
      const engine = engines.get(tabId);
      if (engine) engine.dispose();
      engines.delete(tabId);
      unwatchFile(tab.path).catch(() => {});
      setStore("diffHunksMap", produce(dm => { delete dm[tabId]; }));

      const ext = getExtFromPath(tab.path);
      const lang = ext ? EXT_TO_LANG[ext] : null;
      if (lang) {
        const remaining = store.tabs.filter(t => t.id !== tabId && t.type === "file" && getExtFromPath(t.path) === ext);
        if (remaining.length === 0) {
          lspStop(lang).catch(e => console.warn("LSP stop failed:", e));
          lspStatus().then(langs => setStore("lspLanguages", langs)).catch(() => {});
          if (store.lspLanguages.length <= 1) setStore("lspState", "inactive");
        }
      }
    }

    const ptyId = store.termPtyIds[tabId];
    if (ptyId) terminalKill(ptyId).catch(e => console.warn("Terminal kill failed:", e));
    setStore("termPtyIds", produce(tp => { delete tp[tabId]; }));

    const newTabs = store.tabs.filter(t => t.id !== tabId);
    setStore("tabs", newTabs);
    setStore("panelCount", autoDemotePanelCount(store.panelCount, newTabs.length));

    if (store.activeTabId === tabId) {
      if (newTabs.length > 0) switchToTab(newTabs[newTabs.length - 1].id);
      else setStore("activeTabId", null);
    }
  }

  // ── Save / Sync ───────────────────────────────────────────

  async function handleSave() {
    const tab = activeTab();
    if (!tab || tab.type !== "file") return;
    const engine = engines.get(tab.id);
    if (!engine) return;
    try {
      const lines = engine.lines();
      const trimmed = lines.map(l => l.trimEnd());
      const needsTrim = lines.some((l, i) => l !== trimmed[i]);
      if (needsTrim) {
        const cursor = engine.cursor();
        engine.loadText(trimmed.join("\n"));
        engine.setCursor({ line: cursor.line, col: Math.min(cursor.col, trimmed[cursor.line]?.length ?? 0) });
      }
      const text = engine.getText();
      await writeFile(tab.path, text);
      engine.markClean();
      lspDidSave(tab.path).catch(e => console.warn("LSP didSave failed:", e));
      setStore("tabs", store.tabs.map(t => t.id === tab.id ? { ...t, dirty: false } : t));
      fetchDiffHunks(tab.id, tab.path);
      showSuccess("Saved");
    } catch { showError("Failed to save"); }
  }

  async function handleSync() {
    if (store.syncing) return;
    setStore("syncing", true);
    try {
      const root = store.workspaceRoot;
      if (root) await refreshGitBranch(root);
      if (root) setRefreshDir(root);

      for (const tab of store.tabs) {
        if (tab.type !== "file" || !tab.path) continue;
        const engine = engines.get(tab.id);
        if (!engine || engine.dirty()) continue;
        try {
          const { content } = await loadFileContent(tab.path);
          if (content !== engine.getText()) engine.loadText(content);
        } catch {
          showError(`Failed to sync ${tab.name}`);
        }
        fetchDiffHunks(tab.id, tab.path);
      }
      showSuccess("Synced");
    } catch { showError("Sync failed"); }
    finally { setStore("syncing", false); }
  }

  // ── Derived accessors ─────────────────────────────────────

  function activeTab(): Tab | undefined {
    return store.tabs.find(t => t.id === store.activeTabId);
  }

  function activeEngine(): EditorEngine | null {
    const tab = activeTab();
    return tab?.type === "file" ? (engines.get(tab.id) ?? null) : null;
  }

  function getFileTextForTab(tabId: string): string | null {
    return store.fileTexts[tabId] ?? null;
  }

  // ── Diagnostics ───────────────────────────────────────────

  function diagnosticCounts() {
    let errors = 0, warnings = 0;
    for (const key of Object.keys(store.diagnosticsMap)) {
      const diags = store.diagnosticsMap[key];
      if (!diags) continue;
      for (const d of diags) {
        if (d.severity === 1) errors++;
        else if (d.severity === 2) warnings++;
      }
    }
    return { errors, warnings };
  }

  function allDiagnosticsSorted() {
    const all: { file: string; line: number; col: number; severity: number; message: string }[] = [];
    for (const [file, diags] of Object.entries(store.diagnosticsMap)) {
      for (const d of diags) {
        all.push({ file, line: d.line, col: d.col, severity: d.severity, message: d.message });
      }
    }
    all.sort((a, b) => a.file !== b.file ? a.file.localeCompare(b.file) : a.line !== b.line ? a.line - b.line : a.col - b.col);
    return all;
  }

  async function jumpToDiagnostic(direction: 1 | -1) {
    const all = allDiagnosticsSorted();
    if (all.length === 0) return;
    const fp = store.activeFilePath;
    const curLine = activeEngine()?.cursor().line ?? 0;
    const curCol = activeEngine()?.cursor().col ?? 0;

    let idx = -1;
    if (direction === 1) {
      idx = all.findIndex(d => d.file === fp
        ? (d.line > curLine || (d.line === curLine && d.col > curCol))
        : d.file > (fp ?? ""));
    } else {
      for (let i = all.length - 1; i >= 0; i--) {
        const d = all[i];
        if (d.file === fp
          ? (d.line < curLine || (d.line === curLine && d.col < curCol))
          : d.file < (fp ?? "")) { idx = i; break; }
      }
    }
    if (idx === -1) idx = direction === 1 ? 0 : all.length - 1;

    const target = all[idx];
    if (target.file !== fp) await handleFileSelect(target.file);
    const eng = activeEngine() ?? (() => {
      const tab = store.tabs.find(t => t.path === target.file);
      return tab ? engines.get(tab.id) : undefined;
    })();
    eng?.setCursor({ line: target.line, col: target.col });
  }

  // ── Session ───────────────────────────────────────────────

  function buildSnapshot(): SessionSnapshot {
    return {
      workspaceRoot: store.workspaceRoot,
      activeTabId: store.activeTabId,
      panelCount: store.panelCount,
      sidebarVisible: store.sidebarVisible,
      sidebarWidth: store.sidebarWidth,
      tabs: [...store.tabs],
      engines: engines.map,
      scrollPositions: new Map(Object.entries(store.scrollPositions)),
    };
  }

  async function saveSessionNow() {
    try { await persistSession(buildSnapshot()); }
    catch (e) { console.warn("Session save failed:", e); }
  }

  // ── Return all actions ────────────────────────────────────

  return {
    // BusterActions interface
    handleFileSelect,
    handleSave,
    handleSync,
    loadFileContent,
    switchToTab,
    handleTabClose,
    createTerminalTab,
    createGitTab,
    createSettingsTab,
    createExtensionsTab,
    createDebugTab,
    createProblemsTab,
    createBrowserTab,
    createConsoleTab,
    popOutSidebar,
    handleTermIdReady,
    handleTermTitleChange,
    openWorkspace,
    changeDirectory,
    closeDirectory,
    refreshGitBranch,
    handleDirtyCloseResult,
    handleExternalChangeResult,
    activeTab,
    activeEngine,
    getFileTextForTab,
    updateSettings,
    addRecentFile,
    jumpToDiagnostic,
    diagnosticCounts,
    restartLsp,
    fetchDiffHunks,
    buildSnapshot,
    saveSessionNow,
    // Internal actions exposed for BusterProvider wiring
    initSettings,
    rebuildPalette,
    attemptLspStart,
    doTabClose,
  };
}
