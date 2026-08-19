import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  EXTENSION_ID,
  RESOURCE_MIME_TYPE,
  getUiCapability,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import type { McpUiToolVisibility } from "@modelcontextprotocol/ext-apps";
import type { Catalog } from "@json-render/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { RunningMcpAppServer } from "../server/index.js";

export interface JsonRenderToolOptions {
  /** MCP tool name. */
  name?: string;
  /** Human-readable tool title. */
  title?: string;
  /** Tool description for model selection. */
  description?: string;
  /** ui:// resource linked to this tool. */
  resourceUri?: string;
  /** Tool visibility in MCP Apps hosts. */
  visibility?: McpUiToolVisibility | ReadonlyArray<McpUiToolVisibility>;
  /** Optional explicit input schema override. */
  inputSchema?: object;
}

export interface RegisterJsonRenderResourceOptions {
  resourceUri?: string;
  name?: string;
  description?: string;
  html: string;
}

export interface RegisterJsonRenderToolOptions {
  catalog: Catalog;
  name?: string;
  title?: string;
  description?: string;
  resourceUri?: string;
  visibility?: McpUiToolVisibility | ReadonlyArray<McpUiToolVisibility>;
  inputSchema?: object;
}

export interface CreateJsonRenderMcpAppOptions {
  name: string;
  version: string;
  catalog: Catalog;
  html: string;
  tool?: JsonRenderToolOptions;
}

const DEFAULT_RESOURCE_URI = "ui://json-render/view.html";
const DEFAULT_TOOL_NAME = "render_ui";

/**
 * A spec shape loose enough to survive real model output. `@json-render/core`
 * generates a *strict* catalog schema: as of 0.20 `visible` is optional, but
 * `children` is still required on every element — the omission models make on
 * roughly a third of first attempts. Gating tool input on the strict schema
 * alone turns that into an SDK-level rejection before the handler can repair
 * anything. (`@json-render/mcp` passes the strict schema straight through and
 * inherits that failure.) Delete this branch once `children` is optional too.
 */
const LOOSE_SPEC_SCHEMA = z.looseObject({
  root: z.string(),
  elements: z.record(z.string(), z.unknown()),
  state: z.unknown().optional(),
});

/**
 * The tool's input shape, matching `@json-render/mcp`: a single `spec`
 * argument typed by the catalog. Must be a Zod *raw shape* (a plain object of
 * Zod types) — handing the SDK a bare `ZodType` yields an empty
 * `{ type: "object", properties: {} }` schema, which tells the model nothing.
 */
function resolveInputSchema(options: RegisterJsonRenderToolOptions): object {
  if (options.inputSchema) return options.inputSchema;
  const { catalog } = options;
  if (typeof catalog.zodSchema !== "function") {
    return { spec: LOOSE_SPEC_SCHEMA };
  }
  // The catalog branch documents the exact component vocabulary to the model;
  // the loose branch keeps a near-miss spec from being rejected outright. The
  // handler still validates against the catalog and reports what it repaired.
  return { spec: z.union([catalog.zodSchema(), LOOSE_SPEC_SCHEMA]) };
}

/**
 * Catalogs carry their own model-facing prompt (component list, prop shapes,
 * authoring rules). Appending it is what makes the tool usable by a model —
 * a bare one-line description leaves it guessing at the component vocabulary.
 */
function resolveDescription(options: RegisterJsonRenderToolOptions): string {
  if (options.description) return options.description;
  const base =
    "Render an interactive UI. The `spec` argument must be a json-render spec conforming to the catalog.";
  const prompt = typeof options.catalog.prompt === "function" ? options.catalog.prompt() : "";
  return prompt ? `${base}\n\n${prompt}` : base;
}

/**
 * Unwrap the tool arguments. The declared shape is `{ spec }`, but a spec
 * passed at the top level is accepted too — hosts and hand-written clients do
 * both, and a spec is identifiable by its `root`/`elements` pair.
 */
function pickToolInputSpec(args: unknown): unknown {
  if (!args || typeof args !== "object") return args;
  const record = args as Record<string, unknown>;
  if (record.spec !== undefined) return record.spec;
  return record;
}

function assertUiUri(uri: string): void {
  if (!uri.startsWith("ui://")) {
    throw new Error(
      `mountly-mcp/json-render: resourceUri must use 'ui://' scheme (received '${uri}')`,
    );
  }
}

