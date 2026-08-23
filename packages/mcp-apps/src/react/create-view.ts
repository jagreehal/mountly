/**
 * Wraps a React component as an MCP Apps View and publishes it for the bridge.
 * One call is enough — no manual global assign.
 */
import { createElement, type ComponentType } from "react";
import { createWidget } from "mountly-react";
import type { AdapterOptions } from "mountly/adapter";
import type { McpView, McpViewProps } from "../types.js";
import { publishMcpView } from "../publish.js";
import { McpContext, type McpContextValue } from "./context.js";

export function createMcpView<P extends object>(
  Component: ComponentType<P>,
  options?: AdapterOptions,
): McpView {
  const Wrapped = (props: P & McpViewProps) => {
    const { mcp, toolInput, toolInputPartial, toolResult, hostContext, ...rest } =
      props as McpViewProps & P;
    const value: McpContextValue = {
      app: mcp,
      toolInput,
      toolInputPartial,
      toolResult,
      hostContext,
    };
    return createElement(
      McpContext.Provider,
      { value },
      createElement(Component as ComponentType, rest as P),
    );
  };
  return publishMcpView(createWidget(Wrapped as ComponentType<P & McpViewProps>, options));
}
