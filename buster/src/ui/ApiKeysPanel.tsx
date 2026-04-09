import { Component, createSignal, createEffect, on, For, Show } from "solid-js";
import { createFocusTrap } from "../lib/a11y";
import { useBuster } from "../lib/buster-context";
import { PROVIDERS, type ProviderKey } from "./ai-models";

interface ApiKeysPanelProps {
  hasKey: () => boolean;
  saveKeyMutation: { mutate: (key: string) => void };
}

const ApiKeysPanel: Component<ApiKeysPanelProps> = (props) => {
  const { store } = useBuster();
  const [editingProvider, setEditingProvider] = createSignal<string | null>(null);
  const [providerKeyInput, setProviderKeyInput] = createSignal("");
  const [storedKeys, setStoredKeys] = createSignal<Record<string, boolean>>(detectStoredKeys());
  const [confirmDeleteProvider, setConfirmDeleteProvider] = createSignal<ProviderKey | null>(null);

  function detectStoredKeys(): Record<string, boolean> {
    const result: Record<string, boolean> = {};
    for (const p of PROVIDERS) {
      result[p.id] = !!localStorage.getItem(p.storageKey);
    }
    return result;
  }

  function saveProviderKey(provider: ProviderKey) {
    const key = providerKeyInput().trim();
    if (!key) return;
    localStorage.setItem(provider.storageKey, key);
    setStoredKeys(detectStoredKeys());
    setEditingProvider(null);
    setProviderKeyInput("");
    if (provider.id === "anthropic") {
      props.saveKeyMutation.mutate(key);
    }
  }

  function removeProviderKey(provider: ProviderKey) {
    localStorage.removeItem(provider.storageKey);
    setStoredKeys(detectStoredKeys());
    if (provider.id === "anthropic") {
      localStorage.removeItem("buster-ai-key");
    }
  }

  return (
    <>
      <div class="ai-keys-section">
        <div class="ai-gallery-section-label">API Keys</div>
        <Show when={store.apiKeyInsecure}>
          <div class="ai-key-warning">
            Keyring unavailable — API key stored in localStorage (unencrypted).
          </div>
        </Show>
        <For each={PROVIDERS}>
          {(provider) => {
            const hasStoredKey = () => storedKeys()[provider.id];
            const isEditing = () => editingProvider() === provider.id;
            return (
              <div class="ai-key-row">
                <span class="ai-key-row-label">{provider.label}</span>
                <Show when={hasStoredKey() && !isEditing()}>
                  <span class="ai-key-row-dots">{"••••••••••••"}</span>
                  <button class="ai-key-row-remove" onClick={() => setConfirmDeleteProvider(provider)}>x</button>
                </Show>
                <Show when={!hasStoredKey() && !isEditing()}>
                  <button
                    class="ai-key-row-add"
                    onClick={() => { setEditingProvider(provider.id); setProviderKeyInput(""); }}
                  >
                    Add
                  </button>
                </Show>
                <Show when={isEditing()}>
                  <input
                    class="ai-key-row-input"
                    type="password"
                    placeholder={provider.placeholder}
                    value={providerKeyInput()}
                    onInput={(e) => setProviderKeyInput(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveProviderKey(provider);
                      if (e.key === "Escape") setEditingProvider(null);
                    }}
                    ref={(el) => setTimeout(() => el.focus(), 50)}
                  />
                  <button
                    class="ai-key-row-save"
                    onClick={() => saveProviderKey(provider)}
                    disabled={!providerKeyInput().trim()}
                  >
                    Save
                  </button>
                  <button class="ai-key-row-cancel" onClick={() => setEditingProvider(null)}>x</button>
                </Show>
              </div>
            );
          }}
        </For>
      </div>

      {/* Delete key confirmation */}
      <Show when={confirmDeleteProvider()}>
        {(provider) => {
          let confirmRef: HTMLDivElement | undefined;
          const trap = createFocusTrap(() => confirmRef, () => setConfirmDeleteProvider(null));
          createEffect(on(() => provider(), (p) => { if (p) trap.activate(); }));

          return (
          <div class="ai-approval-overlay" onClick={() => { trap.deactivate(); setConfirmDeleteProvider(null); }}>
            <div ref={confirmRef} class="ai-confirm-delete" role="alertdialog" aria-modal="true" aria-labelledby="api-key-delete-title" aria-describedby="api-key-delete-desc" onClick={(e) => e.stopPropagation()}>
              <div id="api-key-delete-title" class="ai-confirm-delete-title">Remove {provider().label} API key?</div>
              <div id="api-key-delete-desc" class="ai-confirm-delete-hint">This will permanently delete the stored key. You will need to re-enter it to use {provider().label} models.</div>
              <div class="ai-confirm-delete-actions">
                <button class="ai-confirm-delete-cancel" onClick={() => setConfirmDeleteProvider(null)}>Cancel</button>
                <button class="ai-confirm-delete-confirm" onClick={() => { removeProviderKey(provider()); setConfirmDeleteProvider(null); }}>Delete Key</button>
              </div>
            </div>
          </div>
          );
        }}
      </Show>
    </>
  );
};

export default ApiKeysPanel;
