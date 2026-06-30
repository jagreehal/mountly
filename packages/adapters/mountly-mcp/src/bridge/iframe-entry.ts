/**
 * Inlined into the emitted HTML by `buildMcpResource`. Expects the user's
 * widget bundle to have placed a `WidgetModule` on
 * `globalThis.__mountlyMcpWidget__` (the bundler is responsible for that).
 *
 * Spawns the ext-apps App, connects it via PostMessageTransport, and drives
 * the widget lifecycle through `runBridge`.
 */
import type { WidgetModule } from "mountly/adapter";
import type { DisplayMode } from "../types.js";
import { runBridge } from "./index.js";

const widget = (globalThis as { __mountlyMcpWidget__?: WidgetModule }).__mountlyMcpWidget__;
const awaitToolResult =
  (globalThis as { __mountlyMcpAwaitToolResult__?: boolean }).__mountlyMcpAwaitToolResult__ ?? true;
const availableDisplayModes = (
  globalThis as { __mountlyMcpAvailableDisplayModes__?: ReadonlyArray<DisplayMode> }
).__mountlyMcpAvailableDisplayModes__ ?? ["inline"];
const appInfo = (globalThis as { __mountlyMcpAppInfo__?: { name: string; version: string } })
  .__mountlyMcpAppInfo__;

if (!widget) {
  throw new Error("[mountly-mcp] no widget on globalThis.__mountlyMcpWidget__");
}

const container = document.getElementById("mountly-mcp-root");
if (!container) {
  throw new Error("[mountly-mcp] #mountly-mcp-root not found in iframe DOM");
}

const bridge = runBridge({
  widget,
  container,
  awaitToolResult,
  availableDisplayModes,
  appInfo,
  onTeardown: (handler) => {
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  },
});

void bridge.ready;
