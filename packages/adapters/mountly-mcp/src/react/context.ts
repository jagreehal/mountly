import { createContext } from "react";
import type { HostContext, McpHost, ToolInput, ToolResult } from "../index.js";

/**
 * Shared per-widget context. The bridge populates this on each mount/update,
 * so consumers can synchronously read the initial values (no event subscription
 * race) and the React tree re-renders when the bridge calls `update()`.
 */
export interface McpContextValue {
  app: McpHost;
  toolInput?: ToolInput;
  toolResult?: ToolResult;
  hostContext?: HostContext;
}

export const McpContext = createContext<McpContextValue | null>(null);
McpContext.displayName = "McpContext";
