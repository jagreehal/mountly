import { createMcpWidget } from "mountly-mcp/vue";
import McpReleaseReadiness from "./McpReleaseReadiness.vue";

(globalThis as { __mountlyMcpWidget__?: unknown }).__mountlyMcpWidget__ =
  createMcpWidget(McpReleaseReadiness);
