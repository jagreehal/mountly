import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  EXTENSION_ID,
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import type { McpResourceDeclaration, McpToolVisibility } from "mountly-mcp";
import { MCP_APPS_PROTOCOL_VERSION } from "mountly-mcp";

/**
 * A tool registration tied to a widget. The `handler` runs on `tools/call`
 * and its result becomes the `ui/notifications/tool-result` the host forwards
 * to the iframe.
 */
export interface McpWidgetTool<Args = unknown> {
  name: string;
  description?: string;
  /** JSON Schema for the tool's input. */
  inputSchema: object;
  /** Output schema (optional but recommended — gates the structuredContent shape). */
  outputSchema?: object;
  /** ["model", "app"] by default; pass ["app"] for app-only, hidden-from-agent tools. */
  visibility?: McpToolVisibility;
  handler: (args: Args) => Promise<McpWidgetToolResult>;
}

/** Result returned from a widget's handler. Matches MCP's `CallToolResult` subset used by Apps. */
export interface McpWidgetToolResult {
  structuredContent?: unknown;
  content?: ReadonlyArray<{ type: string; [key: string]: unknown }>;
  isError?: boolean;
}

/** A widget registration: pairs a built HTML resource (from buildMcpResource) with its driving tool. */
export interface McpWidgetRegistration {
  /** The `ui://...` URI; MUST match the sidecar `_meta.uri`. */
  uri: string;
  /** Path to the built `.html` file. Its `.meta.json` sidecar is read alongside. */
  htmlPath: string;
  /** The tool wired up to this widget. */
  tool: McpWidgetTool;
}

export interface CreateMcpAppServerOptions {
  name: string;
  version: string;
  widgets: ReadonlyArray<McpWidgetRegistration>;
}

interface LoadedWidget {
  uri: string;
  html: string;
  meta: McpResourceDeclaration;
  tool: McpWidgetTool;
}

function assertUiUri(uri: string, context: string): void {
  if (!uri.startsWith("ui://")) {
    throw new Error(
      `mountly-mcp-server: ${context} must use the 'ui://' scheme (received '${uri}')`,
    );
  }
}

function assertSidecarCompliance(meta: McpResourceDeclaration, htmlPath: string): void {
  if (meta.mimeType !== RESOURCE_MIME_TYPE) {
    throw new Error(
      `mountly-mcp-server: sidecar mimeType must be '${RESOURCE_MIME_TYPE}' (received '${meta.mimeType}') for ${htmlPath}`,
    );
  }
  if (meta.protocolVersion !== MCP_APPS_PROTOCOL_VERSION) {
    throw new Error(
      `mountly-mcp-server: sidecar protocolVersion must be '${MCP_APPS_PROTOCOL_VERSION}' (received '${meta.protocolVersion}') for ${htmlPath}`,
    );
  }
}

async function loadWidget(reg: McpWidgetRegistration): Promise<LoadedWidget> {
  assertUiUri(reg.uri, "registration uri");
  const [html, metaRaw] = await Promise.all([
    readFile(reg.htmlPath, "utf8"),
    readFile(`${reg.htmlPath}.meta.json`, "utf8"),
  ]);
  const meta = JSON.parse(metaRaw) as McpResourceDeclaration;
  assertSidecarCompliance(meta, reg.htmlPath);
  assertUiUri(meta.uri, "sidecar uri");
  if (meta.uri !== reg.uri) {
    throw new Error(
      `mountly-mcp-server: registration uri '${reg.uri}' does not match sidecar uri '${meta.uri}' for ${reg.htmlPath}`,
    );
  }
  return { uri: reg.uri, html, meta, tool: reg.tool };
}

export interface RunningMcpAppServer {
  /**
   * Test/internal helper: spins up an in-process MCP client linked to this
   * server via {@link InMemoryTransport}. Use in tests to drive the server
   * without stdio/HTTP transports.
   */
  connectInProcess(): Promise<{ client: Client }>;
  /** Connect to a real transport (e.g. StdioServerTransport, SSEServerTransport). */
  listen(transport: Transport): Promise<void>;
  /** Close the underlying server. */
  close(): Promise<void>;
}

function buildServer(
  options: CreateMcpAppServerOptions,
  widgets: ReadonlyArray<LoadedWidget>,
): McpServer {
  const server = new McpServer(
    { name: options.name, version: options.version },
    {
      capabilities: { resources: {}, tools: {} },
      // Advertise MCP Apps extension support per SEP-1724 / SEP-1865.
      extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } },
    } as never, // `extensions` is pending in the SDK types; pass-through.
  );

  const registeredResources = new Set<string>();
  for (const w of widgets) {
    if (!registeredResources.has(w.uri)) {
      registerAppResource(
        server,
        w.meta.name,
        w.uri,
        {
          mimeType: w.meta.mimeType,
          description: w.meta.description,
          _meta: { ui: w.meta._meta.ui },
        },
        async () => ({
          contents: [
            {
              uri: w.uri,
              mimeType: w.meta.mimeType,
              text: w.html,
              _meta: { ui: w.meta._meta.ui },
            },
          ],
        }),
      );
      registeredResources.add(w.uri);
    }

    const toolMeta: { ui: { resourceUri: string; visibility?: McpToolVisibility } } = {
      ui: { resourceUri: w.uri },
    };
    if (w.tool.visibility) toolMeta.ui.visibility = w.tool.visibility;

    registerAppTool(
      server,
      w.tool.name,
      {
        description: w.tool.description,
        // Pass JSON Schema through as-is; ext-apps accepts StandardSchemaWithJSON
        // or ZodRawShapeCompat — a plain JSON Schema satisfies neither type-wise
        // but the runtime accepts it. Cast to keep types honest at the boundary.
        inputSchema: w.tool.inputSchema as never,
        outputSchema: w.tool.outputSchema as never,
        _meta: toolMeta,
      },
      (async (args: unknown) => {
        const result = await w.tool.handler(args as never);
        return result as never;
      }) as never,
    );
  }

  return server;
}

export function createMcpAppServer(
  options: CreateMcpAppServerOptions,
): RunningMcpAppServer {
  const widgets: LoadedWidget[] = [];
  let server: McpServer | undefined;
  let loaded = false;

  async function ensureLoaded(): Promise<void> {
    if (loaded) return;
    for (const reg of options.widgets) {
      widgets.push(await loadWidget(reg));
    }
    loaded = true;
  }

  return {
    async connectInProcess() {
      await ensureLoaded();
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      server = buildServer(options, widgets);
      await server.connect(serverTransport);
      const client = new Client({
        name: `${options.name}-inprocess-client`,
        version: options.version,
      });
      await client.connect(clientTransport);
      return { client };
    },
    async listen(transport) {
      await ensureLoaded();
      server = buildServer(options, widgets);
      await server.connect(transport);
    },
    async close() {
      await server?.close();
    },
  };
}

export { EXTENSION_ID, RESOURCE_MIME_TYPE };
