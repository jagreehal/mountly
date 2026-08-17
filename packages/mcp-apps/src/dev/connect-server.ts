import type { McpUiToolMeta } from "@modelcontextprotocol/ext-apps";

export interface ConnectedMcpServer {
  callTool: (name: string, args: unknown) => Promise<unknown>;
  /** The model-visible tool bound to `uri` — the one a host would call. */
  toolFor(uri: string): Promise<string | undefined>;
  close(): Promise<void>;
}

/**
 * Connect a server module in-process for a development session.
 *
 * The module default-exports either the server or a function returning it: a
 * `RunningMcpAppServer` from `createMcpAppServer`, or a raw `McpServer`.
 */
export async function connectMcpServer(path: string): Promise<ConnectedMcpServer> {
  const { pathToFileURL } = await import("node:url");
  const { resolve } = await import("node:path");
  const mod = (await import(pathToFileURL(resolve(path)).href)) as { default?: unknown };
  if (mod.default === undefined) {
    throw new Error(
      `mountly-mcp: ${path} has no default export. Export your server (or a function returning it) as default.`,
    );
  }
  const value = typeof mod.default === "function" ? await mod.default() : mod.default;

  let client: import("@modelcontextprotocol/sdk/client/index.js").Client;
  if (
    value !== null &&
    typeof value === "object" &&
    "connectInProcess" in value &&
    typeof value.connectInProcess === "function"
  ) {
    const running = value as { connectInProcess(): Promise<{ client: typeof client }> };
    ({ client } = await running.connectInProcess());
  } else if (
    value !== null &&
    typeof value === "object" &&
    "connect" in value &&
    typeof value.connect === "function"
  ) {
    const [{ Client }, { InMemoryTransport }, { EXTENSION_ID, RESOURCE_MIME_TYPE }] =
      await Promise.all([
        import("@modelcontextprotocol/sdk/client/index.js"),
        import("@modelcontextprotocol/sdk/inMemory.js"),
        import("@modelcontextprotocol/ext-apps/server"),
      ]);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await (value as { connect(transport: unknown): Promise<void> }).connect(serverTransport);
    client = new Client({ name: "mountly-mcp-dev", version: "0.0.1" }, {
      capabilities: { extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } } },
    } as never);
    await client.connect(clientTransport);
  } else {
    throw new TypeError(
      `mountly-mcp: ${path} must default-export an MCP server, RunningMcpAppServer, or a function returning one`,
    );
  }

  return {
    callTool: (name, args) =>
      client.callTool({ name, arguments: (args ?? {}) as Record<string, unknown> }),
    async toolFor(uri) {
      const { tools } = await client.listTools();
      const uiMeta = (tool: { _meta?: unknown }): McpUiToolMeta | undefined =>
        (tool._meta as { ui?: McpUiToolMeta } | undefined)?.ui;
      const bound = tools.filter((tool) => uiMeta(tool)?.resourceUri === uri);
      const visible = bound.find((tool) => {
        const visibility = uiMeta(tool)?.visibility;
        return visibility === undefined || visibility.includes("model");
      });
      return (visible ?? bound[0])?.name;
    },
    close: () => client.close(),
  };
}
