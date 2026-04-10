import { Component, onMount, onCleanup } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import { paintDisplayList, clearImageCache, type DrawCommand } from "./DisplayListPainter";
import { surfaceResizeNotify, surfaceGetLastPaint } from "../lib/ipc";

interface SurfaceEvent {
  surface_id: number;
  extension_id: string;
  kind: string;
  content: string;
}

interface DisplayListSurfaceProps {
  surfaceId: number;
  extensionId: string;
  initialWidth: number;
  initialHeight: number;
  label: string;
}

const DisplayListSurface: Component<DisplayListSurfaceProps> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined;
  let containerRef: HTMLDivElement | undefined;
  let currentWidth = props.initialWidth;
  let currentHeight = props.initialHeight;

  function paint(commands: DrawCommand[]) {
    if (!canvasRef) return;
    const ctx = canvasRef.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    paintDisplayList(ctx, commands, currentWidth, currentHeight, dpr);
  }

  onMount(() => {
    if (!canvasRef || !containerRef) return;

    const dpr = window.devicePixelRatio || 1;
    canvasRef.width = currentWidth * dpr;
    canvasRef.height = currentHeight * dpr;
    canvasRef.style.width = `${currentWidth}px`;
    canvasRef.style.height = `${currentHeight}px`;

    // Listen for surface paint events
    const unlistenPromise = listen<SurfaceEvent>("surface-event", (event) => {
      const payload = event.payload;
      if (payload.surface_id !== props.surfaceId) return;

      if (payload.kind === "paint") {
        try {
          const commands: DrawCommand[] = JSON.parse(payload.content);
          paint(commands);
        } catch {
          console.error("Failed to parse display list:", payload.content.slice(0, 200));
        }
      } else if (payload.kind === "resize") {
        try {
          const meta = JSON.parse(payload.content);
          currentWidth = meta.width;
          currentHeight = meta.height;
          const dpr = window.devicePixelRatio || 1;
          if (canvasRef) {
            canvasRef.width = currentWidth * dpr;
            canvasRef.height = currentHeight * dpr;
            canvasRef.style.width = `${currentWidth}px`;
            canvasRef.style.height = `${currentHeight}px`;
          }
        } catch {}
      }
    });

    // Fetch any buffered paint from before this component mounted
    surfaceGetLastPaint(props.surfaceId).then((content) => {
      if (content) {
        try {
          const commands: DrawCommand[] = JSON.parse(content);
          paint(commands);
        } catch {}
      }
    }).catch(() => {});

    // Watch container size changes
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0 && (Math.abs(width - currentWidth) > 1 || Math.abs(height - currentHeight) > 1)) {
          currentWidth = Math.floor(width);
          currentHeight = Math.floor(height);
          const dpr = window.devicePixelRatio || 1;
          if (canvasRef) {
            canvasRef.width = currentWidth * dpr;
            canvasRef.height = currentHeight * dpr;
            canvasRef.style.width = `${currentWidth}px`;
            canvasRef.style.height = `${currentHeight}px`;
          }
          surfaceResizeNotify(props.surfaceId, currentWidth, currentHeight).catch(() => {});
        }
      }
    });
    observer.observe(containerRef);

    onCleanup(() => {
      unlistenPromise.then((unlisten) => unlisten());
      observer.disconnect();
      clearImageCache();
    });
  });

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#1e1e2e",
      }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
};

export default DisplayListSurface;
