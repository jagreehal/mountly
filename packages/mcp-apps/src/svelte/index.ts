/**
 * Svelte entry point: turn a Svelte component into an MCP App View.
 *
 * ```ts
 * import { createMcpView } from "mountly-mcp/svelte";
 * import Dashboard from "./Dashboard.svelte";
 *
 * createMcpView(Dashboard);
 * ```
 *
 * ```svelte
 * <script lang="ts">
 *   import type { McpViewProps } from "mountly-mcp";
 *   let { mcp, toolResult, hostContext }: McpViewProps = $props();
 * </script>
 * ```
 *
 * Unlike the React and Vue entry points there are no context helpers: Svelte's
 * `setContext` has to run inside a compiled component, which would mean
 * shipping a `.svelte` file and a compiler from this package. Props are already
 * reactive via `$props()`, so pass them down where a nested component needs
 * them.
 */
import { createWidget } from "mountly-svelte";
import type { AdapterOptions } from "mountly/adapter";
import type { McpView, McpViewProps } from "../types.js";
import { publishMcpView } from "../publish.js";

/** Wraps a Svelte component as an MCP Apps View and publishes it for the bridge. */
export function createMcpView<P extends object>(
  Component: Parameters<typeof createWidget<P & McpViewProps>>[0],
  options?: AdapterOptions,
): McpView {
  return publishMcpView(createWidget<P & McpViewProps>(Component, options));
}

export type { McpViewProps };
