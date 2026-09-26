import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createComposeServer } from "./server.mjs";

// For an MCP host such as Claude Desktop. Keep `pnpm serve` running: the view
// loads the teams' embeds from it.
const server = await createComposeServer(process.env.COMPOSE_ORIGIN);
await server.connect(new StdioServerTransport());
