import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import createServer from "./server.mjs";

/**
 * Stdio entry for Claude Desktop / VS Code / other MCP hosts.
 * Never write logs to stdout: stdout is the JSON-RPC channel.
 */
const server = await createServer();
await server.connect(new StdioServerTransport());
