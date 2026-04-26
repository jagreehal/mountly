import { getAnalyticsLog, getAllModuleTimings } from "./analytics.js";
import { moduleCache, dataCache } from "./cache.js";

export interface DevtoolsPanelOptions {
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  collapsed?: boolean;
}

let panel: HTMLElement | null = null;
let stateInterval: ReturnType<typeof setInterval> | null = null;

export function createDevtoolsPanel(
  options: DevtoolsPanelOptions = {}
): { destroy: () => void } {
  const { position = "bottom-right", collapsed = false } = options;

  if (panel) {
    panel.remove();
  }

  panel = document.createElement("div");
  panel.setAttribute("data-mountly-devtools", "true");

  const positionStyles: Record<string, string> = {
    "bottom-right": "bottom: 20px; right: 20px;",
    "bottom-left": "bottom: 20px; left: 20px;",
    "top-right": "top: 20px; right: 20px;",
    "top-left": "top: 20px; left: 20px;",
  };

  panel.innerHTML = `
    <style>
      [data-mountly-devtools] {
        position: fixed;
        ${positionStyles[position]}
        z-index: 100000;
        font-family: "SF Mono", Monaco, "Cascadia Code", monospace;
        font-size: 12px;
        background: #0f172a;
        color: #e2e8f0;
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.4);
        border: 1px solid #1e293b;
        min-width: 320px;
        max-width: 480px;
        overflow: hidden;
      }

      [data-mountly-devtools] * {
        box-sizing: border-box;
      }

      [data-mountly-devtools-header] {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: #1e293b;
        cursor: pointer;
        user-select: none;
      }

      [data-mountly-devtools-title] {
        font-weight: 700;
        font-size: 13px;
        color: #38bdf8;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      [data-mountly-devtools-title]::before {
        content: "";
        display: inline-block;
        width: 8px;
        height: 8px;
        background: #22c55e;
        border-radius: 50%;
        animation: pulse-dot 2s infinite;
      }

      @keyframes pulse-dot {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }

      [data-mountly-devtools-toggle] {
        background: none;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        font-size: 18px;
        padding: 0 4px;
        line-height: 1;
        transition: transform 0.2s;
      }

      [data-mountly-devtools-toggle]:hover {
        color: #e2e8f0;
      }

      [data-mountly-devtools-toggle.collapsed] {
        transform: rotate(180deg);
      }

      [data-mountly-devtools-content] {
        max-height: 400px;
        overflow-y: auto;
        transition: max-height 0.3s ease;
      }

      [data-mountly-devtools-content.collapsed] {
        max-height: 0;
        overflow: hidden;
      }

      [data-mountly-devtools-section] {
        padding: 12px 16px;
        border-bottom: 1px solid #1e293b;
      }

      [data-mountly-devtools-section]:last-child {
        border-bottom: none;
      }

      [data-mountly-devtools-section-title] {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #64748b;
        margin-bottom: 8px;
        font-weight: 600;
      }

      [data-mountly-devtools-feature] {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 0;
      }

      [data-mountly-devtools-feature-name] {
        color: #e2e8f0;
        font-weight: 500;
      }

      [data-mountly-devtools-badge] {
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
      }

      [data-mountly-devtools-badge.idle] {
        background: #334155;
        color: #94a3b8;
      }

      [data-mountly-devtools-badge.preloading],
      [data-mountly-devtools-badge.activating] {
        background: #451a03;
        color: #fbbf24;
      }

      [data-mountly-devtools-badge.preloaded] {
        background: #1e3a5f;
        color: #38bdf8;
      }

      [data-mountly-devtools-badge.mounted] {
        background: #14532d;
        color: #4ade80;
      }

      [data-mountly-devtools-stat] {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
      }

      [data-mountly-devtools-stat-label] {
        color: #94a3b8;
      }

      [data-mountly-devtools-stat-value] {
        color: #38bdf8;
        font-weight: 600;
      }

      [data-mountly-devtools-timing] {
        display: flex;
        justify-content: space-between;
        padding: 3px 0;
        font-size: 11px;
      }

      [data-mountly-devtools-timing-phase] {
        color: #94a3b8;
      }

      [data-mountly-devtools-timing-duration] {
        color: #4ade80;
      }

      [data-mountly-devtools-actions] {
        display: flex;
        gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid #1e293b;
      }

      [data-mountly-devtools-btn] {
        flex: 1;
        padding: 8px;
        border: 1px solid #334155;
        background: #1e293b;
        color: #e2e8f0;
        border-radius: 6px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 500;
        transition: background 0.15s;
      }

      [data-mountly-devtools-btn]:hover {
        background: #334155;
      }

      [data-mountly-devtools-btn.danger] {
        border-color: #7f1d1d;
        color: #fca5a5;
      }

      [data-mountly-devtools-btn.danger]:hover {
        background: #7f1d1d;
      }
    </style>

    <div data-mountly-devtools-header>
      <div data-mountly-devtools-title>mountly</div>
      <button data-mountly-devtools-toggle class="${collapsed ? "collapsed" : ""}">
        ${collapsed ? "▲" : "▼"}
      </button>
    </div>

    <div data-mountly-devtools-content class="${collapsed ? "collapsed" : ""}">
      <div data-mountly-devtools-section>
        <div data-mountly-devtools-section-title>Features</div>
        <div data-mountly-devtools-features></div>
      </div>

      <div data-mountly-devtools-section>
        <div data-mountly-devtools-section-title>Cache</div>
        <div data-mountly-devtools-cache></div>
      </div>

      <div data-mountly-devtools-section>
        <div data-mountly-devtools-section-title>Recent Events</div>
        <div data-mountly-devtools-events></div>
      </div>

      <div data-mountly-devtools-actions>
        <button data-mountly-devtools-btn data-action="clear-cache">Clear Cache</button>
        <button data-mountly-devtools-btn data-action="clear-log">Clear Log</button>
        <button data-mountly-devtools-btn danger data-action="reset">Reset All</button>
      </div>
    </div>
  `;

  document.body.appendChild(panel);

  const header = panel.querySelector(
    "[data-mountly-devtools-header]"
  )!;
  const toggle = panel.querySelector(
    "[data-mountly-devtools-toggle]"
  )!;
  const content = panel.querySelector(
    "[data-mountly-devtools-content]"
  )!;

  let isCollapsed = collapsed;

  header.addEventListener("click", () => {
    isCollapsed = !isCollapsed;
    content.classList.toggle("collapsed", isCollapsed);
    toggle.classList.toggle("collapsed", isCollapsed);
    toggle.textContent = isCollapsed ? "▲" : "▼";
  });

  const actions = panel.querySelectorAll("[data-mountly-devtools-btn]");
  actions.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const action = (btn as HTMLElement).dataset.action;
      switch (action) {
        case "clear-cache":
          moduleCache.clear();
          dataCache.clear();
          break;
        case "clear-log":
          break;
        case "reset":
          moduleCache.clear();
          dataCache.clear();
          break;
      }
      updatePanel();
    });
  });

  const updatePanel = () => {
    if (!panel) return;

    const featuresContainer = panel.querySelector(
      "[data-mountly-devtools-features]"
    )!;
    const cacheContainer = panel.querySelector(
      "[data-mountly-devtools-cache]"
    )!;
    const eventsContainer = panel.querySelector(
      "[data-mountly-devtools-events]"
    )!;

    const timings = getAllModuleTimings();
    const featuresHtml = Array.from(timings.entries())
      .map(([moduleId, events]) => {
        const lastEvent = events[events.length - 1];
        const state = lastEvent?.phase.replace("_start", "").replace("_end", "") ?? "idle";
        return `
          <div data-mountly-devtools-feature>
            <span data-mountly-devtools-feature-name>${moduleId}</span>
            <span data-mountly-devtools-badge class="${state}">${state}</span>
          </div>
        `;
      })
      .join("") ||
      '<div style="color:#64748b;padding:8px 0">No features loaded</div>';

    featuresContainer.innerHTML = featuresHtml;

    cacheContainer.innerHTML = `
      <div data-mountly-devtools-stat>
        <span data-mountly-devtools-stat-label>Modules</span>
        <span data-mountly-devtools-stat-value>0</span>
      </div>
      <div data-mountly-devtools-stat>
        <span data-mountly-devtools-stat-label>Data entries</span>
        <span data-mountly-devtools-stat-value>0</span>
      </div>
    `;

    const logs = getAnalyticsLog().slice(-5).reverse();
    eventsContainer.innerHTML =
      logs
        .map(
          (e) => `
        <div data-mountly-devtools-timing>
          <span data-mountly-devtools-timing-phase>${e.moduleId} → ${e.phase}</span>
          <span data-mountly-devtools-timing-duration>${e.duration ? `${e.duration.toFixed(0)}ms` : "—"}</span>
        </div>
      `
        )
        .join("") ||
      '<div style="color:#64748b;padding:8px 0">No events yet</div>';
  };

  stateInterval = setInterval(updatePanel, 1000);
  updatePanel();

  const destroy = () => {
    if (stateInterval) clearInterval(stateInterval);
    if (panel) {
      panel.remove();
      panel = null;
    }
  };

  return { destroy };
}
