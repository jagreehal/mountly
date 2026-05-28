/**
 * Spec constants — re-exported from the canonical SDK so they cannot drift.
 * See `@modelcontextprotocol/ext-apps` for the source of truth.
 */
export {
  LATEST_PROTOCOL_VERSION as MCP_APPS_PROTOCOL_VERSION,
  RESOURCE_MIME_TYPE as MCP_APPS_MIME,
  RESOURCE_URI_META_KEY,
} from "@modelcontextprotocol/ext-apps";

export { EXTENSION_ID } from "@modelcontextprotocol/ext-apps/server";

export const MCP_APPS_URI_SCHEME = "ui://" as const;

/**
 * Implementation-specific error codes for mountly-mcp's host/bridge layer.
 * The spec doesn't standardize these; they appear in `notifications/message`
 * params so hosts can categorize widget failures.
 */
export const MCP_ERROR_CODES = {
  INITIALIZE_TIMEOUT: "mountly-mcp/initialize-timeout",
  TOOL_CALL_FAILED: "mountly-mcp/tool-call-failed",
  WIDGET_MOUNT_THREW: "mountly-mcp/widget-mount-threw",
  INVALID_ORIGIN: "mountly-mcp/invalid-origin",
} as const;

export type McpErrorCode = (typeof MCP_ERROR_CODES)[keyof typeof MCP_ERROR_CODES];
