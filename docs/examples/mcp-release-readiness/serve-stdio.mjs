import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createReleaseServer } from "./server.mjs";

const server = await createReleaseServer();
await server.connect(new StdioServerTransport());
