/**
 * Custom TanStack AI connection adapter for Tauri IPC.
 *
 * Bridges the Rust agent's event stream (Tauri `listen("ai-event")`)
 * into the AG-UI protocol that @tanstack/ai-solid expects.
 */

import { stream } from "@tanstack/ai-client";
import type { ConnectConnectionAdapter } from "@tanstack/ai-client";
import type { StreamChunk, UIMessage, ModelMessage } from "@tanstack/ai";
import { listen } from "@tauri-apps/api/event";
import { aiChat } from "./ipc";
import type { AgentEvent } from "./ipc";

interface TauriChatOptions {
  apiKey: () => string;
  model: () => string;
  provider?: () => string;
  workspaceRoot: () => string | null;
}

/**
 * Map a Buster AgentEvent to one or more AG-UI StreamChunks.
 */
function mapEvent(
  e: AgentEvent,
  messageId: string,
  toolCallCounter: { value: number },
): StreamChunk[] {
  const ts = Date.now();

  switch (e.kind) {
    case "text":
      return [{
        type: "TEXT_MESSAGE_CONTENT",
        messageId,
        delta: e.content,
        timestamp: ts,
      }];

    case "tool_call": {
      const id = `tc_${++toolCallCounter.value}`;
      // Emit start + args + end since Buster sends tool calls as single events
      return [
        { type: "TOOL_CALL_START", toolCallId: id, toolName: e.tool_name || "unknown", timestamp: ts },
        { type: "TOOL_CALL_ARGS", toolCallId: id, delta: e.content, timestamp: ts },
        { type: "TOOL_CALL_END", toolCallId: id, toolName: e.tool_name || "unknown", timestamp: ts },
      ];
    }

    case "tool_result": {
      // Emit as a custom event — AG-UI doesn't have a dedicated tool_result event
      // outside of TOOL_CALL_END. We use CUSTOM so the UI can render it.
      return [{
        type: "CUSTOM",
        name: "tool_result",
        value: { content: e.content, toolName: e.tool_name },
        timestamp: ts,
      }];
    }

    case "tool_approval": {
      // Emit as custom event — the component handles approval via IPC
      return [{
        type: "CUSTOM",
        name: "tool_approval",
        value: JSON.parse(e.content),
        timestamp: ts,
      }];
    }

    case "done":
      return [
        { type: "TEXT_MESSAGE_END", messageId, timestamp: ts },
        { type: "RUN_FINISHED", runId: messageId, finishReason: "stop", timestamp: ts },
      ];

    case "error":
      return [
        { type: "TEXT_MESSAGE_END", messageId, timestamp: ts },
        { type: "RUN_ERROR", runId: messageId, error: { message: e.content }, timestamp: ts },
      ];

    default:
      return [];
  }
}

/**
 * Create a TanStack AI connection adapter that bridges Tauri IPC events.
 */
export function tauriChatConnection(opts: TauriChatOptions): ConnectConnectionAdapter {
  return stream(
    async function* (
      messages: Array<UIMessage> | Array<ModelMessage>,
    ): AsyncGenerator<StreamChunk> {
      // Extract the latest user message
      const last = messages[messages.length - 1];
      const prompt =
        last && "content" in last
          ? typeof last.content === "string"
            ? last.content
            : Array.isArray(last.content)
              ? last.content
                  .filter((p: any) => p.type === "text")
                  .map((p: any) => p.text || p.content || "")
                  .join("")
              : ""
          : "";

      if (!prompt) return;

      const runId = `run_${Date.now()}`;
      const messageId = `msg_${Date.now()}`;
      const toolCallCounter = { value: 0 };
      const ts = Date.now();

      // Emit run start + message start
      yield { type: "RUN_STARTED", runId, timestamp: ts };
      yield { type: "TEXT_MESSAGE_START", messageId, role: "assistant", timestamp: ts };

      // Set up an async queue to bridge Tauri events → yields
      const queue: StreamChunk[] = [];
      let resolve: (() => void) | null = null;
      let done = false;

      const unlisten = await listen<AgentEvent>("ai-event", (event) => {
        const chunks = mapEvent(event.payload, messageId, toolCallCounter);
        for (const chunk of chunks) queue.push(chunk);

        if (event.payload.kind === "done" || event.payload.kind === "error") {
          done = true;
        }

        if (resolve) {
          resolve();
          resolve = null;
        }
      });

      // Fire the Tauri command (runs async in Rust)
      try {
        await aiChat({
          prompt,
          api_key: opts.apiKey(),
          model: opts.model(),
          provider: opts.provider?.(),
          workspace_root: opts.workspaceRoot() ?? undefined,
        });
      } catch (err) {
        unlisten();
        yield {
          type: "RUN_ERROR",
          runId,
          error: { message: String(err) },
          timestamp: Date.now(),
        };
        return;
      }

      // Yield chunks as they arrive from Tauri events
      try {
        while (!done || queue.length > 0) {
          if (queue.length > 0) {
            yield queue.shift()!;
          } else {
            await new Promise<void>((r) => {
              resolve = r;
            });
          }
        }
      } finally {
        unlisten();
      }
    },
  );
}
