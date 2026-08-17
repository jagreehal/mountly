/**
 * Svelte entry point: turn a Svelte component into an MCP App view.
 *
 * ```ts
 * import { createMcpWidget } from "mountly-mcp/svelte";
 * import Dashboard from "./Dashboard.svelte";
 *
 * const widget = createMcpWidget(Dashboard);
 * (globalThis as { __mountlyMcpWidget__?: unknown }).__mountlyMcpWidget__ = widget;
 * ```
 *
 * ```svelte
 * <script lang="ts">
 *   import type { McpWidgetProps } from "mountly-mcp";
 *   let { mcp, toolResult, hostContext }: McpWidgetProps = $props();
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
import type { AdapterOptions, WidgetModule } from "mountly/adapter";
import type { McpWidgetProps } from "../types.js";

/**
 * Wraps a Svelte component as a mountly `WidgetModule` driven by the
 * mountly-mcp bridge. The component receives `mcp`, `toolInput`,
 * `toolInputPartial`, `toolResult` and `hostContext` as props, alongside any
 * pass-through props.
 */
export function createMcpWidget<P extends object>(
  Component: Parameters<typeof createWidget<P & McpWidgetProps>>[0],
  options?: AdapterOptions,
): WidgetModule {
  return createWidget<P & McpWidgetProps>(Component, options);
}

export type { McpWidgetProps };
