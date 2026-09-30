// @vitest-environment jsdom
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { renderHook } from "@testing-library/react";
import { OpenAIExtensions as OfficialAppExtensions } from "@openai/mcp-extensions/app";
import { OpenAIExtensions as OfficialServerExtensions } from "@openai/mcp-extensions/server";
import { story } from "executable-stories-vitest";
import { createElement, type ReactNode } from "react";
import { describe, expect, it } from "vite-plus/test";
import { App } from "../packages/mcp-apps/src/bridge/index";
import { buildMcpResource } from "../packages/mcp-apps/src/build/index";
import { emitMeta } from "../packages/mcp-apps/src/build/emit-meta";
import { McpContext } from "../packages/mcp-apps/src/react/context";
import type { McpContextValue } from "../packages/mcp-apps/src/react/context";
import {
  EXTENSION_ID,
  registerMcpApps,
  RESOURCE_MIME_TYPE,
} from "../packages/mcp-apps/src/server/index";
import {
  enableOpenAiExtensions,
  openaiUiToolMeta,
} from "../packages/mcp-apps/src/openai/server";

const packageRoot = join(process.cwd(), "packages/mcp-apps");
const srcRoot = join(packageRoot, "src");

describe("OpenAI MCP Extensions — official imports", () => {
  it("server and react helpers import @openai/mcp-extensions", ({ task }) => {
    story.init(task, { tags: ["mcp", "openai"] });

    story.given("mountly openai server helper and react openai hook source");
    const serverSrc = readFileSync(join(srcRoot, "openai/server.ts"), "utf8");
    const hooksSrc = readFileSync(join(srcRoot, "react/openai-extensions.ts"), "utf8");

    story.then("both import the official package subpaths");
    expect(serverSrc).toContain('from "@openai/mcp-extensions/server"');
    expect(hooksSrc).toContain('from "@openai/mcp-extensions/app"');
    expect(serverSrc).not.toMatch(/class OpenAIExtensions/);
    expect(hooksSrc).not.toMatch(/class OpenAIExtensions/);
  });
});

describe("emitMeta openai/ui", () => {
  it("writes openai/ui into the resource declaration when openaiUi is set", ({ task }) => {
    story.init(task, { tags: ["mcp", "openai"] });

    story.given("emitMeta with ChatGPT resource display metadata");
    const result = emitMeta({
      uri: "ui://parts/library",
      name: "parts_library",
      openaiUi: {
        preferredDisplayMode: "fullscreen",
        availableDisplayModes: ["inline", "fullscreen"],
      },
    });

    story.then("the sidecar carries _meta['openai/ui']");
    expect(result._meta["openai/ui"]).toEqual({
      preferredDisplayMode: "fullscreen",
      availableDisplayModes: ["inline", "fullscreen"],
    });
  });
});

describe("registerMcpApps with OpenAI metadata", () => {
  it("preserves openai/ui on tools and resources over the wire", async ({ task }) => {
    story.init(task, { tags: ["mcp", "openai", "server"] });

    const dir = mkdtempSync(join(tmpdir(), "mountly-mcp-openai-"));
    const entry = join(dir, "view.js");
    const bridgeRuntime = join(dir, "bridge.js");
    const out = join(dir, "library.html");
    writeFileSync(entry, "globalThis.__mountlyMcpView__ = { mount(){}, unmount(){} };", "utf8");
    writeFileSync(bridgeRuntime, "/* bridge */", "utf8");

    story.given("a View built with openaiUi resource metadata");
    const built = await buildMcpResource({
      entry,
      uri: "ui://parts/library",
      name: "parts_library",
      output: out,
      bridgeRuntimePath: bridgeRuntime,
      openaiUi: {
        preferredDisplayMode: "fullscreen",
        availableDisplayModes: ["inline", "fullscreen"],
      },
    });
    expect(built.declaration._meta["openai/ui"]?.preferredDisplayMode).toBe("fullscreen");

    const packageRequire = createRequire(join(packageRoot, "package.json"));
    const sdk = (path: string) => pathToFileURL(packageRequire.resolve(path)).href;
    const [{ Client }, { InMemoryTransport }, { McpServer }] = await Promise.all([
      import(sdk("@modelcontextprotocol/sdk/client/index.js")),
      import(sdk("@modelcontextprotocol/sdk/inMemory.js")),
      import(sdk("@modelcontextprotocol/sdk/server/mcp.js")),
    ]);

    story.when("registerMcpApps installs the View with a global entrypoint tool");
    const server = new McpServer(
      { name: "parts-server", version: "1.0.0" },
      { capabilities: { tools: {}, resources: {} } },
    );
    const extensions = enableOpenAiExtensions(server);
    expect(extensions).toBeInstanceOf(OfficialServerExtensions);
    expect(extensions.settings).toBeDefined();
    expect(extensions.mentions).toBeDefined();

    await registerMcpApps(server, {
      views: [{ artifact: built.artifact }],
      tools: [
        {
          name: "parts.library",
          resourceUri: built.artifact.uri,
          config: {
            title: "Parts Library",
            inputSchema: {},
            _meta: {
              ...openaiUiToolMeta({
                entrypoints: [{ type: "global" }],
              }),
            },
          },
          handler: async () => ({ structuredContent: { items: [] } }),
        },
      ],
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "openai-test", version: "1.0.0" }, {
      capabilities: {
        extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } },
      },
    } as never);
    await client.connect(clientTransport);

    story.then("tools/list carries _meta['openai/ui'].entrypoints");
    const tools = await client.listTools();
    const tool = tools.tools.find((t: { name: string }) => t.name === "parts.library") as {
      _meta?: { ui?: { resourceUri?: string }; "openai/ui"?: { entrypoints?: unknown[] } };
    };
    expect(tool._meta?.ui?.resourceUri).toBe("ui://parts/library");
    expect(tool._meta?.["openai/ui"]?.entrypoints).toEqual([{ type: "global" }]);

    story.then("resources/read carries _meta['openai/ui'] on the content");
    const resource = await client.readResource({ uri: "ui://parts/library" });
    const content = resource.contents[0] as {
      _meta?: { "openai/ui"?: { preferredDisplayMode?: string } };
    };
    expect(content._meta?.["openai/ui"]?.preferredDisplayMode).toBe("fullscreen");

    await client.close();
    await server.close();
    rmSync(dir, { recursive: true });
  });
});

describe("useOpenAIExtensions", () => {
  it("returns an official OpenAIExtensions instance for the View App", async ({ task }) => {
    story.init(task, { tags: ["mcp", "openai", "react"] });

    story.given("useOpenAIExtensions inside a createMcpView context");
    const { useOpenAIExtensions } = await import(
      "../packages/mcp-apps/src/react/openai-extensions"
    );
    const app = new App({ name: "test", version: "0" });
    const value: McpContextValue = { app };
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(McpContext.Provider, { value }, children);

    story.when("the hook runs");
    const { result, rerender } = renderHook(() => useOpenAIExtensions(), { wrapper });

    story.then("it is an official OpenAIExtensions and stable across renders");
    expect(result.current).toBeInstanceOf(OfficialAppExtensions);
    expect(result.current.deepLink).toBeDefined();
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("throws outside createMcpView", async ({ task }) => {
    story.init(task, { tags: ["mcp", "openai", "react"] });
    const { useOpenAIExtensions } = await import(
      "../packages/mcp-apps/src/react/openai-extensions"
    );
    expect(() => renderHook(() => useOpenAIExtensions())).toThrow(/createMcpView/);
  });
});
