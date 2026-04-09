import { Component, For } from "solid-js";
import "../styles/legend.css";

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "File",
    shortcuts: [
      { keys: "Cmd+S", description: "Save file" },
      { keys: "Cmd+O", description: "Open folder" },
      { keys: "Cmd+W", description: "Close tab / close window" },
      { keys: "Cmd+T", description: "New terminal" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { keys: "Cmd+P", description: "Open file picker" },
      { keys: "Cmd+Shift+P", description: "Command palette" },
      { keys: "Cmd+Shift+O", description: "Go to symbol (@)" },
      { keys: "Ctrl+G", description: "Go to line (:)" },
      { keys: "Cmd+P, then #", description: "Search file contents" },
      { keys: "Cmd+P, then ?", description: "Ask AI a question" },
      { keys: "Cmd+F", description: "Find in file" },
    ],
  },
  {
    title: "Editor",
    shortcuts: [
      { keys: "Cmd+Z", description: "Undo" },
      { keys: "Cmd+Shift+Z", description: "Redo" },
      { keys: "Cmd+C / Cmd+X / Cmd+V", description: "Copy / Cut / Paste" },
      { keys: "Cmd+A", description: "Select all" },
      { keys: "Alt+Click", description: "Add cursor" },
      { keys: "Alt+Left/Right", description: "Move by word" },
      { keys: "Cmd+Left/Right", description: "Move to line start/end" },
      { keys: "Cmd+Up/Down", description: "Move to file start/end" },
      { keys: "Tab", description: "Accept ghost text / Insert tab" },
      { keys: "Ctrl+Space", description: "Trigger autocomplete" },
      { keys: "F12", description: "Go to definition" },
      { keys: "Cmd+.", description: "Code actions" },
    ],
  },
  {
    title: "Git & Blame",
    shortcuts: [
      { keys: "Cmd+Shift+B", description: "Toggle blame view" },
    ],
  },
  {
    title: "View",
    shortcuts: [
      { keys: "Cmd+=", description: "Zoom in" },
      { keys: "Cmd+-", description: "Zoom out" },
      { keys: "Cmd+0", description: "Reset zoom" },
      { keys: "Cmd+,", description: "Open settings" },
      { keys: "Cmd+L", description: "Open AI agent" },
      { keys: "Ctrl+`", description: "New terminal" },
    ],
  },
];

const LegendTab: Component = () => {
  return (
    <div class="legend-tab">
      <div class="legend-header">
        <div class="legend-title">Keyboard Shortcuts</div>
      </div>
      <div class="legend-body">
        <For each={SHORTCUT_GROUPS}>
          {(group) => (
            <div class="legend-group">
              <div class="legend-group-title">{group.title}</div>
              <div class="legend-list">
                <For each={group.shortcuts}>
                  {(shortcut) => (
                    <div class="legend-row">
                      <span class="legend-keys">{shortcut.keys}</span>
                      <span class="legend-desc">{shortcut.description}</span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};

export default LegendTab;
