import { useContext } from "react";
import {
  useAutoResize as useAutoResizeBase,
  useDocumentTheme as useDocumentThemeBase,
  useHostFonts as useHostFontsBase,
  useHostStyleVariables as useHostStyleVariablesBase,
  useHostStyles as useHostStylesBase,
} from "@modelcontextprotocol/ext-apps/react";
import type {
  App,
  McpUiDisplayMode,
  McpUiHostContext,
  McpUiUpdateModelContextRequest,
} from "@modelcontextprotocol/ext-apps";
import { McpContext } from "./context.js";

function useEnsuredContext() {
  const ctx = useContext(McpContext);
  if (!ctx) {
    throw new Error(
      "mountly-mcp/react: useMcpHost/useToolInput/etc must be used inside a widget wrapped with createMcpWidget().",
    );
  }
  return ctx;
}

/** The view-side ext-apps App. Use this to call server tools, send messages, open links, etc. */
export function useMcpHost(): App {
  return useEnsuredContext().app;
}

/** Complete notification params; read the tool arguments from `.arguments`. */
export function useToolInput<T = unknown>(): T | undefined {
  return useEnsuredContext().toolInput as T | undefined;
}

/**
 * Streaming tool arguments (`ui/notifications/tool-input-partial`), present only
 * when the bridge runs with `streamToolInput`. Best-effort recovered JSON —
 * fields may be missing or change between notifications, so render loading
 * states from it, never critical operations. Undefined once the complete
 * {@link useToolInput} arrives.
 */
export function useToolInputPartial<T = unknown>(): Partial<T> | undefined {
  return useEnsuredContext().toolInputPartial as Partial<T> | undefined;
}

/** Complete MCP tool result; structured data is available at `.structuredContent`. */
export function useToolResult<T = unknown>(): T | undefined {
  return useEnsuredContext().toolResult as T | undefined;
}

/** Latest host context snapshot (theme, styles, displayMode, container dimensions, etc.). */
export function useHostContext(): McpUiHostContext | undefined {
  return useEnsuredContext().hostContext;
}

/** Current display mode reported by the host. */
export function useDisplayMode(): McpUiDisplayMode | undefined {
  return useHostContext()?.displayMode;
}

/**
 * Request a display mode change, resolving to the mode the host actually
 * applied — which the spec allows to differ from the one asked for.
 *
 * Modes the host didn't list in `availableDisplayModes` are never requested
 * (the spec requires views to check first); the current mode comes back
 * unchanged instead.
 */
export function useRequestDisplayMode(): (
  mode: McpUiDisplayMode,
) => Promise<McpUiDisplayMode | undefined> {
  const { app, hostContext } = useEnsuredContext();
  return async (mode) => {
    const available = hostContext?.availableDisplayModes;
    if (available && !available.includes(mode)) return hostContext?.displayMode;
    const result = await app.requestDisplayMode({ mode });
    return result.mode;
  };
}

/** Apply host CSS variables (and react to host-context changes). */
export function useHostStyleVariables(): void {
  const { app, hostContext } = useEnsuredContext();
  useHostStyleVariablesBase(app, hostContext ?? null);
}

/** Apply host-provided `@font-face`/`@import` rules. */
export function useHostFonts(): void {
  const { app, hostContext } = useEnsuredContext();
  useHostFontsBase(app, hostContext ?? null);
}

/** One-shot helper: apply both host style variables and host fonts. */
export function useHostStyles(): void {
  const { app, hostContext } = useEnsuredContext();
  useHostStylesBase(app, hostContext ?? null);
}

/** Track the document theme reactively. */
export function useDocumentTheme() {
  return useDocumentThemeBase();
}

/**
 * Return a function that calls `app.updateModelContext(params)`.
 *
 * Context updates are available to the model in future turns without
 * triggering an immediate response. Only the last update is kept.
 */
export function useUpdateModelContext(): (
  params: McpUiUpdateModelContextRequest["params"],
) => Promise<void> {
  const { app } = useEnsuredContext();
  return async (params) => {
    await app.updateModelContext(params);
  };
}

/** Manually control auto-resize (rarely needed — the bridge calls setupSizeChangedNotifications by default). */
export function useAutoResize(...args: Parameters<typeof useAutoResizeBase>) {
  return useAutoResizeBase(...args);
}
