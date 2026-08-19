// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { story } from "executable-stories-vitest";
import { describe, expect, it, vi } from "vite-plus/test";
import { App } from "../packages/mcp-apps/src/bridge/index";
import { buildAppHtml, useJsonRenderApp } from "../packages/mcp-apps/src/json-render/app";

describe("buildAppHtml", () => {
  it("builds a self-contained HTML document with escaped script content", ({ task }) => {
    story.init(task);
    const html = buildAppHtml({
      title: "Dashboard",
      js: 'console.log("</script><div>bad</div>")',
      css: "body { color: red; }",
    });
    expect(html).toContain("<title>Dashboard</title>");
    expect(html).toContain("<style>body { color: red; }</style>");
    expect(html).toContain("<\\/script>");
  });
});

describe("useJsonRenderApp", () => {
  it("connects, accepts tool results, and exposes callServerTool", async ({ task }) => {
    story.init(task);
    const connectSpy = vi.spyOn(App.prototype, "connect").mockResolvedValue(undefined as never);
    const closeSpy = vi.spyOn(App.prototype, "close").mockResolvedValue(undefined as never);
    const callSpy = vi.spyOn(App.prototype, "callServerTool").mockResolvedValue({
      structuredContent: {
        spec: {
          root: "root",
          elements: { root: { type: "Text", props: { text: "Server spec" } } },
        },
      },
    } as never);

    const { result, unmount } = renderHook(() =>
      useJsonRenderApp({
        name: "json-render-test",
        version: "1.0.0",
      }),
    );

    await waitFor(() => expect(result.current.connecting).toBe(false));
    expect(result.current.connected).toBe(true);
    expect(connectSpy).toHaveBeenCalledTimes(1);

    await result.current.callServerTool("render_ui", { prompt: "hello" });
    expect(callSpy).toHaveBeenCalledWith({ name: "render_ui", arguments: { prompt: "hello" } });
    await waitFor(() => expect(result.current.spec?.root).toBe("root"));

    unmount();
    expect(closeSpy).toHaveBeenCalled();
  });

  it("reads specs from an @json-render/mcp server's text wire format", async ({ task }) => {
    story.init(task);
    vi.spyOn(App.prototype, "connect").mockResolvedValue(undefined as never);
    vi.spyOn(App.prototype, "close").mockResolvedValue(undefined as never);
    // `@json-render/mcp` returns the spec as JSON in `content[0].text` with no
    // `structuredContent` at all. Mountly's hook must still render it.
    vi.spyOn(App.prototype, "callServerTool").mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            root: "root",
            elements: { root: { type: "Text", props: { text: "Upstream spec" }, children: [] } },
          }),
        },
      ],
    } as never);

    const { result } = renderHook(() =>
      useJsonRenderApp({ name: "json-render-test", version: "1.0.0" }),
    );
    await waitFor(() => expect(result.current.connecting).toBe(false));

    await result.current.callServerTool("render-ui", { spec: {} });
    await waitFor(() => expect(result.current.spec?.root).toBe("root"));
    expect(result.current.loading).toBe(false);
  });
});
