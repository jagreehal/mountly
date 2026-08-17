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
  type McpUiDisplayMode,
  type McpUiToolInputNotification,
  type McpUiToolInputPartialNotification,
  type McpUiToolResultNotification,
} from "@modelcontextprotocol/ext-apps";
import type { WidgetModule } from "mountly/adapter";
import { MCP_ERROR_CODES } from "../schema.js";
import type { McpWidgetProps } from "../types.js";

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
  /**
   * Render progressive states from `ui/notifications/tool-input-partial`.
   *
   * Off by default — the spec lets views ignore partials, and they carry
   * best-effort recovered JSON that MUST NOT drive critical operations. When
   * on, partials arrive as `toolInputPartial` (mounting the widget early if
   * needed) and are cleared once the complete `tool-input` lands.
   */
  streamToolInput?: boolean;
  /** Display modes this view supports. Declared to the host during `ui/initialize`. */
  availableDisplayModes?: ReadonlyArray<McpUiDisplayMode>;
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

/**
 * `data-mountly-mcp-state` is the View's machine-readable outcome, read by
 * `verify --render`. It only ever moves forward — `mounted` once the widget
 * has mounted, `error` if the boundary replaced it — so a state written here
 * can never be clobbered by a later lifecycle step.
 */
function renderErrorBoundary(container: Element, code: string, message?: string): void {
  container.setAttribute("data-mountly-mcp-state", "error");
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
    streamToolInput = false,
    availableDisplayModes = ["inline"],
    appInfo = { name: "mountly-mcp", version: "0.0.0" },
  } = options;

  const appCapabilities: McpUiAppCapabilities = {
    availableDisplayModes: [...availableDisplayModes],
  };

  const app = options.app ?? new App(appInfo, appCapabilities);

  let toolInput: McpUiToolInputNotification["params"] | undefined;
  let toolInputPartial: McpUiToolInputPartialNotification["params"] | undefined;
  let toolResult: McpUiToolResultNotification["params"] | undefined;
  let mounted = false;
  let stopped = false;
  let pending: Promise<void> = Promise.resolve();

  function currentProps(): McpWidgetProps {
    return {
      mcp: app,
      toolInput,
      toolInputPartial,
      toolResult,
      hostContext: app.getHostContext(),
    };
  }

  function notifyError(code: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    try {
      void app.sendLog({ level: "error", data: { code, message } }).catch(() => undefined);
    } catch {
      // ignore — log channel may not be ready
    }
    renderErrorBoundary(container, code, message);
  }

  function renderWith(props: McpWidgetProps): Promise<void> {
    pending = pending.then(async () => {
      if (stopped) return;
      try {
        if (!mounted) {
          const r = widget.mount(container, props);
          if (r instanceof Promise) await r;
          mounted = true;
          container.setAttribute("data-mountly-mcp-state", "mounted");
        } else if (widget.update) {
          const r = widget.update(container, props);
          if (r instanceof Promise) await r;
        } else {
          await widget.unmount(container);
          mounted = false;
          const r = widget.mount(container, props);
          if (r instanceof Promise) await r;
          mounted = true;
        }
      } catch (error) {
        notifyError(MCP_ERROR_CODES.WIDGET_MOUNT_THREW, error);
      }
    });
    return pending;
  }

  async function unmountWidget(): Promise<void> {
    await pending;
    if (!mounted) return;
    mounted = false;
    await widget.unmount(container);
  }

  // Event handlers MUST be registered before connect() — ext-apps will refuse
  // to attach handlers retroactively after the initialize handshake completes.
  const handleToolInput = (params: McpUiToolInputNotification["params"]) => {
    toolInput = params;
    toolInputPartial = undefined;
    if (!awaitToolResult) return;
    if (mounted || toolResult !== undefined) void renderWith(currentProps());
  };

  const handleToolInputPartial = (params: McpUiToolInputPartialNotification["params"]) => {
    // Views MAY ignore partial input per spec; opt in with `streamToolInput`.
    // Consumers wanting finer control can subscribe via app.addEventListener.
    if (!streamToolInput) return;
    toolInputPartial = params;
    void renderWith(currentProps());
  };

  const handleToolResult = (params: McpUiToolResultNotification["params"]) => {
    toolResult = params;
    void renderWith(currentProps());
  };

  const handleToolCancelled = () => {
    void renderWith(currentProps());
  };

  const handleHostContextChanged = () => {
    if (mounted) void renderWith(currentProps());
  };

  app.addEventListener("toolinput", handleToolInput);
  app.addEventListener("toolinputpartial", handleToolInputPartial);
  app.addEventListener("toolresult", handleToolResult);
  app.addEventListener("toolcancelled", handleToolCancelled);
  app.addEventListener("hostcontextchanged", handleHostContextChanged);

  const previousTeardown = app.onteardown;
  const bridgeTeardown: NonNullable<typeof app.onteardown> = async (params, extra) => {
    stopped = true;
    detachTeardown();
    detachAppHandlers();
    await unmountWidget();
    return (await previousTeardown?.(params, extra)) ?? {};
  };
  app.onteardown = bridgeTeardown;

  function detachAppHandlers(): void {
    app.removeEventListener("toolinput", handleToolInput);
    app.removeEventListener("toolinputpartial", handleToolInputPartial);
    app.removeEventListener("toolresult", handleToolResult);
    app.removeEventListener("toolcancelled", handleToolCancelled);
    app.removeEventListener("hostcontextchanged", handleHostContextChanged);
    if (app.onteardown === bridgeTeardown) app.onteardown = previousTeardown;
  }

  const ready = (async () => {
    try {
      if (!options.app) {
        // App.connect() defaults to PostMessageTransport(window.parent, window.parent)
        // and owns automatic resize setup.
        await app.connect();
      }

      if (!awaitToolResult) {
        await renderWith(currentProps());
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const code = /timeout/i.test(message)
        ? MCP_ERROR_CODES.INITIALIZE_TIMEOUT
        : MCP_ERROR_CODES.INITIALIZE_FAILED;
      notifyError(code, error);
      throw error;
    }
  })();

  let detachTeardown: () => void = () => undefined;

  function stopBridge(): void {
    if (stopped) return;
    stopped = true;
    detachTeardown();
    detachAppHandlers();
    void unmountWidget();
    if (!options.app) void app.close().catch(() => undefined);
  }

  detachTeardown =
    options.onTeardown?.(stopBridge) ??
    (typeof window !== "undefined"
      ? (() => {
          const h = () => stopBridge();
          window.addEventListener("beforeunload", h);
          return () => window.removeEventListener("beforeunload", h);
        })()
      : () => undefined);

  return {
    ready,
    app,
    stop: stopBridge,
  };
}

export { App, PostMessageTransport };
export type {
  McpUiAppCapabilities,
  McpUiHostCapabilities,
  McpUiHostContext,
  McpUiToolInputNotification,
  McpUiToolInputPartialNotification,
  McpUiToolResultNotification,
  McpUiToolCancelledNotification,
  McpUiHostContextChangedNotification,
} from "@modelcontextprotocol/ext-apps";
