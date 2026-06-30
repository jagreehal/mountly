import { useContext } from "react";
import {
  useAutoResize as useAutoResizeBase,
  useDocumentTheme as useDocumentThemeBase,
  useHostFonts as useHostFontsBase,
  useHostStyleVariables as useHostStyleVariablesBase,
  useHostStyles as useHostStylesBase,
} from "@modelcontextprotocol/ext-apps/react";
import type { DisplayMode, HostContext, McpHost } from "../index.js";
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
export function useMcpHost(): McpHost {
  return useEnsuredContext().app;
}

/** Tool arguments delivered via `ui/notifications/tool-input`. */
export function useToolInput<T = unknown>(): T | undefined {
  return useEnsuredContext().toolInput as T | undefined;
}

/** Tool result delivered via `ui/notifications/tool-result`. */
export function useToolResult<T = unknown>(): T | undefined {
  return useEnsuredContext().toolResult as T | undefined;
}

/** Latest host context snapshot (theme, styles, displayMode, container dimensions, etc.). */
export function useHostContext(): HostContext | undefined {
  return useEnsuredContext().hostContext;
}

/** Current display mode reported by the host. */
export function useDisplayMode(): DisplayMode | undefined {
  return useHostContext()?.displayMode;
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

/** Manually control auto-resize (rarely needed — the bridge calls setupSizeChangedNotifications by default). */
export function useAutoResize(...args: Parameters<typeof useAutoResizeBase>) {
  return useAutoResizeBase(...args);
}
