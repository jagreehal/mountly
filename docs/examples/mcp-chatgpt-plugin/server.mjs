import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { OpenAIFileEntrypointInputSchema } from "@openai/mcp-extensions/server";
import { readMcpAppManifest } from "mountly-mcp/artifact";
import { enableOpenAiExtensions, openaiUiToolMeta } from "mountly-mcp/openai/server";
import { registerMcpApps } from "mountly-mcp/server";

export const URI = "ui://deploys/board";
const MANIFEST = fileURLToPath(new URL("./dist/mountly-mcp.manifest.json", import.meta.url));

export const DEPLOYS = [
  { id: "d_3", app: "web", status: "ok", at: "2026-10-01T09:12:00Z" },
  { id: "d_2", app: "api", status: "failed", at: "2026-10-01T08:40:00Z" },
  { id: "d_1", app: "web", status: "ok", at: "2026-09-30T17:05:00Z" },
];

/**
 * MCP Apps server (SDK v1). One View, three ChatGPT surfaces:
 * inline in chat, the sidebar (`global`), and a `.log` file viewer (`file`).
 * Claude, VS Code and other hosts ignore `openai/ui` and render it inline.
 */
export default async function createServer() {
  const server = new McpServer({ name: "deploys", version: "0.0.1" });
  enableOpenAiExtensions(server);
  const { artifacts } = await readMcpAppManifest(MANIFEST);

  await registerMcpApps(server, {
    views: artifacts.map((artifact) => ({ artifact })),
    tools: [
      {
        name: "deploys.board",
        resourceUri: URI,
        config: {
          title: "Deploys",
          description: "Show recent deploys",
          inputSchema: {},
          _meta: openaiUiToolMeta({
            entrypoints: [
              {
                type: "global",
                quickAction: {
                  title: "Deploys",
                  icons: [{ src: "https://mountly.dev/favicon.svg", mimeType: "image/svg+xml" }],
                  target: { type: "tool", name: "deploys.board" },
                },
              },
            ],
          }),
        },
        handler: async () => ({ structuredContent: { kind: "board", deploys: DEPLOYS } }),
      },
      {
        name: "deploys.open_log",
        resourceUri: URI,
        config: {
          title: "Open deploy log",
          description: "View a deploy log file",
          inputSchema: OpenAIFileEntrypointInputSchema.shape,
          _meta: openaiUiToolMeta({ entrypoints: [{ type: "file", extensions: [".log"] }] }),
        },
        handler: async ({ file }) => ({
          structuredContent: { kind: "log", name: file.name, uri: file.resourceUri },
        }),
      },
    ],
  });

  return server;
}
