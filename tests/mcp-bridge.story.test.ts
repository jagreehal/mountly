// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { story } from "executable-stories-vitest";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { McpContext } from "../packages/mcp-apps/src/react/context";
import {
  useRequestDisplayMode,
  useToolResult as useReactToolResult,
} from "../packages/mcp-apps/src/react/hooks";
import { useToolResult as useVueToolResult } from "../packages/mcp-apps/src/vue/index";
import type { McpUiDisplayMode, McpUiHostContext } from "../packages/mcp-apps/src/types";
import { App, runBridge } from "../packages/mcp-apps/src/bridge/index";
import type { RunBridgeOptions } from "../packages/mcp-apps/src/bridge/index";
import type { McpWidgetProps } from "../packages/mcp-apps/src/types";

/** Records what the bridge hands the widget on each mount/update. */
function recordingWidget() {
  const renders: McpWidgetProps[] = [];
  const widget: RunBridgeOptions["widget"] = {
    mount: (_container, props) => {
      renders.push(props as McpWidgetProps);
    },
    update: (_container, props) => {
      renders.push(props as McpWidgetProps);
    },
    unmount: () => undefined,
  };
  return { widget, renders };
}

/** Let the bridge's internal render queue drain. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Dispatch through the SDK's registered notification handler, as a transport would. */
function emitNotification(app: App, method: string, params: unknown): void {
  const handlers = (
    app as unknown as {
      _notificationHandlers: Map<
        string,
        (notification: { method: string; params: unknown }) => void
      >;
    }
  )._notificationHandlers;
  handlers.get(method)?.({ method, params });
}

describe("runBridge — ui/notifications/tool-input-partial", () => {
  it("ignores partial tool input by default (spec: views MAY ignore it)", async ({ task }) => {
    story.init(task);
    const { widget, renders } = recordingWidget();
    const container = document.createElement("div");

    story.given("a bridge running with default options");
    const bridge = runBridge({ app: new App({ name: "t", version: "0" }), widget, container });
    await bridge.ready;

    story.when("the host streams partial tool arguments");
    emitNotification(bridge.app, "ui/notifications/tool-input-partial", {
      arguments: { plan: "ann" },
    });
    await flush();

    story.then("nothing renders — partial JSON never drives the widget");
    expect(renders).toHaveLength(0);
  });

  it("renders progressive states when streamToolInput is on, then clears on completion", async ({
    task,
  }) => {
    story.init(task);
    const { widget, renders } = recordingWidget();
    const container = document.createElement("div");

    story.given("a bridge opted into streaming tool input");
    const bridge = runBridge({
      app: new App({ name: "t", version: "0" }),
      widget,
      container,
      streamToolInput: true,
    });
    await bridge.ready;

    story.when("the host streams partial arguments");
    emitNotification(bridge.app, "ui/notifications/tool-input-partial", {
      arguments: { plan: "ann" },
    });
    await flush();

    story.then("the widget mounts early with toolInputPartial and no complete input");
    expect(renders).toHaveLength(1);
    expect(renders[0]?.toolInputPartial).toEqual({ arguments: { plan: "ann" } });
    expect(renders[0]?.toolInput).toBeUndefined();

    story.when("the complete tool input arrives");
    emitNotification(bridge.app, "ui/notifications/tool-input", {
      arguments: { plan: "annual" },
    });
    await flush();

    story.then("the partial is cleared so stale fields can't be mistaken for final ones");
    const last = renders.at(-1);
    expect(last?.toolInput).toEqual({ arguments: { plan: "annual" } });
    expect(last?.toolInputPartial).toBeUndefined();
  });
});

