import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { story } from "executable-stories-vitest";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { buildMcpResource } from "../packages/mcp-apps/src/build/index";
import {
  createMcpAppServer,
  EXTENSION_ID,
  registerMcpApps,
  RESOURCE_MIME_TYPE,
} from "../packages/mcp-apps/src/server/index";

describe("createMcpAppServer", () => {
  it("installs Views and linked tools into an application-owned MCP server", async ({ task }) => {
    story.init(task, { tags: ["mcp", "server", "composition"] });
    const dir = mkdtempSync(join(tmpdir(), "mountly-mcp-register-"));
    const entry = join(dir, "widget.js");
    const bridgeRuntime = join(dir, "bridge.js");
    const out = join(dir, "weather.html");
    writeFileSync(entry, "globalThis.__mountlyMcpWidget__ = { mount(){}, unmount(){} };", "utf8");
    writeFileSync(bridgeRuntime, "/* bridge */", "utf8");
    const built = await buildMcpResource({
      entry,
      uri: "ui://weather/dashboard",
      name: "weather_dashboard",
      output: out,
      bridgeRuntimePath: bridgeRuntime,
    });

    story.given("an existing server that already owns ordinary tools and deployment");
    const packageRequire = createRequire(join(process.cwd(), "packages/mcp-apps/package.json"));
    const sdk = (path: string) => pathToFileURL(packageRequire.resolve(path)).href;
    const [{ Client }, { InMemoryTransport }, { McpServer }] = await Promise.all([
      import(sdk("@modelcontextprotocol/sdk/client/index.js")),
      import(sdk("@modelcontextprotocol/sdk/inMemory.js")),
      import(sdk("@modelcontextprotocol/sdk/server/mcp.js")),
    ]);
    const server = new McpServer(
      { name: "application-server", version: "1.0.0" },
      { capabilities: { tools: {}, resources: {} } },
    );
    server.registerTool("health", { inputSchema: {} }, async () => ({
      content: [{ type: "text", text: "ok" }],
    }));

    story.when("Mountly installs one View and two independently declared linked tools");
    await registerMcpApps(server, {
      views: [{ artifact: built.artifact }],
      tools: [
        {
          name: "get_weather",
          resourceUri: built.artifact.uri,
          config: { title: "Weather", inputSchema: {} },
          handler: async () => ({ structuredContent: { temperature: 72 } }),
        },
        {
          name: "refresh_weather",
          resourceUri: built.artifact.uri,
          visibility: "app",
          config: { inputSchema: {} },
          handler: async () => ({ structuredContent: { refreshed: true } }),
        },
      ],
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "composition-test", version: "1.0.0" }, {
      capabilities: {
        extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } },
      },
    } as never);
    await client.connect(clientTransport);

    story.then("the application's tool remains and both app tools link to the same View");
    const tools = await client.listTools();
    expect(tools.tools.map((tool: { name: string }) => tool.name)).toEqual(
      expect.arrayContaining(["health", "get_weather", "refresh_weather"]),
    );
    for (const name of ["get_weather", "refresh_weather"]) {
      const tool = tools.tools.find((candidate: { name: string }) => candidate.name === name) as {
        _meta?: { ui?: { resourceUri?: string } };
      };
      expect(tool._meta?.ui?.resourceUri).toBe("ui://weather/dashboard");
    }

    await client.close();
    await server.close();
    rmSync(dir, { recursive: true });
  });

  it("registers a widget's html and tool, then handles a tools/call", async ({ task }) => {
    story.init(task);
    const dir = mkdtempSync(join(tmpdir(), "mountly-mcp-server-"));
    const entry = join(dir, "widget.js");
    const bridgeRuntime = join(dir, "bridge.js");
    const out = join(dir, "weather.html");
    writeFileSync(entry, "globalThis.__mountlyMcpWidget__ = { mount(){}, unmount(){} };", "utf8");
    writeFileSync(bridgeRuntime, "/* bridge */", "utf8");

    const built = await buildMcpResource({
      entry,
      uri: "ui://weather-server/dashboard",
      name: "weather_dashboard",
      output: out,
      bridgeRuntimePath: bridgeRuntime,
    });

    story.given("a server with one widget+tool registered");
    const server = createMcpAppServer({
      name: "weather-server",
      version: "1.0.0",
      widgets: [
        {
          uri: "ui://weather-server/dashboard",
          htmlPath: built.htmlPath,
          tool: {
            name: "get_weather",
            description: "Get weather",
            inputSchema: {
              type: "object",
              properties: { location: { type: "string" } },
              required: ["location"],
              additionalProperties: false,
            },
            outputSchema: {
              type: "object",
              properties: {
                temperature: { type: "number" },
                location: { type: "string" },
              },
              required: ["temperature", "location"],
              additionalProperties: false,
            },
            handler: async (args: unknown) => {
              const { location } = args as { location: string };
              return { structuredContent: { temperature: 72, location } };
            },
          },
        },
      ],
    });

    story.when("the in-process client calls tools/list, resources/list, and the tool");
    const { client } = await server.connectInProcess();

    const tools = await client.listTools();
    story.then("the tool is registered with _meta.ui.resourceUri pointing at the ui:// URI");
    const tool = tools.tools.find((t) => t.name === "get_weather");
    expect(tool).toBeDefined();
    expect((tool as { _meta?: { ui?: { resourceUri?: string } } })._meta?.ui?.resourceUri).toBe(
      "ui://weather-server/dashboard",
    );

    const resources = await client.listResources();
    story.then("the ui:// resource is present");
    expect(
      resources.resources.find((r) => r.uri === "ui://weather-server/dashboard"),
    ).toBeDefined();

    story.when("the tool is called");
    const result = await client.callTool({
      name: "get_weather",
      arguments: { location: "SF" },
    });

    story.then("the handler ran and returned structured content");
    expect(
      (result as { structuredContent?: { temperature?: number; location?: string } })
        .structuredContent,
    ).toEqual({
      temperature: 72,
      location: "SF",
    });

    await server.close();
    rmSync(dir, { recursive: true });
  });

  it("throws at boot when registration uri doesn't match sidecar", async ({ task }) => {
    story.init(task);
    const dir = mkdtempSync(join(tmpdir(), "mountly-mcp-server-mismatch-"));
    const entry = join(dir, "widget.js");
    const bridgeRuntime = join(dir, "bridge.js");
    const out = join(dir, "weather.html");
    writeFileSync(entry, "globalThis.__mountlyMcpWidget__ = { mount(){}, unmount(){} };", "utf8");
    writeFileSync(bridgeRuntime, "/* bridge */", "utf8");

    await buildMcpResource({
      entry,
      uri: "ui://weather-server/dashboard",
      name: "weather_dashboard",
      output: out,
      bridgeRuntimePath: bridgeRuntime,
    });
    story.given("a server registering the widget under the WRONG uri");
    const server = createMcpAppServer({
      name: "weather-server",
      version: "1.0.0",
      widgets: [
        {
          uri: "ui://wrong/path",
          htmlPath: out,
          tool: {
            name: "get_weather",
            inputSchema: {},
            handler: async () => ({ structuredContent: {} }),
          },
        },
      ],
    });

    story.then("connectInProcess() rejects with a clear mismatch error");
    await expect(server.connectInProcess()).rejects.toThrow(
      /registration uri 'ui:\/\/wrong\/path' does not match sidecar uri 'ui:\/\/weather-server\/dashboard'/,
    );

    rmSync(dir, { recursive: true });
  });

  it("throws at boot when registration uri does not use ui://", async ({ task }) => {
    story.init(task);
    const dir = mkdtempSync(join(tmpdir(), "mountly-mcp-server-invalid-scheme-"));
    const entry = join(dir, "widget.js");
    const bridgeRuntime = join(dir, "bridge.js");
    const out = join(dir, "weather.html");
    const outAdmin = join(dir, "weather-admin.html");
    writeFileSync(entry, "globalThis.__mountlyMcpWidget__ = { mount(){}, unmount(){} };", "utf8");
    writeFileSync(bridgeRuntime, "/* bridge */", "utf8");

    await buildMcpResource({
      entry,
      uri: "ui://weather-server/dashboard",
      name: "weather_dashboard",
      output: out,
      bridgeRuntimePath: bridgeRuntime,
    });
    await buildMcpResource({
      entry,
      uri: "ui://weather-server/dashboard-admin",
      name: "weather_dashboard_admin",
      output: outAdmin,
      bridgeRuntimePath: bridgeRuntime,
    });

    const server = createMcpAppServer({
      name: "weather-server",
      version: "1.0.0",
      widgets: [
        {
          uri: "https://weather-server/dashboard",
          htmlPath: out,
          tool: {
            name: "get_weather",
            inputSchema: {},
            handler: async () => ({ structuredContent: {} }),
          },
        },
      ],
    });

    await expect(server.connectInProcess()).rejects.toThrow(
      /registration uri must use the 'ui:\/\/' scheme/i,
    );

    rmSync(dir, { recursive: true });
  });

  it("throws at boot when sidecar mimeType is not MCP Apps HTML", async ({ task }) => {
    story.init(task);
    const dir = mkdtempSync(join(tmpdir(), "mountly-mcp-server-invalid-mime-"));
    const entry = join(dir, "widget.js");
    const bridgeRuntime = join(dir, "bridge.js");
    const out = join(dir, "weather.html");
    writeFileSync(entry, "globalThis.__mountlyMcpWidget__ = { mount(){}, unmount(){} };", "utf8");
    writeFileSync(bridgeRuntime, "/* bridge */", "utf8");

    await buildMcpResource({
      entry,
      uri: "ui://weather-server/dashboard",
      name: "weather_dashboard",
      output: out,
      bridgeRuntimePath: bridgeRuntime,
    });

    const metaPath = `${out}.meta.json`;
    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as { mimeType: string };
    meta.mimeType = "text/html";
    writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");

    const server = createMcpAppServer({
      name: "weather-server",
      version: "1.0.0",
      widgets: [
        {
          uri: "ui://weather-server/dashboard",
          htmlPath: out,
          tool: {
            name: "get_weather",
            inputSchema: {},
            handler: async () => ({ structuredContent: {} }),
          },
        },
      ],
    });

    await expect(server.connectInProcess()).rejects.toThrow(
      /sidecar mimeType must be 'text\/html;profile=mcp-app'/i,
    );

    rmSync(dir, { recursive: true });
  });

  it("throws at boot when sidecar protocolVersion is not current", async ({ task }) => {
    story.init(task);
    const dir = mkdtempSync(join(tmpdir(), "mountly-mcp-server-invalid-protocol-"));
    const entry = join(dir, "widget.js");
    const bridgeRuntime = join(dir, "bridge.js");
    const out = join(dir, "weather.html");
    writeFileSync(entry, "globalThis.__mountlyMcpWidget__ = { mount(){}, unmount(){} };", "utf8");
    writeFileSync(bridgeRuntime, "/* bridge */", "utf8");

    await buildMcpResource({
      entry,
      uri: "ui://weather-server/dashboard",
      name: "weather_dashboard",
      output: out,
      bridgeRuntimePath: bridgeRuntime,
    });

    const metaPath = `${out}.meta.json`;
    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as { protocolVersion: string };
    meta.protocolVersion = "2025-01-01";
    writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf8");

    const server = createMcpAppServer({
      name: "weather-server",
      version: "1.0.0",
      widgets: [
        {
          uri: "ui://weather-server/dashboard",
          htmlPath: out,
          tool: {
            name: "get_weather",
            inputSchema: {},
            handler: async () => ({ structuredContent: {} }),
          },
        },
      ],
    });

    await expect(server.connectInProcess()).rejects.toThrow(
      /sidecar protocolVersion must be '2026-01-26'/i,
    );

    rmSync(dir, { recursive: true });
  });

  it("supports multiple tools including app-only visibility metadata", async ({ task }) => {
    story.init(task);
    const dir = mkdtempSync(join(tmpdir(), "mountly-mcp-server-shared-uri-"));
    const entry = join(dir, "widget.js");
    const bridgeRuntime = join(dir, "bridge.js");
    const out = join(dir, "weather.html");
    const outAdmin = join(dir, "weather-admin.html");
    writeFileSync(entry, "globalThis.__mountlyMcpWidget__ = { mount(){}, unmount(){} };", "utf8");
    writeFileSync(bridgeRuntime, "/* bridge */", "utf8");

    await buildMcpResource({
      entry,
      uri: "ui://weather-server/dashboard",
      name: "weather_dashboard",
      output: out,
      bridgeRuntimePath: bridgeRuntime,
    });
    await buildMcpResource({
      entry,
      uri: "ui://weather-server/dashboard-admin",
      name: "weather_dashboard_admin",
      output: outAdmin,
      bridgeRuntimePath: bridgeRuntime,
    });

    const server = createMcpAppServer({
      name: "weather-server",
      version: "1.0.0",
      widgets: [
        {
          uri: "ui://weather-server/dashboard",
          htmlPath: out,
          tool: {
            name: "get_weather",
            // A Zod raw shape can contain JSON-Schema-looking property names;
            // normalization must preserve it rather than converting it again.
            inputSchema: { type: z.string() },
            handler: async () => ({ structuredContent: { mode: "read" } }),
          },
        },
        {
          uri: "ui://weather-server/dashboard-admin",
          htmlPath: outAdmin,
          tool: {
            name: "refresh_weather",
            inputSchema: {},
            visibility: "app",
            handler: async () => ({ structuredContent: { mode: "refresh" } }),
          },
        },
      ],
    });

    const { client } = await server.connectInProcess();
    const tools = await client.listTools();
    expect(tools.tools.some((t) => t.name === "get_weather")).toBe(true);
    const refresh = tools.tools.find((t) => t.name === "refresh_weather");
    expect(refresh).toBeDefined();
    story.then("visibility is emitted as the spec's array form, not a bare string");
    expect(
      (refresh as { _meta?: { ui?: { visibility?: string[] } } })._meta?.ui?.visibility,
    ).toEqual(["app"]);

    const resources = await client.listResources();
    expect(
      resources.resources.filter((r) => r.uri === "ui://weather-server/dashboard").length,
    ).toBe(1);
    expect(
      resources.resources.filter((r) => r.uri === "ui://weather-server/dashboard-admin").length,
    ).toBe(1);

    await server.close();
    rmSync(dir, { recursive: true });
  });

  it("falls back to text-only tools for a host without the MCP Apps extension", async ({
    task,
  }) => {
    story.init(task);
    const dir = mkdtempSync(join(tmpdir(), "mountly-mcp-server-nofallback-"));
    const entry = join(dir, "widget.js");
    const bridgeRuntime = join(dir, "bridge.js");
    const out = join(dir, "weather.html");
    writeFileSync(entry, "globalThis.__mountlyMcpWidget__ = { mount(){}, unmount(){} };", "utf8");
    writeFileSync(bridgeRuntime, "/* bridge */", "utf8");

    const built = await buildMcpResource({
      entry,
      uri: "ui://weather-server/dashboard",
      name: "weather_dashboard",
      output: out,
      bridgeRuntimePath: bridgeRuntime,
    });

    story.given("a server with one model-visible tool and one app-only tool");
    const server = createMcpAppServer({
      name: "weather-server",
      version: "1.0.0",
      widgets: [
        {
          uri: "ui://weather-server/dashboard",
          htmlPath: built.htmlPath,
          tool: {
            name: "get_weather",
            inputSchema: {
              type: "object",
              properties: { location: { type: "string" } },
              required: ["location"],
              additionalProperties: false,
            },
            handler: async () => ({ structuredContent: { temperature: 72 } }),
          },
        },
        {
          uri: "ui://weather-server/dashboard",
          htmlPath: built.htmlPath,
          tool: {
            name: "refresh_weather",
            inputSchema: {},
            visibility: ["app"],
            handler: async () => ({ structuredContent: { refreshed: true } }),
          },
        },
      ],
    });

    story.when("a client connects WITHOUT advertising io.modelcontextprotocol/ui");
    const { client } = await server.connectInProcess({ ui: false });

    story.then("the tool is registered without UI metadata and the ui:// resource is withheld");
    const tools = await client.listTools();
    const tool = tools.tools.find((t) => t.name === "get_weather");
    expect(tool).toBeDefined();
    expect((tool as { _meta?: { ui?: unknown } })._meta?.ui).toBeUndefined();

    story.then("the app-only tool is not exposed — there's no view to call it");
    expect(tools.tools.some((t) => t.name === "refresh_weather")).toBe(false);

    const resources = await client.listResources();
    expect(resources.resources.some((r) => r.uri === "ui://weather-server/dashboard")).toBe(false);

    story.then("the tool still answers, with a text content block for the model");
    const result = (await client.callTool({
      name: "get_weather",
      arguments: { location: "SF" },
    })) as { content?: Array<{ type: string; text?: string }> };
    expect(result.content?.[0]?.type).toBe("text");
    expect(result.content?.[0]?.text).toContain("72");

    await server.close();
    rmSync(dir, { recursive: true });
  });
});
