import { createQuery, createMutation, useQueryClient } from "@tanstack/solid-query";
import { storeApiKey } from "./ipc";

const API_KEY_KEY = ["ai", "api-key"] as const;

// Canonical read — localStorage is the source of truth (keyring is a bonus)
function readApiKey(): string | null {
  return localStorage.getItem("buster-ai-key") || null;
}

/**
 * Loads the API key. localStorage is the primary store
 * (reliable across dev builds). Keyring is attempted as a
 * secondary write target for production signed builds.
 */
export function useApiKeyQuery() {
  return createQuery(() => ({
    queryKey: [...API_KEY_KEY],
    queryFn: async (): Promise<string | null> => {
      const key = readApiKey();
      if (key) return key;
      // Nothing in localStorage — maybe it's only in keyring (old install)
      try {
        const { loadApiKey } = await import("./ipc");
        const kr = await loadApiKey();
        if (kr) {
          localStorage.setItem("buster-ai-key", kr);
          return kr;
        }
      } catch {}
      return null;
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  }));
}

/**
 * Saves an API key to localStorage (always) and keyring (best-effort).
 * Invalidates the query so the UI reactively picks up the new key.
 */
export function useSaveApiKeyMutation() {
  const qc = useQueryClient();
  return createMutation(() => ({
    mutationFn: async (key: string): Promise<string> => {
      localStorage.setItem("buster-ai-key", key);
      try {
        await storeApiKey(key);
      } catch {}
      return key;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...API_KEY_KEY] });
    },
  }));
}

