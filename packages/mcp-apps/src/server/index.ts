/**
 * The Node entry: Views may be paths on disk. Runtimes without a filesystem
 * (Cloudflare Workers) resolve `mountly-mcp/server` to `./workers.js` instead,
 * through the `workerd` and `worker` export conditions.
 */
import { readFile } from "node:fs/promises";
import { readMcpAppArtifact } from "../artifact/index.js";
import {
  createMcpAppServer,
  installDiskViewLoader,
  type CreateMcpAppServerOptions,
  type RunningMcpAppServer,
} from "./core.js";

installDiskViewLoader(async (supplied, uri) => {
  const artifact = await readMcpAppArtifact(
    typeof supplied === "string" ? supplied : supplied.htmlPath,
    uri ?? (typeof supplied === "string" ? undefined : supplied.uri),
  );
  if (typeof supplied !== "string" && supplied.name !== artifact.name) {
    throw new Error(
      `mountly-mcp: supplied artifact name '${supplied.name}' does not match file artifact name '${artifact.name}'`,
    );
  }
  return { artifact, html: await readFile(artifact.htmlPath, "utf8") };
});

export {
  EXTENSION_ID,
  RESOURCE_MIME_TYPE,
  createMcpAppServer,
  registerMcpApps,
  type CreateMcpAppServerOptions,
  type McpAppToolConfig,
  type McpAppToolRegistration,
  type McpAppToolResult,
  type McpAppViewRegistration,
  type RegisterMcpAppsOptions,
  type RegisteredMcpApps,
  type RunningMcpAppServer,
} from "./core.js";

export async function serveStdio(options: CreateMcpAppServerOptions): Promise<RunningMcpAppServer> {
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const server = createMcpAppServer(options);
  await server.listen(new StdioServerTransport());
  return server;
}
