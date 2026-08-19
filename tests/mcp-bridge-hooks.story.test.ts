// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { story } from "executable-stories-vitest";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { McpContext } from "../packages/mcp-apps/src/react/context";
import type { McpContextValue } from "../packages/mcp-apps/src/react/context";
import { App } from "../packages/mcp-apps/src/bridge/index";

function wrapper(value: McpContextValue) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(McpContext.Provider, { value }, children);
  };
}

function fakeContext(overrides: Partial<McpContextValue> = {}): McpContextValue {
  return {
    app: new App({ name: "test", version: "0" }),
    ...overrides,
  };
}

describe("useUpdateModelContext hook", () => {
  it("returns a function that calls app.updateModelContext", async ({ task }) => {
    story.init(task);

    story.given("useUpdateModelContext imported from react hooks");
    const { useUpdateModelContext } = await import("../packages/mcp-apps/src/react/hooks");

    const ctx = fakeContext();
    const spy = vi.spyOn(ctx.app, "updateModelContext").mockResolvedValue({});

    story.when("the hook is called and the returned function is invoked");
    const { result } = renderHook(() => useUpdateModelContext(), {
      wrapper: wrapper(ctx),
    });

    const content = [{ type: "text" as const, text: "hello" }];
    await result.current({ content });

    story.then("app.updateModelContext is called with the params");
    expect(spy).toHaveBeenCalledWith({ content });
  });
});

describe("useRequestDisplayMode hook (existing)", () => {
  it("is exported from react hooks", async ({ task }) => {
    story.init(task);

    story.given("the react hooks module");
    const mod = await import("../packages/mcp-apps/src/react/hooks");

    story.then("useRequestDisplayMode is exported");
    expect(typeof mod.useRequestDisplayMode).toBe("function");
  });
});
