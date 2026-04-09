import { Component, createSignal, For, Show, onMount } from "solid-js";
import { listExtensions, loadExtension, unloadExtension, type ExtensionInfo } from "../lib/extension-host";
import { extInstall, extUninstall } from "../lib/ipc";
import { showToast } from "./CanvasToasts";

const CAPABILITY_LABELS: Record<string, string> = {
  network: "Open gateway connections",
  workspace_read: "Read workspace files",
  workspace_write: "Write workspace files",
  commands: "Execute shell commands",
  terminal: "Access terminal system",
  notifications: "Show notifications",
  gateway_connect: "Connect to gateways",
  file_read: "Read files",
  file_write: "Write files",
};

const ExtensionsPage: Component = () => {
  const [extensions, setExtensions] = createSignal<ExtensionInfo[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  const [confirmUninstall, setConfirmUninstall] = createSignal<string | null>(null);

  async function refresh() {
    try {
      setExtensions(await listExtensions());
    } catch {}
    setLoaded(true);
  }

  onMount(refresh);

  async function handleToggle(ext: ExtensionInfo) {
    try {
      if (ext.active) {
        await unloadExtension(ext.id);
        showToast(`Disabled ${ext.name}`, "info");
      } else {
        await loadExtension(ext.id);
        showToast(`Enabled ${ext.name}`, "success");
      }
      await refresh();
    } catch (e) {
      showToast(`Failed: ${String(e)}`, "error");
    }
  }

  async function handleInstall() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, title: "Select extension folder" });
      if (!selected) return;
      const info = await extInstall(selected as string);
      showToast(`Installed ${info.name}`, "success");
      await refresh();
    } catch (e) {
      showToast(`Install failed: ${String(e)}`, "error");
    }
  }

  async function handleUninstall(id: string) {
    setConfirmUninstall(null);
    try {
      await extUninstall(id);
      showToast("Extension uninstalled", "success");
      await refresh();
    } catch (e) {
      showToast(`Uninstall failed: ${String(e)}`, "error");
    }
  }

  return (
    <div class="ext-page">
      <div class="ext-header">
        <span class="ext-title">Extensions</span>
        <button class="ext-install-btn" onClick={handleInstall}>Install from folder</button>
      </div>
      <div class="ext-body">
        <Show when={loaded() && extensions().length === 0}>
          <div class="ext-empty">
            No extensions installed. Click "Install from folder" or place extensions in <code>~/.buster/extensions/</code>.
          </div>
        </Show>

        <For each={extensions()}>
          {(ext) => (
            <div class="ext-card">
              <div class="ext-card-header">
                <span class="ext-card-name">{ext.name}</span>
                <span class="ext-card-version">v{ext.version}</span>
                <button
                  class={`ext-toggle-btn ${ext.active ? "ext-toggle-active" : ""}`}
                  onClick={() => handleToggle(ext)}
                >
                  {ext.active ? "Disable" : "Enable"}
                </button>
              </div>
              <Show when={ext.description}>
                <div class="ext-card-desc">{ext.description}</div>
              </Show>
              <Show when={ext.capabilities.length > 0}>
                <div class="ext-card-caps">
                  <For each={ext.capabilities}>
                    {(cap) => (
                      <span class="ext-cap-badge" title={CAPABILITY_LABELS[cap] ?? cap}>{cap}</span>
                    )}
                  </For>
                </div>
              </Show>
              <div class="ext-card-actions">
                <Show when={confirmUninstall() === ext.id}>
                  <span class="ext-confirm-text">Uninstall {ext.name}?</span>
                  <button class="ext-confirm-yes" onClick={() => handleUninstall(ext.id)}>Yes</button>
                  <button class="ext-confirm-no" onClick={() => setConfirmUninstall(null)}>No</button>
                </Show>
                <Show when={confirmUninstall() !== ext.id}>
                  <button class="ext-uninstall-btn" onClick={() => setConfirmUninstall(ext.id)}>Uninstall</button>
                </Show>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};

export default ExtensionsPage;
