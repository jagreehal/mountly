import { story } from "executable-stories-vitest";
import { describe, expect, it } from "vite-plus/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";
import {
  createJsonRenderMcpApp,
  registerJsonRenderResource,
  registerJsonRenderTool,
} from "../packages/mcp-apps/src/json-render/mcp";

function createCatalog() {
  return defineCatalog(schema, {
    components: {
      Text: {
        props: z.object({ text: z.string() }),
        description: "Simple text element",
      },
    },
    actions: {},
  });
}

describe("json-render MCP facade", () => {
  it("creates a runnable MCP app server with a json-render tool/resource", async ({ task }) => {
    story.init(task);
    const server = createJsonRenderMcpApp({
      name: "json-render-demo",
      version: "1.0.0",
      catalog: createCatalog(),
      html: "<!doctype html><html><body><div id='root'></div></body></html>",
      tool: { name: "render-ui", resourceUri: "ui://render-ui/view.html" },
    });

    const { client } = await server.connectInProcess();
    const tools = await client.listTools();
    const resources = await client.listResources();
    const tool = tools.tools.find((t) => t.name === "render-ui");

    expect(tool).toBeDefined();
    expect((tool as { _meta?: { ui?: { resourceUri?: string } } })._meta?.ui?.resourceUri).toBe(
      "ui://render-ui/view.html",
    );
    expect(resources.resources.some((r) => r.uri === "ui://render-ui/view.html")).toBe(true);

    // The tool must advertise the catalog, not an empty object schema — this is
    // the whole point of a catalog-driven tool. A model that sees
    // `{"type":"object","properties":{}}` has no idea what it may emit.
    const inputSchema = tool?.inputSchema as {
      properties?: { spec?: { properties?: Record<string, unknown> } };
      required?: string[];
    };
    expect(inputSchema.required).toContain("spec");
    expect(JSON.stringify(inputSchema)).toContain("Text");
    expect(JSON.stringify(inputSchema)).toContain("elements");
    // Catalog prompt drives component selection.
    expect(tool?.description).toContain("AVAILABLE COMPONENTS");

    // No `visible` field — core 0.19's generated catalog schema marks it
    // required, so a strict input gate would reject this ordinary spec.
    const spec = {
      root: "root",
      elements: { root: { type: "Text", props: { text: "Hello" }, children: [] } },
    };
    const result = (await client.callTool({ name: "render-ui", arguments: { spec } })) as {
      structuredContent?: { spec?: unknown };
      content?: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    expect(result.isError).toBeFalsy();

    // Both wire formats, so an iframe built against either `@json-render/mcp`
    // or mountly renders this server unchanged.
    expect(result.structuredContent?.spec).toMatchObject(spec);
    expect(JSON.parse(result.content?.[0]?.text ?? "null")).toMatchObject(spec);

    await client.close();
    await server.close();
  });

  it("registers resource and tool independently on an existing server", async ({ task }) => {
    story.init(task);
    const packageRequire = createRequire(join(process.cwd(), "packages/mcp-apps/package.json"));
    const sdk = (path: string) => pathToFileURL(packageRequire.resolve(path)).href;
    const [{ McpServer }, { Client }, { InMemoryTransport }] = await Promise.all([
      import(sdk("@modelcontextprotocol/sdk/server/mcp.js")),
      import(sdk("@modelcontextprotocol/sdk/client/index.js")),
      import(sdk("@modelcontextprotocol/sdk/inMemory.js")),
    ]);
    const { EXTENSION_ID, RESOURCE_MIME_TYPE } =
      await import("../packages/mcp-apps/src/server/index");
    const server = new McpServer(
      { name: "hosted-server", version: "1.0.0" },
      { capabilities: { resources: {}, tools: {} } },
    );
    server.server.registerCapabilities({
      extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } },
    } as never);

    registerJsonRenderResource(server, {
      resourceUri: "ui://json-render-demo/view.html",
      html: "<!doctype html><html><body>demo</body></html>",
    });
    registerJsonRenderTool(server, {
      catalog: createCatalog(),
      name: "render_json",
      resourceUri: "ui://json-render-demo/view.html",
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "test-client", version: "1.0.0" }, {
      capabilities: { extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } } },
    } as never);
    await client.connect(clientTransport);

    const tools = await client.listTools();
    expect(tools.tools.some((t: { name: string }) => t.name === "render_json")).toBe(true);

    await client.close();
    await server.close();
  });

  it("rejects non-ui resource URIs", async ({ task }) => {
    story.init(task);
    const packageRequire = createRequire(join(process.cwd(), "packages/mcp-apps/package.json"));
    const sdk = (path: string) => pathToFileURL(packageRequire.resolve(path)).href;
    const { McpServer } = await import(sdk("@modelcontextprotocol/sdk/server/mcp.js"));
    const server = new McpServer(
      { name: "uri-check", version: "1.0.0" },
      { capabilities: { resources: {}, tools: {} } },
    );

    expect(() =>
      registerJsonRenderResource(server, {
        resourceUri: "https://example.com/view.html",
        html: "<html></html>",
      }),
    ).toThrow("resourceUri must use 'ui://' scheme");
  });
});
