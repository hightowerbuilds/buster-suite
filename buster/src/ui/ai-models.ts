/** Shared model and provider data for the AI chat system. */

export interface ModelInfo {
  id: string;
  label: string;
  provider: string;
  desc: string;
}

export interface ProviderKey {
  id: string;
  label: string;
  storageKey: string;
  placeholder: string;
}

export const PROVIDERS: ProviderKey[] = [
  { id: "anthropic", label: "Anthropic", storageKey: "buster-ai-key", placeholder: "sk-ant-..." },
  { id: "ollama", label: "Ollama", storageKey: "buster-ollama-key", placeholder: "Local — no key needed" },
  { id: "codex", label: "Codex", storageKey: "buster-codex-key", placeholder: "sk-..." },
  { id: "gemini", label: "Gemini", storageKey: "buster-gemini-key", placeholder: "AIza..." },
];

export const ALL_MODELS: ModelInfo[] = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", provider: "Anthropic", desc: "Fast + capable" },
  { id: "claude-opus-4-6", label: "Opus 4.6", provider: "Anthropic", desc: "Most intelligent" },
  { id: "claude-sonnet-4-20250514", label: "Sonnet 4", provider: "Anthropic", desc: "Balanced" },
  { id: "claude-opus-4-20250514", label: "Opus 4", provider: "Anthropic", desc: "Deep reasoning" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", provider: "Anthropic", desc: "Fastest" },
];
