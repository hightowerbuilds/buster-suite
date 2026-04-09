/**
 * Central store type for the Buster IDE.
 * Used with SolidJS createStore + createContext.
 */

import type { Tab } from "./tab-types";
import type { LayoutMode } from "../ui/LayoutPicker";
import type { SearchMatch, DiffHunk, AppSettings } from "./ipc";
import type { ThemePalette } from "./theme";

export type LspState = "inactive" | "starting" | "active" | "error";

export interface RecentFile {
  path: string;
  name: string;
}

export interface Diagnostic {
  line: number;
  col: number;
  endLine: number;
  endCol: number;
  severity: number;
  message: string;
}

export interface BusterStoreState {
  // ── Tabs ────────────────────────────────────────────────
  tabs: Tab[];
  activeTabId: string | null;
  fileTexts: Record<string, string>;
  scrollPositions: Record<string, number>;
  termPtyIds: Record<string, string>;
  terminalCounter: number;
  aiCounter: number;
  fileTabCounter: number;

  // ── Cursor ──────────────────────────────────────────────
  cursorLine: number;
  cursorCol: number;

  // ── UI toggles ─────────────────────────────────────────
  findVisible: boolean;
  paletteVisible: boolean;
  paletteInitialQuery: string;
  tourActive: boolean;
  branchPickerVisible: boolean;
  syncing: boolean;

  // ── Layout ──────────────────────────────────────────────
  layoutMode: LayoutMode;
  sidebarWidth: number;
  sidebarVisible: boolean;

  // ── Git ─────────────────────────────────────────────────
  gitBranchName: string | null;
  diffHunksMap: Record<string, DiffHunk[]>;

  // ── Dialogs ─────────────────────────────────────────────
  dirtyCloseTabId: string | null;
  dirtyCloseFileName: string;
  extChangeTabId: string | null;
  extChangeFileName: string;

  // ── Editor data ────────────────────────────────────────
  searchMatches: SearchMatch[];
  diagnosticsMap: Record<string, Diagnostic[]>;

  // ── Settings / theme ───────────────────────────────────
  settings: AppSettings;
  palette: ThemePalette;
  apiKey: string;
  apiKeyInsecure: boolean;

  // ── Workspace ──────────────────────────────────────────
  workspaceRoot: string | null;
  activeFilePath: string | null;

  // ── Misc ───────────────────────────────────────────────
  recentFiles: RecentFile[];
  tabTrapping: boolean;
  lspState: LspState;
  lspLanguages: string[];
}
