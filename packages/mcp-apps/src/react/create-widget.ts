import { createElement, type ComponentType } from "react";
import { createWidget } from "mountly-react";
import type { AdapterOptions, WidgetModule } from "mountly/adapter";
import type { McpWidgetProps } from "../index.js";
import { McpContext, type McpContextValue } from "./context.js";

/**
 * Wraps a React component as a mountly `WidgetModule` driven by the
 * mountly-mcp bridge. The bridge passes spec-defined props
 * (`mcp` / `toolInput` / `toolResult` / `hostContext`) on each `mount` /
 * `update`. The wrapper consumes those bridge props and exposes them through
 * `useMcpHost()` and the other hooks from `mountly-mcp/react`; the wrapped
 * component's own props remain unchanged.
 */
export function createMcpWidget<P extends object>(
  Component: ComponentType<P>,
  options?: AdapterOptions,
): WidgetModule {
  const Wrapped = (props: P & McpWidgetProps) => {
    const { mcp, toolInput, toolInputPartial, toolResult, hostContext, ...rest } =
      props as McpWidgetProps & P;
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
  return createWidget(Wrapped as ComponentType<P & McpWidgetProps>, options);
}
