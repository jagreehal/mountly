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
console.error("[mcp-generative-demo] stdio server started");
console.error(`[mcp-generative-demo] resource html: ${built.htmlPath}`);
