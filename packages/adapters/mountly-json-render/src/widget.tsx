import { createElement } from "react";
import { type ComponentMap, createRenderer } from "@json-render/react";
import type { Catalog, SchemaDefinition, Spec } from "@json-render/core";
import { createMcpWidget, useMcpHost, useToolResult } from "mountly-mcp-react";
import type { McpHost } from "mountly-mcp";
import type { AdapterOptions, WidgetModule } from "mountly/adapter";

/** The catalog-data constraint createRenderer infers against. */
type CatalogData = { components: Record<string, { props: unknown }> };

/**
 * Route a generated UI's actions back to the MCP host. Called with the action
 * name, its (resolved) params, and the view-side `App` handle.
 */
export type ActionRouter = (
  name: string,
  params: Record<string, unknown> | undefined,
  mcp: McpHost,
) => void;

/**
 * Default router: an `ask` action with a string `prompt` param sends a
 * follow-up user turn to the model via `App.sendMessage`. This is the agent
 * loop json-render alone cannot do — it has no concept of an MCP host.
 */
export const defaultActionRouter: ActionRouter = (name, params, mcp) => {
  if (name !== "ask") return;
  const prompt = params?.prompt;
  const text = typeof prompt === "string" ? prompt : "";
  if (text) {
    void mcp.sendMessage({ role: "user", content: [{ type: "text", text }] });
  }
};

/**
 * Identity helper that types a components map against a catalog (so it can be
 * defined once and reused by both `createGenerativeWidget` and `createRenderer`)
 * without losing per-component prop inference.
 *
 * ```ts
 * export const components = defineComponents(catalog, {
 *   Metric: ({ element }) => <span>{element.props.value}</span>,
 * });
 * ```
 */
export function defineComponents<
  TDef extends SchemaDefinition,
  TCatalog extends CatalogData,
>(
  _catalog: Catalog<TDef, TCatalog>,
  components: ComponentMap<TCatalog["components"]>,
): ComponentMap<TCatalog["components"]> {
  return components;
}

export interface GenerativeWidgetOptions<
  TDef extends SchemaDefinition,
  TCatalog extends CatalogData,
> extends AdapterOptions {
  /** The json-render catalog — the vocabulary the agent may compose. */
  catalog: Catalog<TDef, TCatalog>;
  /** Native component implementations for each catalog type. */
  components: ComponentMap<TCatalog["components"]>;
  /**
   * How a generated UI's actions reach the agent. Defaults to
   * {@link defaultActionRouter} (`ask` → `App.sendMessage`).
   */
  onAction?: ActionRouter;
}

interface ToolResultShape {
  structuredContent?: { spec?: Spec };
}

/**
 * Turn a json-render catalog + components into a mountly MCP Apps widget.
 *
 * The returned widget reads the spec from the tool result, renders it natively
 * (resolving `$state` bindings from `spec.state`), and routes the rendered UI's
 * actions back to the MCP host. One call replaces the manual
 * catalog→registry→renderer→state→action-bridge wiring.
 *
 * ```ts
 * const widget = createGenerativeWidget({ catalog, components, styles, shadow: true });
 * (globalThis as { __mountlyMcpWidget__?: unknown }).__mountlyMcpWidget__ = widget;
 * ```
 */
export function createGenerativeWidget<
  TDef extends SchemaDefinition,
  TCatalog extends CatalogData,
>(options: GenerativeWidgetOptions<TDef, TCatalog>): WidgetModule {
  const {
    catalog,
    components,
    onAction = defaultActionRouter,
    ...adapter
  } = options;
  const Rendered = createRenderer(catalog, components);

  function GenerativeView() {
    const mcp = useMcpHost();
    const result = useToolResult<ToolResultShape>();
    const spec = result?.structuredContent?.spec ?? null;
    if (!spec) return null;
    return createElement(Rendered, {
      spec,
      state: spec.state,
      onAction: (name: string, params?: Record<string, unknown>) =>
        onAction(name, params, mcp),
    });
  }

  return createMcpWidget(GenerativeView, adapter);
}
