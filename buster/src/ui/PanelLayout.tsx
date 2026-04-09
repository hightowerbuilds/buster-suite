import { Component, For, Show, JSX, createSignal } from "solid-js";
import type { LayoutMode } from "./LayoutPicker";
import type { Tab } from "../lib/tab-types";

interface PanelLayoutProps {
  layout: LayoutMode;
  tabs: Tab[];
  activeTabId: string | null;
  renderPanel: (tab: Tab, isActive: boolean) => JSX.Element;
  welcome: JSX.Element;
}

function Divider(props: {
  direction: "horizontal" | "vertical";
  onDrag: (delta: number) => void;
}) {
  let startPos = 0;

  function onPointerDown(e: PointerEvent) {
    e.preventDefault();
    startPos = props.direction === "horizontal" ? e.clientX : e.clientY;
    document.body.style.userSelect = "none";
    document.body.style.cursor = props.direction === "horizontal" ? "col-resize" : "row-resize";

    const onMove = (ev: PointerEvent) => {
      const current = props.direction === "horizontal" ? ev.clientX : ev.clientY;
      const delta = current - startPos;
      if (delta !== 0) {
        props.onDrag(delta);
        startPos = current;
      }
    };

    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  return (
    <div
      class={`divider divider-${props.direction}`}
      onPointerDown={onPointerDown}
    />
  );
}

const PanelLayout: Component<PanelLayoutProps> = (props) => {
  // Flex sizes for resizable panels (stored as pixel adjustments from equal split)
  const [gridColSplit, setGridColSplit] = createSignal(50); // percentage
  const [gridRowSplit, setGridRowSplit] = createSignal(50);
  const [trioSplit, setTrioSplit] = createSignal(60); // percentage for main panel
  const [quintSplit, setQuintSplit] = createSignal(35); // left column percentage
  const [restackSplit, setRestackSplit] = createSignal(55); // top row percentage
  const [hqColSplit, setHqColSplit] = createSignal(33.33); // first col boundary
  const [hqColSplit2, setHqColSplit2] = createSignal(66.66); // second col boundary
  const [hqRowSplit, setHqRowSplit] = createSignal(50); // row boundary

  /** How many tabs the current layout mode can hold. */
  function groupSize(): number {
    switch (props.layout) {
      case "tabs": return 1;
      case "columns": return 6;
      case "grid": return 4;
      case "trio": return 3;
      case "quint": return 5;
      case "restack": return 5;
      case "hq": return 6;
      default: return 1;
    }
  }

  /** The tabs that form the layout group (first N). */
  function groupTabs(): Tab[] {
    return props.tabs.slice(0, groupSize());
  }

  /** Is the active tab inside the layout group? */
  function activeInGroup(): boolean {
    if (props.layout === "tabs") return true;
    const group = groupTabs();
    return group.some(t => t.id === props.activeTabId);
  }

  function visibleTabs(): Tab[] {
    const t = props.tabs;
    if (t.length === 0) return [];

    // If active tab is outside the group, show it solo
    if (!activeInGroup()) {
      const active = t.find((tab) => tab.id === props.activeTabId);
      return active ? [active] : [];
    }

    switch (props.layout) {
      case "tabs": {
        const active = t.find((tab) => tab.id === props.activeTabId);
        return active ? [active] : [];
      }
      case "columns": return t.slice(0, 6);
      case "grid": return t.slice(0, 4);
      case "trio": return t.slice(0, 3);
      case "quint": return t.slice(0, 5);
      case "restack": return t.slice(0, 5);
      case "hq": return t.slice(0, 6);
      default: return [];
    }
  }

  /** Effective layout — use "tabs" mode when active tab is outside the group. */
  function effectiveLayout() {
    if (!activeInGroup()) return "tabs";
    return props.layout;
  }

  let containerRef: HTMLDivElement | undefined;

  return (
    <div class="panel-layout" data-layout={effectiveLayout()} ref={containerRef}>
      <Show when={props.tabs.length === 0}>{props.welcome}</Show>

      {/* Tabs mode */}
      <Show when={props.tabs.length > 0 && effectiveLayout() === "tabs"}>
        <For each={visibleTabs()}>
          {(tab) => (
            <div class="panel panel-full">
              {props.renderPanel(tab, tab.id === props.activeTabId)}
            </div>
          )}
        </For>
      </Show>

      {/* Columns mode */}
      <Show when={props.tabs.length > 0 && effectiveLayout() === "columns"}>
        <div class="panel-columns">
          <For each={visibleTabs()}>
            {(tab, idx) => (
              <>
                {idx() > 0 && (
                  <Divider
                    direction="horizontal"
                    onDrag={(delta) => {
                      // Resize adjacent panels by adjusting flex-basis via CSS custom properties
                      const panels = containerRef?.querySelectorAll(".panel-column") as NodeListOf<HTMLElement>;
                      if (panels && panels[idx() - 1] && panels[idx()]) {
                        const prev = panels[idx() - 1];
                        const curr = panels[idx()];
                        const prevW = prev.offsetWidth + delta;
                        const currW = curr.offsetWidth - delta;
                        if (prevW > 60 && currW > 60) {
                          prev.style.flexBasis = `${prevW}px`;
                          prev.style.flexGrow = "0";
                          curr.style.flexBasis = `${currW}px`;
                          curr.style.flexGrow = "0";
                        }
                      }
                    }}
                  />
                )}
                <div class="panel panel-column">
                  <div class="panel-label">{tab.name}</div>
                  <div class="panel-content">
                    {props.renderPanel(tab, true)}
                  </div>
                </div>
              </>
            )}
          </For>
        </div>
      </Show>

      {/* Grid mode */}
      <Show when={props.tabs.length > 0 && effectiveLayout() === "grid"}>
        <div
          class="panel-grid"
          style={{
            "grid-template-columns": `${gridColSplit()}fr ${100 - gridColSplit()}fr`,
            "grid-template-rows": `${gridRowSplit()}fr ${100 - gridRowSplit()}fr`,
          }}
        >
          <For each={visibleTabs()}>
            {(tab) => (
              <div class="panel panel-grid-cell">
                <div class="panel-label">{tab.name}</div>
                <div class="panel-content">
                  {props.renderPanel(tab, true)}
                </div>
              </div>
            )}
          </For>
        </div>
        {/* Horizontal divider (between columns) */}
        <div
          class="grid-divider-h"
          onPointerDown={(e) => {
            e.preventDefault();
            const rect = containerRef?.getBoundingClientRect();
            if (!rect) return;
            document.body.style.userSelect = "none";
            document.body.style.cursor = "col-resize";
            const onMove = (ev: PointerEvent) => {
              const pct = ((ev.clientX - rect.left) / rect.width) * 100;
              setGridColSplit(Math.max(20, Math.min(80, pct)));
            };
            const onUp = () => {
              document.removeEventListener("pointermove", onMove);
              document.removeEventListener("pointerup", onUp);
              document.body.style.userSelect = "";
              document.body.style.cursor = "";
            };
            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
          }}
          style={{
            position: "absolute",
            left: `${gridColSplit()}%`,
            top: 0,
            width: "6px",
            height: "100%",
            cursor: "col-resize",
            "margin-left": "-3px",
            "z-index": 5,
          }}
        />
        {/* Vertical divider (between rows) */}
        <div
          class="grid-divider-v"
          onPointerDown={(e) => {
            e.preventDefault();
            const rect = containerRef?.getBoundingClientRect();
            if (!rect) return;
            document.body.style.userSelect = "none";
            document.body.style.cursor = "row-resize";
            const onMove = (ev: PointerEvent) => {
              const pct = ((ev.clientY - rect.top) / rect.height) * 100;
              setGridRowSplit(Math.max(20, Math.min(80, pct)));
            };
            const onUp = () => {
              document.removeEventListener("pointermove", onMove);
              document.removeEventListener("pointerup", onUp);
              document.body.style.userSelect = "";
              document.body.style.cursor = "";
            };
            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
          }}
          style={{
            position: "absolute",
            top: `${gridRowSplit()}%`,
            left: 0,
            height: "6px",
            width: "100%",
            cursor: "row-resize",
            "margin-top": "-3px",
            "z-index": 5,
          }}
        />
      </Show>

      {/* Trio mode */}
      <Show when={props.tabs.length > 0 && effectiveLayout() === "trio"}>
        <div class="panel-trio">
          <Show when={visibleTabs().length > 0}>
            <div class="panel panel-trio-main" style={{ flex: trioSplit() }}>
              <div class="panel-label">{visibleTabs()[0]?.name}</div>
              <div class="panel-content">
                {props.renderPanel(visibleTabs()[0], true)}
              </div>
            </div>
          </Show>
          <Divider
            direction="horizontal"
            onDrag={(delta) => {
              const rect = containerRef?.getBoundingClientRect();
              if (!rect) return;
              const pct = trioSplit() + (delta / rect.width) * 100;
              setTrioSplit(Math.max(25, Math.min(80, pct)));
            }}
          />
          <div class="panel-trio-side" style={{ flex: 100 - trioSplit() }}>
            <For each={visibleTabs().slice(1)}>
              {(tab, idx) => (
                <>
                  {idx() > 0 && (
                    <Divider
                      direction="vertical"
                      onDrag={(delta) => {
                        const cells = containerRef?.querySelectorAll(".panel-trio-cell") as NodeListOf<HTMLElement>;
                        if (cells && cells[idx() - 1] && cells[idx()]) {
                          const prev = cells[idx() - 1];
                          const curr = cells[idx()];
                          const prevH = prev.offsetHeight + delta;
                          const currH = curr.offsetHeight - delta;
                          if (prevH > 40 && currH > 40) {
                            prev.style.flexBasis = `${prevH}px`;
                            prev.style.flexGrow = "0";
                            curr.style.flexBasis = `${currH}px`;
                            curr.style.flexGrow = "0";
                          }
                        }
                      }}
                    />
                  )}
                  <div class="panel panel-trio-cell">
                    <div class="panel-label">{tab.name}</div>
                    <div class="panel-content">
                      {props.renderPanel(tab, true)}
                    </div>
                  </div>
                </>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Quint mode: left column + right 2x2 grid */}
      <Show when={props.tabs.length > 0 && effectiveLayout() === "quint"}>
        <div class="panel-quint">
          <Show when={visibleTabs().length > 0}>
            <div class="panel panel-quint-left" style={{ flex: quintSplit() }}>
              <div class="panel-label">{visibleTabs()[0]?.name}</div>
              <div class="panel-content">
                {props.renderPanel(visibleTabs()[0], true)}
              </div>
            </div>
          </Show>
          <Divider
            direction="horizontal"
            onDrag={(delta) => {
              const rect = containerRef?.getBoundingClientRect();
              if (!rect) return;
              const pct = quintSplit() + (delta / rect.width) * 100;
              setQuintSplit(Math.max(20, Math.min(60, pct)));
            }}
          />
          <div class="panel-quint-grid" style={{ flex: 100 - quintSplit() }}>
            <For each={visibleTabs().slice(1, 5)}>
              {(tab) => (
                <div class="panel panel-quint-cell">
                  <div class="panel-label">{tab.name}</div>
                  <div class="panel-content">
                    {props.renderPanel(tab, true)}
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Re-Stack mode: 3 columns left + 2 stacked panels right */}
      <Show when={props.tabs.length > 0 && effectiveLayout() === "restack"}>
        <div class="panel-restack">
          <div class="panel-restack-cols" style={{ flex: restackSplit() }}>
            <For each={visibleTabs().slice(0, 3)}>
              {(tab, idx) => (
                <>
                  {idx() > 0 && (
                    <Divider
                      direction="horizontal"
                      onDrag={(delta) => {
                        const cells = containerRef?.querySelectorAll(".panel-restack-col") as NodeListOf<HTMLElement>;
                        if (cells && cells[idx() - 1] && cells[idx()]) {
                          const prev = cells[idx() - 1];
                          const curr = cells[idx()];
                          const prevW = prev.offsetWidth + delta;
                          const currW = curr.offsetWidth - delta;
                          if (prevW > 60 && currW > 60) {
                            prev.style.flexBasis = `${prevW}px`;
                            prev.style.flexGrow = "0";
                            curr.style.flexBasis = `${currW}px`;
                            curr.style.flexGrow = "0";
                          }
                        }
                      }}
                    />
                  )}
                  <div class="panel panel-restack-col">
                    <div class="panel-label">{tab.name}</div>
                    <div class="panel-content">
                      {props.renderPanel(tab, true)}
                    </div>
                  </div>
                </>
              )}
            </For>
          </div>
          <Divider
            direction="horizontal"
            onDrag={(delta) => {
              const rect = containerRef?.getBoundingClientRect();
              if (!rect) return;
              const pct = restackSplit() + (delta / rect.width) * 100;
              setRestackSplit(Math.max(25, Math.min(80, pct)));
            }}
          />
          <div class="panel-restack-side" style={{ flex: 100 - restackSplit() }}>
            <For each={visibleTabs().slice(3, 5)}>
              {(tab, idx) => (
                <>
                  {idx() > 0 && (
                    <Divider
                      direction="vertical"
                      onDrag={(delta) => {
                        const cells = containerRef?.querySelectorAll(".panel-restack-side-cell") as NodeListOf<HTMLElement>;
                        if (cells && cells[idx() - 1] && cells[idx()]) {
                          const prev = cells[idx() - 1];
                          const curr = cells[idx()];
                          const prevH = prev.offsetHeight + delta;
                          const currH = curr.offsetHeight - delta;
                          if (prevH > 40 && currH > 40) {
                            prev.style.flexBasis = `${prevH}px`;
                            prev.style.flexGrow = "0";
                            curr.style.flexBasis = `${currH}px`;
                            curr.style.flexGrow = "0";
                          }
                        }
                      }}
                    />
                  )}
                  <div class="panel panel-restack-side-cell">
                    <div class="panel-label">{tab.name}</div>
                    <div class="panel-content">
                      {props.renderPanel(tab, true)}
                    </div>
                  </div>
                </>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* HQ mode: 3 columns x 2 rows */}
      <Show when={props.tabs.length > 0 && effectiveLayout() === "hq"}>
        <div
          class="panel-hq"
          style={{
            "grid-template-columns": `${hqColSplit()}fr ${hqColSplit2() - hqColSplit()}fr ${100 - hqColSplit2()}fr`,
            "grid-template-rows": `${hqRowSplit()}fr ${100 - hqRowSplit()}fr`,
          }}
        >
          <For each={visibleTabs()}>
            {(tab) => (
              <div class="panel panel-hq-cell">
                <div class="panel-label">{tab.name}</div>
                <div class="panel-content">
                  {props.renderPanel(tab, true)}
                </div>
              </div>
            )}
          </For>
        </div>
        {/* Column divider 1 */}
        <div
          onPointerDown={(e) => {
            e.preventDefault();
            const rect = containerRef?.getBoundingClientRect();
            if (!rect) return;
            document.body.style.userSelect = "none";
            document.body.style.cursor = "col-resize";
            const onMove = (ev: PointerEvent) => {
              const pct = ((ev.clientX - rect.left) / rect.width) * 100;
              setHqColSplit(Math.max(15, Math.min(hqColSplit2() - 10, pct)));
            };
            const onUp = () => {
              document.removeEventListener("pointermove", onMove);
              document.removeEventListener("pointerup", onUp);
              document.body.style.userSelect = "";
              document.body.style.cursor = "";
            };
            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
          }}
          style={{
            position: "absolute",
            left: `${hqColSplit()}%`,
            top: 0,
            width: "6px",
            height: "100%",
            cursor: "col-resize",
            "margin-left": "-3px",
            "z-index": 5,
          }}
        />
        {/* Column divider 2 */}
        <div
          onPointerDown={(e) => {
            e.preventDefault();
            const rect = containerRef?.getBoundingClientRect();
            if (!rect) return;
            document.body.style.userSelect = "none";
            document.body.style.cursor = "col-resize";
            const onMove = (ev: PointerEvent) => {
              const pct = ((ev.clientX - rect.left) / rect.width) * 100;
              setHqColSplit2(Math.max(hqColSplit() + 10, Math.min(85, pct)));
            };
            const onUp = () => {
              document.removeEventListener("pointermove", onMove);
              document.removeEventListener("pointerup", onUp);
              document.body.style.userSelect = "";
              document.body.style.cursor = "";
            };
            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
          }}
          style={{
            position: "absolute",
            left: `${hqColSplit2()}%`,
            top: 0,
            width: "6px",
            height: "100%",
            cursor: "col-resize",
            "margin-left": "-3px",
            "z-index": 5,
          }}
        />
        {/* Row divider */}
        <div
          onPointerDown={(e) => {
            e.preventDefault();
            const rect = containerRef?.getBoundingClientRect();
            if (!rect) return;
            document.body.style.userSelect = "none";
            document.body.style.cursor = "row-resize";
            const onMove = (ev: PointerEvent) => {
              const pct = ((ev.clientY - rect.top) / rect.height) * 100;
              setHqRowSplit(Math.max(20, Math.min(80, pct)));
            };
            const onUp = () => {
              document.removeEventListener("pointermove", onMove);
              document.removeEventListener("pointerup", onUp);
              document.body.style.userSelect = "";
              document.body.style.cursor = "";
            };
            document.addEventListener("pointermove", onMove);
            document.addEventListener("pointerup", onUp);
          }}
          style={{
            position: "absolute",
            top: `${hqRowSplit()}%`,
            left: 0,
            height: "6px",
            width: "100%",
            cursor: "row-resize",
            "margin-top": "-3px",
            "z-index": 5,
          }}
        />
      </Show>
    </div>
  );
};

export default PanelLayout;
