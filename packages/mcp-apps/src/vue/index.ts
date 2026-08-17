/**
 * Vue entry point: turn a Vue component into an MCP App view.
 *
 * ```ts
 * import { createMcpWidget } from "mountly-mcp/vue";
 * import Dashboard from "./Dashboard.vue";
 *
 * const widget = createMcpWidget(Dashboard);
 * (globalThis as { __mountlyMcpWidget__?: unknown }).__mountlyMcpWidget__ = widget;
 * ```
 *
 * The component receives the bridge's props (`mcp`, `toolInput`, `toolResult`,
 * `hostContext`) and can also reach them from any depth with the composables
 * below, which mirror `mountly-mcp/react`'s hooks.
 */
import {
  computed,
  defineComponent,
  h,
  inject,
  provide,
  type Component,
  type ComputedRef,
  type InjectionKey,
} from "vue";
import { createWidget } from "mountly-vue";
import type { AdapterOptions, WidgetModule } from "mountly/adapter";
import type { App, McpUiDisplayMode, McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import type { McpWidgetProps } from "../types.js";

/** What {@link createMcpWidget} provides to descendants. */
export interface McpVueContext {
  app: App;
  toolInput?: McpWidgetProps["toolInput"];
  toolInputPartial?: McpWidgetProps["toolInputPartial"];
  toolResult?: McpWidgetProps["toolResult"];
  hostContext?: McpUiHostContext;
}

export const McpInjectionKey: InjectionKey<ComputedRef<McpVueContext>> = Symbol("mountly-mcp");

/**
 * Wraps a Vue component as a mountly `WidgetModule` driven by the mountly-mcp
 * bridge. The component's own props/attrs pass through unchanged; MCP bridge
 * props are consumed by the wrapper and provided to the subtree.
 */
export function createMcpWidget<P extends object>(
  Component: Component<P>,
  options?: AdapterOptions,
): WidgetModule {
  const Wrapped = defineComponent({
    name: "MountlyMcpProvider",
    inheritAttrs: false,
    props: {
      mcp: { type: Object, required: true },
      toolInput: { type: Object, default: undefined },
      toolInputPartial: { type: Object, default: undefined },
      toolResult: { type: Object, default: undefined },
      hostContext: { type: Object, default: undefined },
    },
    setup(props, { attrs }) {
      const context = computed<McpVueContext>(() => ({
        app: props.mcp as App,
        toolInput: props.toolInput as McpVueContext["toolInput"],
        toolInputPartial: props.toolInputPartial as McpVueContext["toolInputPartial"],
        toolResult: props.toolResult as McpVueContext["toolResult"],
        hostContext: props.hostContext as McpUiHostContext | undefined,
      }));
      provide(McpInjectionKey, context);
      return () => h(Component as Component, attrs);
    },
  });
  return createWidget(Wrapped, options);
}

function useEnsuredContext(): ComputedRef<McpVueContext> {
  const context = inject(McpInjectionKey, null);
  if (!context) {
    throw new Error(
      "mountly-mcp/vue: useMcpHost/useToolResult/etc must be used inside a component wrapped with createMcpWidget().",
    );
  }
  return context;
}

/** The view-side ext-apps App: call server tools, send messages, open links. */
export function useMcpHost(): App {
  return useEnsuredContext().value.app;
}

/** Complete notification params; read the tool arguments from `.arguments`. */
export function useToolInput<T = unknown>(): ComputedRef<T | undefined> {
  const context = useEnsuredContext();
  return computed(() => context.value.toolInput as T | undefined);
}

/**
 * Streaming tool arguments (`ui/notifications/tool-input-partial`), present only
 * when the bridge runs with `streamToolInput`. Best-effort recovered JSON —
 * render loading states from it, never critical operations.
 */
export function useToolInputPartial<T = unknown>(): ComputedRef<Partial<T> | undefined> {
  const context = useEnsuredContext();
  return computed(() => context.value.toolInputPartial as Partial<T> | undefined);
}

/** Complete MCP tool result; structured data is available at `.structuredContent`. */
export function useToolResult<T = unknown>(): ComputedRef<T | undefined> {
  const context = useEnsuredContext();
  return computed(() => context.value.toolResult as T | undefined);
}

/** Latest host context (theme, styles, displayMode, container dimensions). */
export function useHostContext(): ComputedRef<McpUiHostContext | undefined> {
  const context = useEnsuredContext();
  return computed(() => context.value.hostContext);
}

/** Current display mode reported by the host. */
export function useDisplayMode(): ComputedRef<McpUiDisplayMode | undefined> {
  const context = useEnsuredContext();
  return computed(() => context.value.hostContext?.displayMode);
}

/**
 * Request a display mode change, resolving to the mode the host actually
 * applied. Modes the host didn't advertise are never requested — the spec
 * requires views to check `availableDisplayModes` first.
 */
export function useRequestDisplayMode(): (
  mode: McpUiDisplayMode,
) => Promise<McpUiDisplayMode | undefined> {
  const context = useEnsuredContext();
  return async (mode) => {
    const { app, hostContext } = context.value;
    const available = hostContext?.availableDisplayModes;
    if (available && !available.includes(mode)) return hostContext?.displayMode;
    const result = await app.requestDisplayMode({ mode });
    return result.mode;
  };
}
