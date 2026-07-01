import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { story } from "executable-stories-vitest";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import { buildMcpResource } from "../packages/adapters/mountly-mcp/src/build/index";
import { createMcpAppServer } from "../packages/adapters/mountly-mcp/src/server/index";

describe("createMcpAppServer", () => {
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
            inputSchema: { location: z.string() },
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
            inputSchema: {},
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
    expect((refresh as { _meta?: { ui?: { visibility?: string } } })._meta?.ui?.visibility).toBe(
      "app",
    );

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
});
