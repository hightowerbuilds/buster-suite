import { Component, Show, createEffect, on, onCleanup } from "solid-js";
import { createFocusTrap } from "../lib/a11y";

export type DirtyCloseResult = "save" | "discard" | "cancel";

interface Props {
  visible: boolean;
  fileName: string;
  onResult: (result: DirtyCloseResult) => void;
}

const DirtyCloseDialog: Component<Props> = (props) => {
  let dialogRef: HTMLDivElement | undefined;

  const trap = createFocusTrap(
    () => dialogRef,
    () => props.onResult("cancel"),
  );

  createEffect(on(() => props.visible, (visible) => {
    if (visible) trap.activate();
    else trap.deactivate();
  }));
  onCleanup(() => trap.deactivate());

  return (
    <Show when={props.visible}>
      <div class="dirty-close-overlay" onClick={() => props.onResult("cancel")}>
        <div ref={dialogRef} class="dirty-close-dialog" role="alertdialog" aria-modal="true" aria-labelledby="dirty-close-title" aria-describedby="dirty-close-message" onClick={(e) => e.stopPropagation()}>
          <div class="dirty-close-title" id="dirty-close-title">Unsaved Changes</div>
          <div class="dirty-close-message" id="dirty-close-message">
            Save changes to <strong>{props.fileName}</strong> before closing?
          </div>
          <div class="dirty-close-buttons">
            <button class="dirty-close-btn cancel" onClick={() => props.onResult("cancel")}>
              Cancel
            </button>
            <button class="dirty-close-btn discard" onClick={() => props.onResult("discard")}>
              Don't Save
            </button>
            <button class="dirty-close-btn save" onClick={() => props.onResult("save")}>
              Save
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};

export default DirtyCloseDialog;
