import {
  saveSession as saveSessionIpc,
  loadSession as loadSessionIpc,
  saveBackupBuffer,
  loadBackupBuffer,
  deleteBackupBuffer,
  confirmAppClose,
  type SessionState,
  type SessionTab,
} from "./ipc";
import type { Tab } from "./tab-types";

export type { SessionState, SessionTab };

export interface SessionSnapshot {
  workspaceRoot: string | null;
  activeTabId: string | null;
  layoutMode: string;
  sidebarVisible: boolean;
  sidebarWidth: number;
  tabs: Tab[];
  engines: Map<string, { getText: () => string; cursor: () => { line: number; col: number } }>;
  scrollPositions: Map<string, number>;
}

/** Build a SessionState from the current app state for persistence. */
export function buildSessionState(snap: SessionSnapshot): SessionState {
  const sessionTabs: SessionTab[] = snap.tabs.map((tab) => ({
    id: tab.id,
    type: tab.type,
    name: tab.name,
    path: tab.path,
    dirty: tab.dirty,
    cursor_line: snap.engines.get(tab.id)?.cursor().line ?? 0,
    cursor_col: snap.engines.get(tab.id)?.cursor().col ?? 0,
    scroll_top: snap.scrollPositions.get(tab.id) ?? 0,
    backup_key: null, // Set after backup write
  }));

  return {
    version: 1,
    workspace_root: snap.workspaceRoot,
    active_tab_id: snap.activeTabId,
    layout_mode: snap.layoutMode,
    sidebar_visible: snap.sidebarVisible,
    sidebar_width: snap.sidebarWidth,
    tabs: sessionTabs,
    timestamp: new Date().toISOString(),
  };
}

/** Persist the session and all dirty buffers to disk. */
export async function persistSession(snap: SessionSnapshot): Promise<void> {
  const session = buildSessionState(snap);

  // Write dirty buffer backups
  for (const tab of snap.tabs) {
    if (tab.type === "file" && tab.dirty) {
      const engine = snap.engines.get(tab.id);
      if (engine) {
        const key = await saveBackupBuffer(tab.path, engine.getText());
        const sessionTab = session.tabs.find((t) => t.id === tab.id);
        if (sessionTab) sessionTab.backup_key = key;
      }
    }
  }

  await saveSessionIpc(session);
}

/** Load session from disk. Returns null if no session or version mismatch. */
export async function loadSessionFromDisk(): Promise<SessionState | null> {
  return loadSessionIpc();
}

/** Load a backup buffer by key. Returns null if not found. */
export async function loadBackup(key: string): Promise<string | null> {
  return loadBackupBuffer(key);
}

/** Delete a backup buffer after successful restore. */
export async function deleteBackup(key: string): Promise<void> {
  return deleteBackupBuffer(key);
}

/** Close the app window (called after hot-exit save completes). */
export async function closeApp(): Promise<void> {
  return confirmAppClose();
}
