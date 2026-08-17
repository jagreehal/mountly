import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  EXTENSION_ID,
  RESOURCE_MIME_TYPE,
  getUiCapability,
  registerAppResource,
  registerAppTool,
  type McpUiAppToolConfig,
} from "@modelcontextprotocol/ext-apps/server";
import type { McpUiToolMeta, McpUiToolVisibility } from "@modelcontextprotocol/ext-apps";
import { z } from "zod";
import { readMcpAppArtifact, type McpAppArtifact } from "../artifact/index.js";

export interface McpWidgetToolResult {
  structuredContent?: unknown;
  content?: ReadonlyArray<{ type: string; [key: string]: unknown }>;
  isError?: boolean;
}

/** Complete official tool configuration, plus JSON Schema support at Mountly's seam. */
export interface McpAppToolConfig extends Omit<
  McpUiAppToolConfig,
  "_meta" | "inputSchema" | "outputSchema"
> {
  inputSchema?: object;
  outputSchema?: object;
  /** Additional metadata is preserved; Mountly only merges `_meta.ui`. */
  _meta?: Record<string, unknown>;
}

/** A View is independent of the tools that reference it. */
export interface McpAppViewRegistration {
  /** Built artifact or the path to its self-contained HTML. */
  artifact: McpAppArtifact | string;
  /** Optional assertion used by migration adapters; artifacts already own identity. */
  uri?: string;
}

/** A tool links to a separately declared View through the protocol resource URI. */
export interface McpAppToolRegistration<Args = unknown> {
  name: string;
  resourceUri: string;
  config?: McpAppToolConfig;
  /** Convenience override for `_meta.ui.visibility`. */
  visibility?: McpUiToolVisibility | ReadonlyArray<McpUiToolVisibility>;
  handler: (args: Args, extra?: unknown) => Promise<McpWidgetToolResult>;
}

export interface RegisterMcpAppsOptions {
  views: ReadonlyArray<McpAppViewRegistration>;
  tools?: ReadonlyArray<McpAppToolRegistration>;
}

/** Backward-compatible one-tool/one-View declaration. */
export interface McpWidgetTool<Args = unknown> extends McpAppToolConfig {
  name: string;
  inputSchema: object;
  visibility?: McpUiToolVisibility | ReadonlyArray<McpUiToolVisibility>;
  handler: (args: Args) => Promise<McpWidgetToolResult>;
}

/** @deprecated Prefer independent `views` and `tools` with `registerMcpApps`. */
export interface McpWidgetRegistration {
  uri: string;
  htmlPath: string;
  tool: McpWidgetTool;
}

export interface CreateMcpAppServerOptions {
  name: string;
  version: string;
  widgets: ReadonlyArray<McpWidgetRegistration>;
}

interface LoadedView {
  artifact: McpAppArtifact;
  html: string;
}

interface InstalledTool {
  registration: McpAppToolRegistration;
  registered: { remove(): void; update(u: { _meta?: object }): void };
  metadataWithoutUi: Record<string, unknown>;
  visibility: ReadonlyArray<McpUiToolVisibility>;
}

export interface RegisteredMcpApps {
  artifacts: ReadonlyArray<McpAppArtifact>;
  /** Remove every resource and tool installed by this registration. */
  remove(): void;
}

function normalizeVisibility(
  visibility: McpAppToolRegistration["visibility"],
): McpUiToolVisibility[] | undefined {
  if (visibility === undefined) return undefined;
  return typeof visibility === "string" ? [visibility] : [...visibility];
}

function isSchemaLibraryValue(value: unknown): boolean {
  return typeof value === "object" && value !== null && ("~standard" in value || "_def" in value);
}

/** Convert documented JSON Schema while preserving Zod and Standard Schema values. */
function normalizeToolSchema(schema: object | undefined): object | undefined {
  if (!schema || Object.keys(schema).length === 0) return schema;
  const candidate = schema as Record<string, unknown>;
  if (isSchemaLibraryValue(candidate) || Object.values(candidate).some(isSchemaLibraryValue)) {
    return schema;
  }
  const jsonSchemaKeys = [
    "$schema",
    "$ref",
    "$defs",
    "type",
    "properties",
    "required",
    "additionalProperties",
    "allOf",
    "anyOf",
    "oneOf",
  ];
  return jsonSchemaKeys.some((key) => key in candidate)
    ? z.fromJSONSchema(schema as never)
    : schema;
}

