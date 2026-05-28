/**
 * View-side bridge that turns an MCP Apps `App` into a mountly `WidgetModule`
 * lifecycle. The full spec handshake — `ui/initialize`,
 * `ui/notifications/initialized`, `ui/notifications/tool-input(-partial)`,
 * `ui/notifications/tool-result`, `ui/notifications/tool-cancelled`,
 * `ui/notifications/host-context-changed`, `ui/resource-teardown`,
 * `ui/notifications/size-changed` — is delegated to ext-apps's `App`.
 */
import {
  App,
  PostMessageTransport,
  type McpUiAppCapabilities,
} from "@modelcontextprotocol/ext-apps";
import type { WidgetModule } from "mountly/adapter";
import { MCP_ERROR_CODES } from "../schema.js";
import type {
  DisplayMode,
  McpWidgetProps,
  ToolInput,
  ToolResult,
} from "../types.js";

export interface RunBridgeOptions {
  /** Pre-constructed App (used by jsdom tests); otherwise one is created here. */
  app?: App;
  widget: WidgetModule;
  container: Element;
  /**
   * If true (default), mount is deferred until the first tool-result arrives;
   * the widget renders against `{ toolInput, toolResult, hostContext, mcp }`
   * props on each notification.
   *
   * If false, mount fires immediately after `ui/initialize` with `{ mcp }`
   * only — for "stateless" views that drive themselves via `mcp.callServerTool`.
   */
  awaitToolResult?: boolean;
  /** Display modes this view supports. Declared to the host during `ui/initialize`. */
  availableDisplayModes?: ReadonlyArray<DisplayMode>;
  /** App identity sent during `ui/initialize`. */
  appInfo?: { name: string; version: string };
  /** Override for tests; defaults to `window.addEventListener('beforeunload', ...)`. */
  onTeardown?: (handler: () => void) => () => void;
}

export interface RunningBridge {
  /** Resolves once `ui/initialize` handshake completes and the first mount (or deferred mount) is wired. */
  ready: Promise<void>;
  /** The underlying App; exposed for hosts that want to drive the view directly. */
  app: App;
  /** Synchronously triggers teardown. */
  stop(): void;
}

function renderErrorBoundary(container: Element, code: string, message?: string): void {
  const doc = container.ownerDocument;
  if (!doc) return;
  const errorDiv = doc.createElement("div");
  errorDiv.setAttribute("data-mountly-mcp-error", code);
  if (message !== undefined) errorDiv.textContent = message;
  container.innerHTML = "";
  container.appendChild(errorDiv);
}

export function runBridge(options: RunBridgeOptions): RunningBridge {
  const {
    widget,
    container,
    awaitToolResult = true,
    availableDisplayModes = ["inline"],
    appInfo = { name: "mountly-mcp", version: "0.0.0" },
  } = options;

  const appCapabilities: McpUiAppCapabilities = {
    availableDisplayModes: [...availableDisplayModes],
  };

  const app = options.app ?? new App(appInfo, appCapabilities);

  let toolInput: ToolInput | undefined;
  let toolResult: ToolResult | undefined;
  let mounted = false;
  let pending: Promise<void> = Promise.resolve();

  function currentProps(): McpWidgetProps {
    return {
      mcp: app,
      toolInput,
      toolResult,
      hostContext: app.getHostContext(),
    };
  }

  function notifyError(code: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    try {
      app.sendLog({ level: "error", data: { code, message } });
    } catch {
      // ignore — log channel may not be ready
    }
    renderErrorBoundary(container, code, message);
  }

  function renderWith(props: McpWidgetProps): void {
    pending = pending.then(async () => {
      try {
        if (!mounted) {
          const r = widget.mount(container, props);
          if (r instanceof Promise) await r;
          mounted = true;
        } else if (widget.update) {
          const r = widget.update(container, props);
          if (r instanceof Promise) await r;
        } else {
          widget.unmount(container);
          const r = widget.mount(container, props);
          if (r instanceof Promise) await r;
          mounted = true;
        }
      } catch (error) {
        notifyError(MCP_ERROR_CODES.WIDGET_MOUNT_THREW, error);
      }
    });
  }

  // Event handlers MUST be registered before connect() — ext-apps will refuse
  // to attach handlers retroactively after the initialize handshake completes.
  app.ontoolinput = (params) => {
    toolInput = params;
    if (!awaitToolResult) return;
    if (mounted || toolResult !== undefined) renderWith(currentProps());
  };

  app.ontoolinputpartial = () => {
    // Views MAY ignore partial input per spec; default policy is to skip.
    // Consumers wanting streaming UX can subscribe via app.addEventListener.
  };

  app.ontoolresult = (params) => {
    toolResult = params;
    renderWith(currentProps());
  };

  app.ontoolcancelled = () => {
    renderWith(currentProps());
  };

  app.onhostcontextchanged = () => {
    if (mounted) renderWith(currentProps());
  };

  app.onteardown = async () => {
    if (mounted) {
      widget.unmount(container);
      mounted = false;
    }
    return {};
  };

  const ready = (async () => {
    if (!options.app) {
      // App.connect() defaults to PostMessageTransport(window.parent, window.parent).
      await app.connect();
    }

    try {
      app.setupSizeChangedNotifications();
    } catch {
      // ResizeObserver may be unavailable (jsdom/non-browser).
    }

    if (!awaitToolResult) {
      renderWith({ mcp: app });
    }
  })();

  const detachTeardown =
    options.onTeardown?.(() => {
      if (mounted) widget.unmount(container);
    }) ??
    (typeof window !== "undefined"
      ? (() => {
          const h = () => {
            if (mounted) widget.unmount(container);
          };
          window.addEventListener("beforeunload", h);
          return () => window.removeEventListener("beforeunload", h);
        })()
      : () => undefined);

  return {
    ready,
    app,
    stop() {
      detachTeardown();
      if (mounted) widget.unmount(container);
    },
  };
}

export { App, PostMessageTransport };
export type {
  McpUiAppCapabilities,
  McpUiHostCapabilities,
  McpUiHostContext,
  McpUiToolInputNotification,
  McpUiToolResultNotification,
  McpUiToolCancelledNotification,
  McpUiHostContextChangedNotification,
} from "@modelcontextprotocol/ext-apps";
