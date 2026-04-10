import { Component, createSignal, createMemo, For, Show, onCleanup } from "solid-js";
import { useChat } from "@tanstack/ai-solid";
import type { UIMessage } from "@tanstack/ai-client";
import { aiApproveTool, aiCancel } from "../lib/ipc";
import { useApiKeyQuery, useSaveApiKeyMutation } from "../lib/ai-queries";
import { tauriChatConnection } from "../lib/tauri-chat-adapter";
import { ALL_MODELS } from "./ai-models";
import ModelGallery from "./ModelGallery";

interface AiChatProps {
  active: boolean;
  workspaceRoot?: string;
  settings?: import("../lib/ipc").AppSettings;
  onSettingsChange?: (settings: import("../lib/ipc").AppSettings) => void;
}

interface PendingApproval {
  requestId: string;
  toolName: string;
  toolInput: string;
}

const AiChat: Component<AiChatProps> = (props) => {
  let inputRef: HTMLTextAreaElement | undefined;
  let scrollRef: HTMLDivElement | undefined;

  // TanStack Query for API key
  const apiKeyQuery = useApiKeyQuery();
  const saveKeyMutation = useSaveApiKeyMutation();

  const hasKey = () => !!apiKeyQuery.data;
  const apiKey = () => apiKeyQuery.data ?? "";

  const [input, setInput] = createSignal("");
  const [pendingApproval, setPendingApproval] = createSignal<PendingApproval | null>(null);

  // Flip state + model queue
  const [flipped, setFlipped] = createSignal(false);
  const [modelQueue, setModelQueue] = createSignal<string[]>(["claude-sonnet-4-6"]);
  const [activeModelId, setActiveModelId] = createSignal("claude-sonnet-4-6");

  const selectedModel = () => activeModelId();
  const queuedModels = () => modelQueue().map(id => ALL_MODELS.find(m => m.id === id)!).filter(Boolean);

  function selectModel(modelId: string) {
    setActiveModelId(modelId);
  }

  // TanStack AI — useChat with custom Tauri adapter
  const connection = createMemo(() =>
    tauriChatConnection({
      apiKey,
      model: selectedModel,
      workspaceRoot: () => props.workspaceRoot ?? null,
    }),
  );

  const chat = useChat({
    get connection() { return connection(); },
    onCustomEvent: (eventType, data) => {
      if (eventType === "tool_approval") {
        const payload = data as { request_id: string; tool_name: string; tool_input: unknown };
        setPendingApproval({
          requestId: payload.request_id,
          toolName: payload.tool_name,
          toolInput: JSON.stringify(payload.tool_input, null, 2),
        });
      }
    },
    onError: () => {
      // Errors are already reflected in chat.error()
    },
  });

  // Throttled scroll-to-bottom
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  const SCROLL_THROTTLE_MS = 100;
  function scrollToBottom() {
    if (scrollTimer !== undefined) return;
    scrollTimer = setTimeout(() => {
      scrollTimer = undefined;
      if (scrollRef) scrollRef.scrollTop = scrollRef.scrollHeight;
    }, SCROLL_THROTTLE_MS);
  }

  // Scroll when messages change
  createMemo(() => {
    chat.messages();
    scrollToBottom();
  });

  onCleanup(() => clearTimeout(scrollTimer));

  async function sendMessage() {
    const prompt = input().trim();
    const key = apiKey().trim();
    if (!prompt || chat.isLoading() || !key) return;

    setInput("");
    await chat.sendMessage(prompt);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  async function handleApproval(approved: boolean) {
    const approval = pendingApproval();
    if (!approval) return;
    setPendingApproval(null);
    try {
      await aiApproveTool(approval.requestId, approved);
    } catch {}
  }

  function handleCancel() {
    chat.stop();
    aiCancel();
  }

  /** Render a single UIMessage into the chat display. */
  function renderMessage(msg: UIMessage) {
    // UIMessage has a `parts` array with text, tool-call, and tool-result parts
    const parts = msg.parts ?? [];
    const textContent = parts
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.content ?? "")
      .join("");

    const toolCalls = parts.filter((p: any) => p.type === "tool-call");
    const toolResults = parts.filter((p: any) => p.type === "tool-result");

    return (
      <>
        <Show when={msg.role === "user" && textContent}>
          <div class="ai-msg ai-msg-user">
            <span class="ai-msg-label">you</span>
            <pre class="ai-msg-content">{textContent}</pre>
          </div>
        </Show>
        <Show when={msg.role === "assistant" && textContent}>
          <div class="ai-msg ai-msg-assistant">
            <span class="ai-msg-label">buster</span>
            <pre class="ai-msg-content">{textContent}</pre>
          </div>
        </Show>
        <For each={toolCalls}>
          {(tc: any) => (
            <div class="ai-msg ai-msg-tool">
              <span class="ai-msg-label">{tc.toolName || "tool"}</span>
              <pre class="ai-msg-content">{"> "}{tc.toolName}({typeof tc.args === "string" ? tc.args : JSON.stringify(tc.args)})</pre>
            </div>
          )}
        </For>
        <For each={toolResults}>
          {(tr: any) => (
            <div class="ai-msg ai-msg-tool">
              <span class="ai-msg-label">{tr.toolName || "tool"}</span>
              <pre class="ai-msg-content">{tr.result ?? tr.output ?? ""}</pre>
            </div>
          )}
        </For>
      </>
    );
  }

  return (
    <div class="ai-chat" style={{ display: props.active ? "flex" : "none" }}>
      <div class={`ai-card-scene${flipped() ? " ai-flipped" : ""}`}>
        {/* Front: Chat */}
        <div class="ai-card-face ai-card-front">
          <div class="ai-messages" ref={scrollRef}>
            <Show when={chat.messages().length === 0}>
              <div class="ai-empty">
                <span class="ai-empty-title">{">_"} AI Agent</span>
                <Show when={hasKey()}>
                  <span class="ai-empty-hint">Ask me to read, write, search, or run commands in your workspace.</span>
                </Show>
                <Show when={!hasKey() && !apiKeyQuery.isLoading}>
                  <span class="ai-empty-hint">Connect a model to get started.</span>
                </Show>
                <Show when={apiKeyQuery.isLoading}>
                  <span class="ai-empty-hint">Loading...</span>
                </Show>
              </div>
            </Show>
            <For each={chat.messages()}>
              {(msg) => renderMessage(msg)}
            </For>
            <Show when={chat.isLoading()}>
              <div class="ai-msg ai-msg-loading">
                <span class="ai-loading-dot">.</span>
                <span class="ai-loading-dot">.</span>
                <span class="ai-loading-dot">.</span>
              </div>
            </Show>
            <Show when={chat.error()}>
              <div class="ai-msg ai-msg-assistant">
                <span class="ai-msg-label">buster</span>
                <pre class="ai-msg-content">Error: {chat.error()?.message}</pre>
              </div>
            </Show>
          </div>

          {/* Input bar */}
          <Show when={hasKey()}>
            <div class="ai-input-bar">
              <textarea
                ref={inputRef}
                class="ai-input"
                placeholder="Ask the AI agent..."
                value={input()}
                onInput={(e) => setInput(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={chat.isLoading()}
              />
              <Show when={!chat.isLoading()}>
                <button class="ai-send-btn" onClick={sendMessage}>
                  {">"}
                </button>
              </Show>
              <Show when={chat.isLoading()}>
                <button class="ai-send-btn ai-cancel-btn" onClick={handleCancel}>
                  x
                </button>
              </Show>
            </div>
          </Show>

          {/* Model queue bar */}
          <div class="ai-model-bar">
            <Show when={hasKey()}>
              <For each={queuedModels()}>
                {(model) => (
                  <button
                    class={`ai-model-bar-item${activeModelId() === model.id ? " ai-model-bar-item-active" : ""}`}
                    onClick={() => selectModel(model.id)}
                  >
                    {model.label}
                  </button>
                )}
              </For>
            </Show>
            <button class="ai-flip-btn" onClick={() => setFlipped(true)}>Dashboard</button>
          </div>
        </div>

        {/* Back: Model Gallery */}
        <ModelGallery
          modelQueue={modelQueue}
          setModelQueue={setModelQueue}
          activeModelId={activeModelId}
          setActiveModelId={setActiveModelId}
          onFlipBack={() => setFlipped(false)}
          hasKey={hasKey}
          saveKeyMutation={saveKeyMutation}
          settings={props.settings}
          onSettingsChange={props.onSettingsChange}
        />
      </div>

      {/* Tool approval modal */}
      <Show when={pendingApproval()}>
        {(approval) => (
          <div class="ai-approval-overlay">
            <div class="ai-approval-dialog">
              <div class="ai-approval-title">Approve tool execution?</div>
              <div class="ai-approval-tool">{approval().toolName}</div>
              <pre class="ai-approval-input">{approval().toolInput}</pre>
              <div class="ai-approval-buttons">
                <button class="ai-approval-btn ai-approval-deny" onClick={() => handleApproval(false)}>Deny</button>
                <button class="ai-approval-btn ai-approval-approve" onClick={() => handleApproval(true)}>Approve</button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
};

export default AiChat;
