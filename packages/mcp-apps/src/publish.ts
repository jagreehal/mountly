import type { McpView } from "./types.js";

/** Internal bridge key — prefer {@link publishMcpView} / `createMcpView`. */
export const MCP_VIEW_GLOBAL_KEY = "__mountlyMcpView__" as const;

/**
 * Publish a View module for the iframe bridge. Call once from your View entry
 * (or rely on `createMcpView`, which does this for you).
 */
export function publishMcpView(view: McpView): McpView {
  (globalThis as Record<string, unknown>)[MCP_VIEW_GLOBAL_KEY] = view;
  return view;
}

/** Read the published View module, if any. */
export function getPublishedMcpView(): McpView | undefined {
  return (globalThis as Record<string, unknown>)[MCP_VIEW_GLOBAL_KEY] as McpView | undefined;
}
