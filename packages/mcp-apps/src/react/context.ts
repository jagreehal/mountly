import { createContext } from "react";
import type {
  App,
  McpUiHostContext,
  McpUiToolInputNotification,
  McpUiToolInputPartialNotification,
  McpUiToolResultNotification,
} from "@modelcontextprotocol/ext-apps";

/**
 * Shared per-widget context. The bridge populates this on each mount/update,
 * so consumers can synchronously read the initial values (no event subscription
 * race) and the React tree re-renders when the bridge calls `update()`.
 */
export interface McpContextValue {
  app: App;
  toolInput?: McpUiToolInputNotification["params"];
  toolInputPartial?: McpUiToolInputPartialNotification["params"];
  toolResult?: McpUiToolResultNotification["params"];
  hostContext?: McpUiHostContext;
}

export const McpContext = createContext<McpContextValue | null>(null);
McpContext.displayName = "McpContext";
