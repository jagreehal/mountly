import { createServer as createHttpServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import createServer from "./server.mjs";

/**
 * Stateless Streamable HTTP at /mcp for ChatGPT Developer mode.
 * ChatGPT needs HTTPS: put a tunnel (cloudflared, ngrok) in front of this port.
 */
const PORT = Number(process.env.PORT ?? 8787);

createHttpServer(async (req, res) => {
  if (!req.url?.startsWith("/mcp")) return res.writeHead(404).end();
  const server = await createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => void server.close());
  await server.connect(transport);
  await transport.handleRequest(req, res);
}).listen(PORT, () => console.error(`deploys MCP server on http://localhost:${PORT}/mcp`));
