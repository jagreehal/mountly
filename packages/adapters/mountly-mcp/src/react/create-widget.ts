import { createElement, type ComponentType } from "react";
import { createWidget } from "mountly-react";
import type { AdapterOptions, WidgetModule } from "mountly/adapter";
import type { McpWidgetProps } from "../index.js";
import { McpContext, type McpContextValue } from "./context.js";

/**
 * Wraps a React component as a mountly `WidgetModule` driven by the
 * mountly-mcp bridge. The bridge passes spec-defined props
 * (`mcp` / `toolInput` / `toolResult` / `hostContext`) plus any pass-through
 * props on each `mount` / `update`. The React component sees those as
 * regular React props, and can also pull the App via `useMcpHost()` or other
 * hooks from `mountly-mcp/react`.
 */
export function createMcpWidget<P extends object>(
  Component: ComponentType<P>,
  options?: AdapterOptions,
): WidgetModule {
  const Wrapped = (props: P & McpWidgetProps) => {
    const { mcp, toolInput, toolResult, hostContext, ...rest } = props as McpWidgetProps & P;
    const value: McpContextValue = {
      app: mcp,
      toolInput,
      toolResult,
      hostContext,
    };
    return createElement(
      McpContext.Provider,
      { value },
      createElement(Component as ComponentType, rest as P),
    );
  };
  return createWidget(Wrapped as ComponentType<P & McpWidgetProps>, options);
}
