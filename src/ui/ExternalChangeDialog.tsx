import { Component, Show, createEffect, on, onCleanup } from "solid-js";
import { createFocusTrap } from "../lib/a11y";

export type ExternalChangeResult = "keep-mine" | "load-disk";

interface Props {
  visible: boolean;
  fileName: string;
  onResult: (result: ExternalChangeResult) => void;
}

const ExternalChangeDialog: Component<Props> = (props) => {
  let dialogRef: HTMLDivElement | undefined;

  const trap = createFocusTrap(
    () => dialogRef,
    () => props.onResult("keep-mine"),
  );

  createEffect(on(() => props.visible, (visible) => {
    if (visible) trap.activate();
    else trap.deactivate();
  }));
  onCleanup(() => trap.deactivate());

  return (
    <Show when={props.visible}>
      <div class="dirty-close-overlay" onClick={() => props.onResult("keep-mine")}>
        <div
          ref={dialogRef}
          class="dirty-close-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="ext-change-title"
          aria-describedby="ext-change-message"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="dirty-close-title" id="ext-change-title">File Changed on Disk</div>
          <div class="dirty-close-message" id="ext-change-message">
            <strong>{props.fileName}</strong> has been modified externally.
            You have unsaved changes. What would you like to do?
          </div>
          <div class="dirty-close-buttons">
            <button class="dirty-close-btn cancel" onClick={() => props.onResult("keep-mine")}>
              Keep Mine
            </button>
            <button class="dirty-close-btn discard" onClick={() => props.onResult("load-disk")}>
              Load from Disk
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};

export default ExternalChangeDialog;
