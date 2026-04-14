/**
 * Reusable context menu overlay.
 *
 * Usage:
 *   <ContextMenu
 *     menu={menuSignal()}
 *     onClose={() => setMenu(null)}
 *   />
 *
 * Where menuSignal returns null (hidden) or { x, y, items }.
 */

import { Component, For, Show, createEffect, on, onCleanup } from "solid-js";

export interface ContextMenuItem {
  label: string;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: false;
}

export interface ContextMenuSeparator {
  separator: true;
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuEntry[];
}

interface ContextMenuProps {
  menu: ContextMenuState | null;
  onClose: () => void;
}

const ContextMenu: Component<ContextMenuProps> = (props) => {
  let menuRef: HTMLDivElement | undefined;

  // Click-outside dismissal
  createEffect(on(() => props.menu, (m) => {
    if (m) {
      const handler = (e: MouseEvent) => {
        if (menuRef && !menuRef.contains(e.target as Node)) {
          props.onClose();
        }
      };
      // Delay to avoid closing on the same right-click
      requestAnimationFrame(() => document.addEventListener("mousedown", handler));
      onCleanup(() => document.removeEventListener("mousedown", handler));
    }
  }));

  // Escape to close
  createEffect(on(() => props.menu, (m) => {
    if (m) {
      const handler = (e: KeyboardEvent) => {
        if (e.key === "Escape") { e.preventDefault(); props.onClose(); }
      };
      document.addEventListener("keydown", handler);
      onCleanup(() => document.removeEventListener("keydown", handler));
    }
  }));

  return (
    <Show when={props.menu}>
      {(() => {
        const m = props.menu!;
        // Clamp to viewport
        const x = Math.min(m.x, window.innerWidth - 200);
        const y = Math.min(m.y, window.innerHeight - m.items.length * 32 - 16);
        return (
          <div
            ref={menuRef}
            class="ctx-menu"
            role="menu"
            style={{ left: `${x}px`, top: `${y}px` }}
          >
            <For each={m.items}>
              {(item) =>
                "separator" in item && item.separator ? (
                  <div class="ctx-menu-separator" />
                ) : (
                  <button
                    class="ctx-menu-item"
                    classList={{ "ctx-menu-item-danger": !!(item as ContextMenuItem).danger }}
                    role="menuitem"
                    disabled={(item as ContextMenuItem).disabled}
                    onClick={() => {
                      (item as ContextMenuItem).action();
                      props.onClose();
                    }}
                  >
                    {(item as ContextMenuItem).label}
                  </button>
                )
              }
            </For>
          </div>
        );
      })()}
    </Show>
  );
};

export default ContextMenu;
