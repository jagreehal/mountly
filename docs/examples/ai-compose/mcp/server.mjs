import { readFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EXTENSION_ID, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { loadCatalog } from "mountly-compose";
import { registerComposeApp } from "mountly-mcp/compose";

const root = new URL("../", import.meta.url);

/**
 * An MCP server whose `show_page` lets the agent compose pages from the four
 * teams. `origin` is where the example's static server (host/serve.mjs) serves
 * the teams' embeds and the runtime the view imports.
 */
export async function createComposeServer(origin = "http://localhost:5199") {
  // Read the registry and descriptions from disk; embed URLs point at `origin`.
  const catalog = await loadCatalog(new URL("/registry.json", origin), {
    read: (url) => readFile(new URL(`.${url.pathname}`, root), "utf8"),
    actions: JSON.parse(await readFile(new URL("actions.json", root), "utf8")),
  });
  const server = new McpServer(
    { name: "ai-compose", version: "1.0.0" },
    { capabilities: { resources: {}, tools: {} } },
  );
  server.server.registerCapabilities({
    extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } },
  });
  const local = (path) => `${origin}/node_modules/${path}`;
  registerComposeApp(server, {
    catalog,
    title: "Your account",
    instructions:
      "The signed-in customer is cus_ada. Their orders: ord_77 (shipped), ord_81 (delivered).",
    styles: await readFile(new URL("host/design-system.css", root), "utf8"),
    imports: {
      "mountly-compose": local("mountly-compose/dist/index.js"),
      "@modelcontextprotocol/ext-apps": local(
        "@modelcontextprotocol/ext-apps/dist/src/app-with-deps.js",
      ),
      // One React for every team's peer embed.
      react: "https://esm.sh/react@19.2.8",
      "react/jsx-runtime": "https://esm.sh/react@19.2.8/jsx-runtime",
      "react-dom/client": "https://esm.sh/react-dom@19.2.8/client?deps=react@19.2.8",
      "mountly-react": local("mountly-react/dist/index.js"),
      "mountly/embed": local("mountly/dist/embed.js"),
    },
  });
  return server;
}
