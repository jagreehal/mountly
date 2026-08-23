/**
 * Inlined into the emitted HTML by `buildMcpResource`. Expects the View entry
 * to have published an `McpView` via `createMcpView` / `publishMcpView`.
 *
 * Spawns the ext-apps App, connects it via PostMessageTransport, and drives
 * the View lifecycle through `runBridge`.
 */
import type { McpUiDisplayMode } from "@modelcontextprotocol/ext-apps";
import { runBridge } from "./index.js";
import { getPublishedMcpView, MCP_VIEW_GLOBAL_KEY } from "../publish.js";

const view = getPublishedMcpView();
const awaitToolResult =
  (globalThis as { __mountlyMcpAwaitToolResult__?: boolean }).__mountlyMcpAwaitToolResult__ ?? true;
const streamToolInput =
  (globalThis as { __mountlyMcpStreamToolInput__?: boolean }).__mountlyMcpStreamToolInput__ ??
  false;
const availableDisplayModes = (
  globalThis as { __mountlyMcpAvailableDisplayModes__?: ReadonlyArray<McpUiDisplayMode> }
).__mountlyMcpAvailableDisplayModes__ ?? ["inline"];
const appInfo = (globalThis as { __mountlyMcpAppInfo__?: { name: string; version: string } })
  .__mountlyMcpAppInfo__;

if (!view) {
  throw new Error(
    `[mountly-mcp] no View published — call createMcpView(...) (or publishMcpView) in your entry so ${MCP_VIEW_GLOBAL_KEY} is set`,
  );
}

const container = document.getElementById("mountly-mcp-root");
if (!container) {
  throw new Error("[mountly-mcp] #mountly-mcp-root not found in iframe DOM");
}

const bridge = runBridge({
  view,
  container,
  awaitToolResult,
  streamToolInput,
  availableDisplayModes,
  appInfo,
  onTeardown: (handler) => {
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  },
});

// runBridge renders initialization failures before rejecting. Consume the
// rejection here so a failed handshake does not also become an unhandled one.
void bridge.ready.catch(() => undefined);
