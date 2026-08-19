import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDemoServer } from "./demo-core.mjs";

// Serve the example over stdio so a real MCP host (Claude Desktop, Cursor,
// VS Code) can connect to it. See README.md for the client config.
const { server } = await createDemoServer();
await server.listen(new StdioServerTransport());