function withTextFallback(result: McpWidgetToolResult): McpWidgetToolResult {
  if (result.content && result.content.length > 0) return result;
  if (result.structuredContent === undefined) return result;
  return {
    ...result,
    content: [{ type: "text", text: JSON.stringify(result.structuredContent) }],
  };
}

function withoutUiMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...meta };
  delete copy.ui;
  delete copy["ui/resourceUri"];
  return copy;
}

function mergedToolMetadata(tool: McpAppToolRegistration): {
  meta: Record<string, unknown> & { ui: McpUiToolMeta };
  withoutUi: Record<string, unknown>;
  visibility: McpUiToolVisibility[];
} {
  const base = { ...(tool.config?._meta ?? {}) };
  const existingUi =
    typeof base.ui === "object" && base.ui !== null ? (base.ui as Partial<McpUiToolMeta>) : {};
  const visibility = normalizeVisibility(tool.visibility) ?? [
    ...(existingUi.visibility ?? ["model", "app"]),
  ];
  const meta = {
    ...base,
    ui: { ...existingUi, resourceUri: tool.resourceUri, visibility },
  };
  return { meta, withoutUi: withoutUiMetadata(base), visibility };
}

async function loadViews(
  registrations: ReadonlyArray<McpAppViewRegistration>,
): Promise<ReadonlyArray<LoadedView>> {
  const loaded: LoadedView[] = [];
  const names = new Set<string>();
  const uris = new Set<string>();
  for (const registration of registrations) {
    if (registration.uri !== undefined && !registration.uri.startsWith("ui://")) {
      throw new Error(
        `mountly-mcp/server: registration uri must use the 'ui://' scheme (received '${registration.uri}')`,
      );
    }
    const supplied = typeof registration.artifact === "string" ? undefined : registration.artifact;
    const artifact = await readMcpAppArtifact(
      typeof registration.artifact === "string"
        ? registration.artifact
        : registration.artifact.htmlPath,
      registration.uri ?? supplied?.uri,
    );
    if (supplied && supplied.name !== artifact.name) {
      throw new Error(
        `mountly-mcp: supplied artifact name '${supplied.name}' does not match file artifact name '${artifact.name}'`,
      );
    }
    if (names.has(artifact.name))
      throw new Error(`mountly-mcp: duplicate app name '${artifact.name}'`);
    if (uris.has(artifact.uri)) throw new Error(`mountly-mcp: duplicate app uri '${artifact.uri}'`);
    names.add(artifact.name);
    uris.add(artifact.uri);
    loaded.push({ artifact, html: await readFile(artifact.htmlPath, "utf8") });
  }
  return loaded;
}

/**
 * Install Mountly Views and their independently declared tools into an existing,
 * unconnected MCP server. The caller retains ownership of identity, auth,
 * transports, prompts, ordinary tools, and deployment.
 */
