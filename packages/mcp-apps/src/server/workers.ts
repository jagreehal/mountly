/**
 * `mountly-mcp/server` on a runtime with no filesystem — Cloudflare Workers,
 * via the `workerd` and `worker` export conditions. Same API as the Node entry,
 * except Views come from `mountly-mcp.views.js` rather than paths, and there is
 * no `serveStdio`: pair it with the SDK's `WebStandardStreamableHTTPServerTransport`.
 */
export {
  EXTENSION_ID,
  RESOURCE_MIME_TYPE,
  createMcpAppServer,
  registerMcpApps,
  type CreateMcpAppServerOptions,
  type McpAppToolConfig,
  type McpAppToolRegistration,
  type McpAppToolResult,
  type McpAppViewRegistration,
  type RegisterMcpAppsOptions,
  type RegisteredMcpApps,
  type RunningMcpAppServer,
} from "./core.js";
