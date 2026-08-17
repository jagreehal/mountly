/**
 * Spec types come straight from `@modelcontextprotocol/ext-apps` under their
 * own names — `McpUiDisplayMode`, `McpUiHostContext`, and the rest. mountly
 * deliberately does not rename them: the names in the MCP Apps spec (SEP-1865)
 * are the vocabulary users already learned, and every alias is one more thing
 * to translate and one more place to drift.
 *
 * Only genuinely mountly-specific types live here: the props a widget's
 * `mount()` receives, and the sidecar declaration written next to the built HTML.
 */
export type {
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
  McpUiToolInputPartialNotification,
  McpUiToolMeta,
  McpUiToolResultNotification,
  McpUiToolVisibility,
} from "@modelcontextprotocol/ext-apps";

import type {
  App,
  McpUiDisplayMode,
  McpUiHostContext,
  McpUiResourceMeta,
  McpUiToolInputNotification,
  McpUiToolInputPartialNotification,
  McpUiToolResultNotification,
} from "@modelcontextprotocol/ext-apps";
import type { MCP_APPS_MIME, MCP_APPS_PROTOCOL_VERSION } from "./schema.js";

/**
 * Props passed to a `WidgetModule.mount(container, props)` call.
 *
 * The bridge surfaces the App handle plus the latest tool input/result and a
 * snapshot of host context. Widgets receive new props through `update()` as
 * notifications arrive — see `runBridge` in `bridge/index.ts`.
 */
export interface McpWidgetProps {
  /** The view-side ext-apps App; exposes the full spec-compliant API surface. */
  mcp: App;
  /** Tool arguments (after `ui/notifications/tool-input`). */
  toolInput?: McpUiToolInputNotification["params"];
  /**
   * Streaming tool arguments (`ui/notifications/tool-input-partial`), only when
   * the bridge runs with `streamToolInput`. Best-effort recovered JSON: fields
   * may be missing or change between notifications, so never drive a critical
   * operation from it. Cleared once the complete `toolInput` arrives.
   */
  toolInputPartial?: McpUiToolInputPartialNotification["params"];
  /** Tool result (after `ui/notifications/tool-result`). */
  toolResult?: McpUiToolResultNotification["params"];
  /** Host context (theme, styles, displayMode, container dimensions, etc.). */
  hostContext?: McpUiHostContext;
}

/**
 * Resource metadata written to the `.meta.json` sidecar next to the emitted
 * HTML, consumed by `mountly-mcp/server` when registering the `ui://`
 * resource with `_meta.ui = {...}`.
 */
export interface McpResourceDeclaration {
  protocolVersion: typeof MCP_APPS_PROTOCOL_VERSION;
  uri: string;
  name: string;
  description?: string;
  mimeType: typeof MCP_APPS_MIME;
  /** Whether `runBridge` defers mount until the first tool-result arrives. */
  awaitToolResult: boolean;
  displayModes: ReadonlyArray<McpUiDisplayMode>;
  _meta: {
    ui: McpUiResourceMeta;
  };
}
