import { listen } from "@tauri-apps/api/event";
import { readFile } from "./ipc";
import { showToast } from "../ui/CanvasToasts";
import type { EditorEngine } from "../editor/engine";
import type { Tab } from "./tab-types";

interface FileWatcherDeps {
  getTabs: () => Tab[];
  getEngine: (tabId: string) => EditorEngine | undefined;
  showConflictDialog: (tabId: string, fileName: string, diskContent: string) => void;
}

export async function setupFileWatcher(deps: FileWatcherDeps): Promise<() => void> {
  const unlisten = await listen<{ path: string }>("file-changed-externally", async (event) => {
    const changedPath = event.payload.path;

    // Find the tab for this path
    const tab = deps.getTabs().find(t => t.type === "file" && t.path === changedPath);
    if (!tab) return;

    const engine = deps.getEngine(tab.id);
    if (!engine) return;

    // Read updated content from disk
    let diskContent: string;
    try {
      const file = await readFile(changedPath);
      diskContent = file.content;
    } catch {
      return; // File may have been deleted
    }

    // Skip if content is identical (e.g. touch, or save with same content)
    if (diskContent === engine.getText()) return;

    if (engine.dirty()) {
      // Dirty buffer — show conflict dialog
      deps.showConflictDialog(tab.id, tab.name, diskContent);
    } else {
      // Clean buffer — silently reload
      engine.loadText(diskContent);
      showToast(`Reloaded: ${tab.name}`, "info");
    }
  });

  return unlisten;
}
