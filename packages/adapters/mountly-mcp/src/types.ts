/**
 * Types — re-exported from `@modelcontextprotocol/ext-apps` so they stay in
 * lock-step with the official MCP Apps spec (SEP-1865, 2026-01-26).
 *
 * Only the mountly-specific glue types (props passed to a widget's mount(),
 * resource declaration written to the sidecar JSON) live here.
 */
import type {
  App,
  McpUiAppCapabilities,
  McpUiDisplayMode,
  McpUiHostCapabilities,
  McpUiHostContext,
  McpUiHostContextChangedNotification,
  McpUiResourceCsp,
  McpUiResourceMeta,
  McpUiResourcePermissions,
  McpUiToolCancelledNotification,
  McpUiToolInputNotification,
  McpUiToolMeta,
  McpUiToolResultNotification,
  McpUiToolVisibility,
} from "@modelcontextprotocol/ext-apps";
import type { MCP_APPS_MIME } from "./schema.js";

/** The MCP Apps view-side SDK instance. mountly-mcp surfaces this through React context. */
export type McpHost = App;

export type DisplayMode = McpUiDisplayMode;
export type AppCapabilities = McpUiAppCapabilities;
export type HostCapabilities = McpUiHostCapabilities;
export type HostContext = McpUiHostContext;
export type McpCsp = McpUiResourceCsp;
export type McpResourcePermissions = McpUiResourcePermissions;
export type McpResourceMeta = McpUiResourceMeta;
export type McpToolMeta = McpUiToolMeta;
export type McpToolVisibility = McpUiToolVisibility;
export type ToolInput = McpUiToolInputNotification["params"];
export type ToolResult = McpUiToolResultNotification["params"];
export type ToolCancelled = McpUiToolCancelledNotification["params"];
export type HostContextChanged = McpUiHostContextChangedNotification["params"];

/**
 * Props passed to a `WidgetModule.mount(container, props)` call.
 *
 * The bridge surfaces the App handle plus the latest tool input/result and a
 * snapshot of host context. Widgets receive new props through `update()` as
 * notifications arrive — see `runBridge` in `bridge/index.ts`.
 */
export interface McpWidgetProps {
  /** The view-side ext-apps App; exposes the full spec-compliant API surface. */
  mcp: McpHost;
  /** Tool arguments (after `ui/notifications/tool-input`). */
  toolInput?: ToolInput;
  /** Tool result (after `ui/notifications/tool-result`). */
  toolResult?: ToolResult;
  /** Host context (theme, styles, displayMode, container dimensions, etc.). */
  hostContext?: HostContext;
}

/**
 * Resource metadata written to the `.meta.json` sidecar next to the emitted
 * HTML, consumed by `mountly-mcp/server` when registering the `ui://`
 * resource with `_meta.ui = {...}`.
 */
export interface McpResourceDeclaration {
  protocolVersion: string;
  uri: string;
  name: string;
  description?: string;
  mimeType: typeof MCP_APPS_MIME;
  /** Whether `runBridge` defers mount until the first tool-result arrives. */
  awaitToolResult: boolean;
  displayModes: ReadonlyArray<DisplayMode>;
  _meta: {
    ui: McpResourceMeta;
  };
}