export async function registerMcpApps(
  server: McpServer,
  options: RegisterMcpAppsOptions,
): Promise<RegisteredMcpApps> {
  if (server.isConnected()) {
    throw new Error("mountly-mcp: registerMcpApps() must run before the server connects");
  }
  if (options.views.length === 0) {
    throw new Error("mountly-mcp: registerMcpApps() requires at least one View");
  }
  const views = await loadViews(options.views);
  const byUri = new Map(views.map((view) => [view.artifact.uri, view]));
  for (const tool of options.tools ?? []) {
    if (!byUri.has(tool.resourceUri)) {
      throw new Error(
        `mountly-mcp: tool '${tool.name}' references undeclared View '${tool.resourceUri}'`,
      );
    }
  }

  server.server.registerCapabilities({
    extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } },
  } as never);

  const resources = views.map(({ artifact, html }) =>
    registerAppResource(
      server,
      artifact.name,
      artifact.uri,
      {
        mimeType: artifact.declaration.mimeType,
        description: artifact.declaration.description,
        _meta: { ui: artifact.declaration._meta.ui },
      },
      async () => ({
        contents: [
          {
            uri: artifact.uri,
            mimeType: artifact.declaration.mimeType,
            text: html,
            _meta: { ui: artifact.declaration._meta.ui },
          },
        ],
      }),
    ),
  );

  const tools: InstalledTool[] = (options.tools ?? []).map((registration) => {
    const { meta, withoutUi, visibility } = mergedToolMetadata(registration);
    const config = registration.config ?? {};
    const registered = registerAppTool(
      server,
      registration.name,
      {
        ...config,
        inputSchema: normalizeToolSchema(config.inputSchema) as never,
        outputSchema: normalizeToolSchema(config.outputSchema) as never,
        _meta: meta,
      },
      (async (args: unknown, extra: unknown) =>
        withTextFallback(await registration.handler(args, extra))) as never,
    );
    return { registration, registered, metadataWithoutUi: withoutUi, visibility };
  });

  const previousInitialized = server.server.oninitialized;
  const handleInitialized = () => {
    previousInitialized?.();
    const ui = getUiCapability(server.server.getClientCapabilities());
    if (ui?.mimeTypes?.includes(RESOURCE_MIME_TYPE)) return;
    for (const resource of resources) resource.remove();
    for (const tool of tools) {
      if (tool.visibility.includes("model")) {
        tool.registered.update({ _meta: tool.metadataWithoutUi });
      } else {
        tool.registered.remove();
      }
    }
  };
  server.server.oninitialized = handleInitialized;

  return {
    artifacts: views.map((view) => view.artifact),
    remove() {
      for (const resource of resources) resource.remove();
      for (const tool of tools) tool.registered.remove();
      if (server.server.oninitialized === handleInitialized) {
        server.server.oninitialized = previousInitialized;
      }
    },
  };
}

export interface RunningMcpAppServer {
  connectInProcess(options?: { ui?: boolean }): Promise<{ client: Client }>;
  listen(transport: Transport): Promise<void>;
  close(): Promise<void>;
}

function legacyRegistrations(
  widgets: ReadonlyArray<McpWidgetRegistration>,
): RegisterMcpAppsOptions {
  const views = new Map<string, McpAppViewRegistration>();
  const tools: McpAppToolRegistration[] = [];
  for (const widget of widgets) {
    const existing = views.get(widget.uri);
    if (existing && existing.artifact !== widget.htmlPath) {
      throw new Error(`mountly-mcp: View '${widget.uri}' has more than one htmlPath`);
    }
    views.set(widget.uri, { artifact: widget.htmlPath, uri: widget.uri });
    const { name, handler, visibility, ...config } = widget.tool;
    tools.push({ name, resourceUri: widget.uri, config, visibility, handler });
  }
  return { views: [...views.values()], tools };
}

function createConfiguredServer(options: CreateMcpAppServerOptions): McpServer {
  return new McpServer(
    { name: options.name, version: options.version },
    { capabilities: { resources: {}, tools: {} } },
  );
}

/** Convenience adapter that retains the original one-call server experience. */
export function createMcpAppServer(options: CreateMcpAppServerOptions): RunningMcpAppServer {
  let server: McpServer | undefined;
  async function build(): Promise<McpServer> {
    const next = createConfiguredServer(options);
    await registerMcpApps(next, legacyRegistrations(options.widgets));
    server = next;
    return next;
  }
  return {
    async connectInProcess(connectOptions) {
      const next = await build();
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await next.connect(serverTransport);
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
    async listen(transport) {
      const next = await build();
      await next.connect(transport);
    },
    async close() {
      await server?.close();
    },
  };
}

export async function serveStdio(options: CreateMcpAppServerOptions): Promise<RunningMcpAppServer> {
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const server = createMcpAppServer(options);
  await server.listen(new StdioServerTransport());
  return server;
}

export { EXTENSION_ID, RESOURCE_MIME_TYPE };