export function registerJsonRenderResource(
  server: McpServer,
  options: RegisterJsonRenderResourceOptions,
): { uri: string; remove(): void } {
  const uri = options.resourceUri ?? DEFAULT_RESOURCE_URI;
  assertUiUri(uri);
  const name = options.name ?? "json_render_ui";
  const description = options.description ?? "Interactive json-render MCP App view.";
  const registered = registerAppResource(
    server,
    name,
    uri,
    {
      mimeType: RESOURCE_MIME_TYPE,
      description,
      _meta: {
        ui: {
          prefersBorder: true,
          csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
        },
      },
    },
    async () => ({
      contents: [
        {
          uri,
          mimeType: RESOURCE_MIME_TYPE,
          text: options.html,
          _meta: {
            ui: {
              prefersBorder: true,
              csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
            },
          },
        },
      ],
    }),
  );
  return { uri, remove: () => registered.remove() };
}

export function registerJsonRenderTool(
  server: McpServer,
  options: RegisterJsonRenderToolOptions,
): { name: string; remove(): void } {
  const name = options.name ?? DEFAULT_TOOL_NAME;
  const resourceUri = options.resourceUri ?? DEFAULT_RESOURCE_URI;
  assertUiUri(resourceUri);
  const description = resolveDescription(options);
  const visibility =
    options.visibility === undefined
      ? ["model", "app"]
      : typeof options.visibility === "string"
        ? [options.visibility]
        : [...options.visibility];

  const registered = registerAppTool(
    server,
    name,
    {
      title: options.title,
      description,
      inputSchema: resolveInputSchema(options) as never,
      _meta: {
        ui: {
          resourceUri,
          visibility,
        },
      },
    } as never,
    (async (args: unknown) => {
      const spec = pickToolInputSpec(args);
      // Repair-tolerant, like `@json-render/mcp`: a spec that fails catalog
      // validation is still rendered rather than dropped — the renderer skips
      // what it cannot resolve, and a partial UI beats a blank iframe.
      const validation = options.catalog.validate?.(spec);
      const validSpec = validation?.success ? validation.data : spec;
      return {
        // Two shapes on purpose. `content[0].text` is the wire format
        // `@json-render/mcp` emits and its iframe hook reads, so an app built
        // against that package renders a Mountly server unchanged.
        // `structuredContent` is what Mountly's own hosts and tests read.
        content: [{ type: "text", text: JSON.stringify(validSpec) }],
        structuredContent: { spec: validSpec },
      };
    }) as never,
  );
  return { name, remove: () => registered.remove() };
}

export function createJsonRenderMcpApp(
  options: CreateJsonRenderMcpAppOptions,
): RunningMcpAppServer {
  const configured = new McpServer(
    { name: options.name, version: options.version },
    { capabilities: { resources: {}, tools: {} } },
  );
  configured.server.registerCapabilities({
    extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } },
  } as never);

  const resourceUri = options.tool?.resourceUri ?? DEFAULT_RESOURCE_URI;
  assertUiUri(resourceUri);
  const toolName = options.tool?.name ?? DEFAULT_TOOL_NAME;
  const resource = registerJsonRenderResource(configured, {
    resourceUri,
    html: options.html,
    name: "json_render_ui",
  });
  const tool = registerJsonRenderTool(configured, {
    catalog: options.catalog,
    name: toolName,
    title: options.tool?.title,
    description: options.tool?.description,
    resourceUri,
    visibility: options.tool?.visibility,
    inputSchema: options.tool?.inputSchema,
  });
  const previousInitialized = configured.server.oninitialized;
  const handleInitialized = () => {
    previousInitialized?.();
    const ui = getUiCapability(configured.server.getClientCapabilities());
    if (ui?.mimeTypes?.includes(RESOURCE_MIME_TYPE)) return;
    resource.remove();
    tool.remove();
  };
  configured.server.oninitialized = handleInitialized;

  return {
    async connectInProcess(connectOptions) {
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await configured.connect(serverTransport);
      const client = new Client(
        { name: `${options.name}-inprocess-client`, version: options.version },
        (connectOptions?.ui ?? true)
          ? ({
              capabilities: {
                extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } },
              },
            } as never)
          : undefined,
      );
      await client.connect(clientTransport);
      return { client };
    },
    async listen(transport: Transport) {
      await configured.connect(transport);
    },
    async close() {
      await configured.close();
    },
  };
}