describe("runBridge — lifecycle integration", () => {
  it("uses the host context from initialization for an immediate mount", async ({ task }) => {
    story.init(task);
    const { widget, renders } = recordingWidget();
    const container = document.createElement("div");
    const app = new App({ name: "t", version: "0" });
    vi.spyOn(app, "getHostContext").mockReturnValue({ theme: "dark" });

    const bridge = runBridge({ app, widget, container, awaitToolResult: false });
    await bridge.ready;
    await flush();

    expect(renders[0]?.hostContext).toEqual({ theme: "dark" });
    expect(container.getAttribute("data-mountly-mcp-state")).toBe("mounted");
  });

  it("does not replace notification handlers installed by the widget", async ({ task }) => {
    story.init(task);
    const { widget } = recordingWidget();
    const app = new App({ name: "t", version: "0" });
    const widgetHandler = vi.fn<NonNullable<typeof app.ontoolresult>>();
    app.ontoolresult = widgetHandler;

    const bridge = runBridge({ app, widget, container: document.createElement("div") });
    await bridge.ready;

    expect(app.ontoolresult).toBe(widgetHandler);
    bridge.stop();
  });

  it("leaves automatic resize setup to App.connect", async ({ task }) => {
    story.init(task);
    const { widget } = recordingWidget();
    const connect = vi.spyOn(App.prototype, "connect").mockResolvedValue(undefined);
    const setup = vi
      .spyOn(App.prototype, "setupSizeChangedNotifications")
      .mockReturnValue(() => undefined);

    try {
      const bridge = runBridge({ widget, container: document.createElement("div") });
      await bridge.ready;

      expect(connect).toHaveBeenCalledOnce();
      expect(setup).not.toHaveBeenCalled();
      bridge.stop();
    } finally {
      connect.mockRestore();
      setup.mockRestore();
    }
  });

  it("renders initialization failures while keeping ready rejectable", async ({ task }) => {
    story.init(task);
    const { widget } = recordingWidget();
    const container = document.createElement("div");
    const connect = vi.spyOn(App.prototype, "connect").mockRejectedValue(new Error("no host"));

    try {
      const bridge = runBridge({ widget, container });
      await expect(bridge.ready).rejects.toThrow("no host");
      expect(container.getAttribute("data-mountly-mcp-state")).toBe("error");
      expect(container.querySelector("[data-mountly-mcp-error]")?.textContent).toContain("no host");
    } finally {
      connect.mockRestore();
    }
  });
});

describe("useRequestDisplayMode — ui/request-display-mode", () => {
  function renderWithHost(hostContext: McpUiHostContext) {
    const requestDisplayMode = vi.fn<
      ({ mode }: { mode: McpUiDisplayMode }) => Promise<{ mode: McpUiDisplayMode }>
    >(async ({ mode }) => ({ mode }));
    const app = { requestDisplayMode } as never;
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(McpContext.Provider, { value: { app, hostContext } }, children);
    const { result } = renderHook(() => useRequestDisplayMode(), { wrapper });
    return { request: result.current, requestDisplayMode };
  }

  it("never asks for a mode the host didn't advertise", async ({ task }) => {
    story.init(task);
    story.given("a host offering inline only");
    const { request, requestDisplayMode } = renderWithHost({
      displayMode: "inline",
      availableDisplayModes: ["inline"],
    });

    story.when("the view asks for fullscreen");
    const mode = await request("fullscreen");

    story.then("no request is sent and the current mode comes back unchanged");
    expect(requestDisplayMode).not.toHaveBeenCalled();
    expect(mode).toBe("inline");
  });

  it("requests an advertised mode and returns what the host applied", async ({ task }) => {
    story.init(task);
    const { request, requestDisplayMode } = renderWithHost({
      displayMode: "inline",
      availableDisplayModes: ["inline", "fullscreen"],
    });

    const mode = await request("fullscreen");

    expect(requestDisplayMode).toHaveBeenCalledWith({ mode: "fullscreen" });
    expect(mode).toBe("fullscreen");
  });
});

describe("framework entry points — guardrails", () => {
  it("tells you what you did wrong when composables run outside a widget", ({ task }) => {
    story.init(task, { tags: ["mcp", "vue"] });

    story.then("the error names the wrapper you forgot, not the missing context");
    // Rendering claims for the Vue and Svelte entry points live in the
    // component tier (real Chromium, real compiler). This is pure logic, so it
    // stays here where it costs nothing.
    // Vue composables run outside a component; React hooks must be rendered,
    // or React's own "invalid hook call" fires before the guardrail does.
    expect(() => useVueToolResult()).toThrow(/createMcpWidget/);
    expect(() => renderHook(() => useReactToolResult())).toThrow(/createMcpWidget/);
  });
});
