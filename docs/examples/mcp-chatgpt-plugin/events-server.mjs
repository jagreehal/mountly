import { createServer as createHttpServer } from "node:http";
import { pathToFileURL } from "node:url";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { defineEvents } from "mountly-mcp/events";
import { z } from "zod";
import { DEPLOYS } from "./server.mjs";

/** Deploys seen by this process (seed + `/demo/deploy`). */
const recent = [...DEPLOYS];

/**
 * MCP Events server (MCP 2.0, protocol 2026-07-28). It runs beside server.mjs,
 * which uses SDK v1 for `@openai/mcp-extensions`.
 */
export function createEventsServer(options = {}) {
  const events = defineEvents({
    events: {
      "deploy.finished": {
        description: "A deploy for the given app finished.",
        input: z.object({ app: z.string().describe("App to watch, e.g. web") }),
        payload: z.object({ app: z.string(), id: z.string(), status: z.enum(["ok", "failed"]) }),
      },
    },
    // Subscriptions live in memory. Pass `store` to persist them across restarts.
    ...options,
  });

  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: "deploys-events", version: "0.0.1" });
    server.server.registerCapabilities({ events: {} });
    // ChatGPT connectors need at least one tool.
    server.registerTool(
      "deploys.recent",
      { description: "List recent deploys", inputSchema: z.object({}) },
      async () => ({
        content: [{ type: "text", text: JSON.stringify(recent) }],
        structuredContent: { deploys: recent },
      }),
    );
    const params = z.looseObject({});
    server.server.setRequestHandler("events/list", { params }, () => events.list());
    server.server.setRequestHandler("events/subscribe", { params }, (p, ctx) =>
      events.subscribe(p, { authInfo: ctx.http?.authInfo }),
    );
    server.server.setRequestHandler("events/unsubscribe", { params }, (p, ctx) =>
      events.unsubscribe(p, { authInfo: ctx.http?.authInfo }),
    );
    return server;
  });

  return { events, handler };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const PORT = Number(process.env.PORT ?? 8788);
  // DEBUG_WEBHOOKS=1 logs each outgoing webhook and the receiver's reply.
  const debugFetch = async (url, init) => {
    const res = await fetch(url, init);
    const reply = await res.clone().text();
    console.error(`→ ${url}\n  headers=${JSON.stringify(init.headers)}\n  body=${init.body}`);
    console.error(
      `← ${res.status} ${JSON.stringify(Object.fromEntries(res.headers))}\n  ${reply.slice(0, 500)}`,
    );
    return res;
  };
  const { events, handler } = createEventsServer(
    process.env.DEBUG_WEBHOOKS ? { fetch: debugFetch } : {},
  );

  createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    console.error(`${req.method} ${url.pathname} ${String(req.headers["mcp-method"] ?? "")}`);

    // Demo trigger: `curl -X POST "localhost:8788/demo/deploy?app=web&status=failed"`
    if (req.method === "POST" && url.pathname === "/demo/deploy") {
      const app = url.searchParams.get("app") ?? "web";
      const status = url.searchParams.get("status") === "failed" ? "failed" : "ok";
      const deploy = { app, id: `d_${Date.now()}`, status, at: new Date().toISOString() };
      recent.unshift(deploy);
      const results = await events.emit(
        "deploy.finished",
        { app, id: deploy.id, status },
        (a) => a.app === app,
      );
      return res
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify(results));
    }
    if (!url.pathname.startsWith("/mcp")) return res.writeHead(404).end();

    // Buffered bridge from node:http to the fetch handler. Use `toNodeHandler` from
    // @modelcontextprotocol/node for streaming responses.
    const body = req.method === "POST" ? Buffer.concat(await Array.fromAsync(req)) : undefined;
    const response = await handler.fetch(
      new Request(url, { method: req.method, headers: req.headers, body }),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  }).listen(PORT, () => console.error(`deploy events MCP server on http://localhost:${PORT}/mcp`));
}
