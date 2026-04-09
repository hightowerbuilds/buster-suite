import { Component, createSignal, createEffect, on, onCleanup, Show, For } from "solid-js";
import { createQuery } from "@tanstack/solid-query";
import {
  createBrowserView,
  navigateBrowserView,
  resizeBrowserView,
  showBrowserView,
  hideBrowserView,
  closeBrowserView,
  scanLocalPorts,
} from "./browser-service";
import "../../styles/browser.css";

interface BrowserWorkbenchProps {
  tabId: string;
  active: boolean;
  initialUrl?: string;
  onUrlChange?: (url: string) => void;
}

const BrowserWorkbench: Component<BrowserWorkbenchProps> = (props) => {
  const [url, setUrl] = createSignal(props.initialUrl || "http://localhost:3000");
  const [inputUrl, setInputUrl] = createSignal(props.initialUrl || "http://localhost:3000");
  const [browserId, setBrowserId] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  let containerRef: HTMLDivElement | undefined;

  const portsQuery = createQuery(() => ({
    queryKey: ["local-ports"],
    queryFn: () => scanLocalPorts(),
    refetchInterval: 10_000,
    staleTime: 5_000,
  }));

  function getContainerBounds() {
    if (!containerRef) return null;
    const rect = containerRef.getBoundingClientRect();
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  }

  async function createView() {
    const bounds = getContainerBounds();
    if (!bounds || bounds.width < 10 || bounds.height < 10) return;

    try {
      const id = await createBrowserView(url(), bounds.x, bounds.y, bounds.width, bounds.height);
      setBrowserId(id);
      setError(null);
    } catch (e: any) {
      setError(e?.toString() ?? "Failed to create browser view");
    }
  }

  async function navigate(newUrl: string) {
    const id = browserId();
    if (!id) return;
    try {
      await navigateBrowserView(id, newUrl);
      setUrl(newUrl);
      setInputUrl(newUrl);
      props.onUrlChange?.(newUrl);
      setError(null);
    } catch (e: any) {
      setError(e?.toString() ?? "Navigation failed");
    }
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    let target = inputUrl().trim();
    if (!target) return;
    if (!target.startsWith("http://") && !target.startsWith("https://")) {
      target = "http://" + target;
      setInputUrl(target);
    }
    navigate(target);
  }

  function handleRefresh() {
    navigate(url());
  }

  function handlePortClick(portUrl: string) {
    setInputUrl(portUrl);
    navigate(portUrl);
  }

  let initTimeout: ReturnType<typeof setTimeout>;
  function scheduleCreate() {
    clearTimeout(initTimeout);
    initTimeout = setTimeout(() => {
      if (!browserId()) createView();
    }, 100);
  }

  let resizeObserver: ResizeObserver | undefined;
  function setupResizeObserver() {
    if (!containerRef) return;
    resizeObserver = new ResizeObserver(() => {
      const id = browserId();
      if (!id) return;
      const bounds = getContainerBounds();
      if (!bounds) return;
      resizeBrowserView(id, bounds.x, bounds.y, bounds.width, bounds.height).catch(() => {});
    });
    resizeObserver.observe(containerRef);
  }

  createEffect(
    on(
      () => props.active,
      (active) => {
        const id = browserId();
        if (!id) return;
        if (active) {
          const bounds = getContainerBounds();
          if (bounds) {
            resizeBrowserView(id, bounds.x, bounds.y, bounds.width, bounds.height).catch(() => {});
          }
          showBrowserView(id).catch(() => {});
        } else {
          hideBrowserView(id).catch(() => {});
        }
      }
    )
  );

  onCleanup(() => {
    clearTimeout(initTimeout);
    resizeObserver?.disconnect();
    const id = browserId();
    if (id) {
      closeBrowserView(id).catch(() => {});
    }
  });

  return (
    <div class="browser-tab">
      <form class="browser-toolbar" onSubmit={handleSubmit}>
        <button type="button" class="browser-nav-btn" onClick={handleRefresh} title="Refresh">
          R
        </button>
        <input
          class="browser-url-input"
          type="text"
          value={inputUrl()}
          onInput={(e) => setInputUrl(e.currentTarget.value)}
          placeholder="http://localhost:3000"
          spellcheck={false}
        />
        <button type="submit" class="browser-nav-btn" title="Go">
          Go
        </button>
      </form>
      <Show when={portsQuery.data && portsQuery.data.length > 0}>
        <div class="browser-ports">
          <For each={portsQuery.data!}>
            {(p) => (
              <button
                class={`browser-port-btn ${url() === p.url ? "browser-port-active" : ""}`}
                onClick={() => handlePortClick(p.url)}
              >
                :{p.port}
              </button>
            )}
          </For>
        </div>
      </Show>
      {error() && <div class="browser-error">{error()}</div>}
      <div
        class="browser-content"
        ref={(el) => {
          containerRef = el;
          scheduleCreate();
          requestAnimationFrame(() => setupResizeObserver());
        }}
      />
    </div>
  );
};

export default BrowserWorkbench;
