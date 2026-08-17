import { story } from "executable-stories-vitest";
import { describe, expect, it, vi } from "vite-plus/test";
import type { McpAppArtifact } from "../packages/mcp-apps/src/artifact/index";
import {
  renderMcpAppArtifactWith,
  type ConformanceBrowser,
  type ConformanceHost,
} from "../packages/mcp-apps/src/testing/render-artifact";

const artifact = {
  name: "weather",
  uri: "ui://weather/view",
  htmlPath: "/tmp/weather.html",
  metaPath: "/tmp/weather.html.meta.json",
  declaration: {},
} as McpAppArtifact;

describe("MCP Apps browser conformance lifecycle", () => {
  it("preserves the Chromium launch failure", async ({ task }) => {
    story.init(task, { tags: ["mcp", "conformance", "browser"] });

    const diagnostics = await renderMcpAppArtifactWith(artifact, {
      launchBrowser: async () => {
        throw new Error("Executable doesn't exist; run playwright install chromium");
      },
      startHost: vi.fn<(artifact: McpAppArtifact) => Promise<ConformanceHost>>(),
    });

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "render/unavailable",
        message: expect.stringContaining("playwright install chromium"),
      }),
    ]);
  });

  it("closes Chromium when host startup fails", async ({ task }) => {
    story.init(task, { tags: ["mcp", "conformance", "cleanup"] });
    const close = vi.fn<() => Promise<void>>(async () => undefined);
    const browser = { close } as unknown as ConformanceBrowser;

    const diagnostics = await renderMcpAppArtifactWith(artifact, {
      launchBrowser: async () => browser,
      startHost: async () => {
        throw new Error("address unavailable");
      },
    });

    expect(close).toHaveBeenCalledOnce();
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: "render/failed", message: "address unavailable" }),
    ]);
  });
});
