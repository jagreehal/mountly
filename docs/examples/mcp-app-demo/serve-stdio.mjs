import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDemoServer } from "./demo-core.mjs";

const { server, cleanup, built } = await createDemoServer();

process.on("SIGINT", async () => {
  await cleanup();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await cleanup();
  process.exit(0);
});

await server.listen(new StdioServerTransport());
console.error("[mcp-app-demo] stdio server started");
console.error(`[mcp-app-demo] resource html: ${built.htmlPath}`);
