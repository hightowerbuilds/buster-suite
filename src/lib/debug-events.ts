/**
 * Debug event listener — receives DAP events from the Rust backend
 * via Tauri's event system and dispatches to callbacks.
 */

import { listen } from "@tauri-apps/api/event";
import type { DebugStackFrame, DebugVariable } from "./ipc";
import { debugStackTrace, debugVariables } from "./ipc";

/** Mirror of the Rust DebugEvent enum (serde tag = "type"). */
export type DebugEvent =
  | { type: "Stopped"; reason: string; thread_id: number; description: string | null }
  | { type: "Continued"; thread_id: number }
  | { type: "Terminated" }
  | { type: "Exited"; exit_code: number }
  | { type: "Output"; category: string; output: string }
  | { type: "BreakpointChanged"; reason: string; source: string | null; line: number | null; verified: boolean }
  | { type: "ThreadStarted"; thread_id: number; name: string }
  | { type: "ThreadExited"; thread_id: number };

export type DebugSessionState = "idle" | "running" | "paused" | "stopped";

export interface DebugEventCallbacks {
  onStateChange: (state: DebugSessionState) => void;
  onStackFrames: (frames: DebugStackFrame[]) => void;
  onVariables: (vars: DebugVariable[]) => void;
  onOutput: (category: string, text: string) => void;
  onSessionEnd: () => void;
}

export async function setupDebugEventListener(
  callbacks: DebugEventCallbacks,
): Promise<() => void> {
  const unlisten = await listen<DebugEvent>("debug-event", async (event) => {
    const evt = event.payload;
    switch (evt.type) {
      case "Stopped":
        callbacks.onStateChange("paused");
        try {
          const frames = await debugStackTrace();
          callbacks.onStackFrames(frames);
          if (frames.length > 0) {
            const vars = await debugVariables(frames[0]!.id);
            callbacks.onVariables(vars);
          }
        } catch { /* session may have ended */ }
        break;
      case "Continued":
        callbacks.onStateChange("running");
        break;
      case "Terminated":
      case "Exited":
        callbacks.onStateChange("stopped");
        callbacks.onSessionEnd();
        break;
      case "Output":
        callbacks.onOutput(evt.category, evt.output);
        break;
    }
  });
  return unlisten;
}
