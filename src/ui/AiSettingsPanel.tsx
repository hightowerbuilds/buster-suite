import { Component, Show, createSignal, onMount } from "solid-js";
import type { AppSettings } from "../lib/ipc";

interface AiSettingsPanelProps {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
}

const PROVIDERS = [
  { id: "ollama", label: "Ollama (Local)" },
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
];

const AiSettingsPanel: Component<AiSettingsPanelProps> = (props) => {
  const [ollamaStatus, setOllamaStatus] = createSignal<"checking" | "connected" | "disconnected">("checking");
  const [ollamaModels, setOllamaModels] = createSignal<string[]>([]);

  function update(patch: Partial<AppSettings>) {
    props.onChange({ ...props.settings, ...patch });
  }

  // Check Ollama connection on mount
  onMount(async () => {
    try {
      const resp = await fetch(`${props.settings.ai_ollama_url}/api/tags`);
      if (resp.ok) {
        const data = await resp.json();
        const models = (data.models || []).map((m: { name: string }) => m.name);
        setOllamaModels(models);
        setOllamaStatus("connected");
      } else {
        setOllamaStatus("disconnected");
      }
    } catch {
      setOllamaStatus("disconnected");
    }
  });

  return (
    <div class="ai-settings-panel">
      <div class="ai-settings-header">
        <h2>AI Completion</h2>
        <p class="ai-settings-subtitle">Configure inline code suggestions powered by local or cloud AI models.</p>
      </div>

      <div class="ai-settings-section">
        <div class="ai-settings-row">
          <div class="ai-settings-label">
            <span class="ai-settings-title">Enable AI Completion</span>
            <span class="ai-settings-desc">Show inline suggestions as you type</span>
          </div>
          <button
            class={`ai-toggle ${props.settings.ai_completion_enabled ? "ai-toggle-on" : ""}`}
            onClick={() => update({ ai_completion_enabled: !props.settings.ai_completion_enabled })}
          >
            {props.settings.ai_completion_enabled ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      <Show when={props.settings.ai_completion_enabled}>
        <div class="ai-settings-section">
          <h3>Provider</h3>
          <div class="ai-provider-buttons">
            {PROVIDERS.map(p => (
              <button
                class={`ai-provider-btn ${props.settings.ai_provider === p.id ? "ai-provider-active" : ""}`}
                onClick={() => update({ ai_provider: p.id })}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <Show when={props.settings.ai_provider === "ollama"}>
          <div class="ai-settings-section">
            <h3>Local Model (Ollama)</h3>

            <div class="ai-settings-row">
              <div class="ai-settings-label">
                <span class="ai-settings-title">Status</span>
              </div>
              <span class={`ai-status ai-status-${ollamaStatus()}`}>
                {ollamaStatus() === "checking" ? "Checking..." :
                 ollamaStatus() === "connected" ? "Connected" : "Not Running"}
              </span>
            </div>

            <div class="ai-settings-row">
              <div class="ai-settings-label">
                <span class="ai-settings-title">Server URL</span>
                <span class="ai-settings-desc">Ollama API endpoint</span>
              </div>
              <input
                class="ai-input"
                type="text"
                value={props.settings.ai_ollama_url}
                onInput={(e) => update({ ai_ollama_url: e.currentTarget.value })}
                placeholder="http://localhost:11434"
              />
            </div>

            <div class="ai-settings-row">
              <div class="ai-settings-label">
                <span class="ai-settings-title">Model</span>
                <span class="ai-settings-desc">
                  {ollamaModels().length > 0
                    ? `${ollamaModels().length} model${ollamaModels().length === 1 ? "" : "s"} available`
                    : "Enter model name"}
                </span>
              </div>
              <Show when={ollamaModels().length > 0} fallback={
                <input
                  class="ai-input"
                  type="text"
                  value={props.settings.ai_local_model}
                  onInput={(e) => update({ ai_local_model: e.currentTarget.value })}
                  placeholder="gemma3:4b"
                />
              }>
                <select
                  class="ai-select"
                  value={props.settings.ai_local_model}
                  onChange={(e) => update({ ai_local_model: e.currentTarget.value })}
                >
                  {ollamaModels().map(m => (
                    <option value={m}>{m}</option>
                  ))}
                </select>
              </Show>
            </div>
          </div>
        </Show>

        <Show when={props.settings.ai_provider === "anthropic"}>
          <div class="ai-settings-section">
            <h3>Anthropic</h3>

            <div class="ai-settings-row">
              <div class="ai-settings-label">
                <span class="ai-settings-title">API Key</span>
                <span class="ai-settings-desc">Your Anthropic API key</span>
              </div>
              <input
                class="ai-input ai-input-key"
                type="password"
                value={props.settings.ai_api_key}
                onInput={(e) => update({ ai_api_key: e.currentTarget.value })}
                placeholder="sk-ant-..."
              />
            </div>

            <div class="ai-settings-row">
              <div class="ai-settings-label">
                <span class="ai-settings-title">Model</span>
                <span class="ai-settings-desc">Haiku is fastest, Sonnet is highest quality</span>
              </div>
              <select
                class="ai-select"
                value={props.settings.ai_model}
                onChange={(e) => update({ ai_model: e.currentTarget.value })}
              >
                <option value="claude-haiku-4-5-20250514">Haiku 4.5 (fast, cheap)</option>
                <option value="claude-sonnet-4-6-20250514">Sonnet 4.6 (high quality)</option>
              </select>
            </div>
          </div>
        </Show>

        <Show when={props.settings.ai_provider === "openai"}>
          <div class="ai-settings-section">
            <h3>OpenAI</h3>

            <div class="ai-settings-row">
              <div class="ai-settings-label">
                <span class="ai-settings-title">API Key</span>
                <span class="ai-settings-desc">Your OpenAI API key</span>
              </div>
              <input
                class="ai-input ai-input-key"
                type="password"
                value={props.settings.ai_api_key}
                onInput={(e) => update({ ai_api_key: e.currentTarget.value })}
                placeholder="sk-..."
              />
            </div>

            <div class="ai-settings-row">
              <div class="ai-settings-label">
                <span class="ai-settings-title">Model</span>
              </div>
              <select
                class="ai-select"
                value={props.settings.ai_model}
                onChange={(e) => update({ ai_model: e.currentTarget.value })}
              >
                <option value="gpt-4o-mini">GPT-4o Mini (fast, cheap)</option>
                <option value="gpt-4o">GPT-4o (high quality)</option>
              </select>
            </div>
          </div>
        </Show>

        <div class="ai-settings-section ai-settings-info">
          <h3>How it works</h3>
          <p>After you stop typing, Buster sends the surrounding code context to your chosen AI provider. Suggestions appear as ghost text — press <kbd>Tab</kbd> to accept or keep typing to dismiss.</p>
          <p>
            <strong>Local models</strong> run entirely on your machine via Ollama. No data leaves your computer.
            <br />
            <strong>Cloud models</strong> send code context to the provider's API. Your API key is stored locally in settings.
          </p>
        </div>
      </Show>
    </div>
  );
};

export default AiSettingsPanel;
