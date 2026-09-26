import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { loadCatalog } from "mountly-compose";
import { scope, STRATEGIES } from "../lab/strategies.mjs";

/**
 * The agent side: POST /api/compose { prompt?, current?, event?, strategy?, model? }
 * → a tree the page can render. With `current`, the model edits that page
 * rather than starting over. Everything else is static files.
 */
const root = new URL("../", import.meta.url);
const catalog = await loadCatalog(new URL("registry.json", root), {
  actions: JSON.parse(await readFile(new URL("actions.json", root), "utf8")),
});
const CONTEXT = {
  customerId: "cus_ada",
  orders: [
    { id: "ord_77", status: "shipped" },
    { id: "ord_81", status: "delivered" },
  ],
};
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".css": "text/css",
  ".map": "application/json",
};

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "POST" && url.pathname === "/api/compose") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const {
      prompt,
      current,
      event,
      stream,
      strategy = "shortlist",
      model = process.env.MODEL ?? "gpt-oss:20b-cloud",
    } = JSON.parse(body);
    const started = Date.now();
    // With `stream`, the reply is newline-delimited events: `text` as the model
    // writes, `reset` before a retry, then `done` with the checked tree.
    const send = (event) => res.write(`${JSON.stringify(event)}\n`);
    if (stream) res.setHeader("content-type", "application/x-ndjson");
    try {
      const out = await STRATEGIES[strategy]({
        model,
        prompt,
        current,
        event,
        context: CONTEXT,
        catalog,
        ...(stream
          ? {
              onText: (text) => send({ type: "text", text }),
              onReset: () => send({ type: "reset" }),
            }
          : {}),
      });
      // Check in the scope the strategy answered in: an action's catalog and required widgets.
      const scoped = scope({ catalog, current, event });
      const result = {
        tree: out.tree,
        errors: scoped.catalog.validate(out.tree, { require: scoped.require }),
        ms: Date.now() - started,
        strategy,
        model,
      };
      if (stream) {
        send({ type: "done", ...result });
        res.end();
      } else {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(result));
      }
    } catch (error) {
      if (stream) {
        send({ type: "error", error: String(error.message ?? error) });
        res.end();
      } else {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(error.message ?? error) }));
      }
    }
    return;
  }
  try {
    const path = url.pathname.endsWith("/") ? `${url.pathname}index.html` : url.pathname;
    const file = await readFile(new URL(`.${path}`, root));
    res.setHeader("content-type", TYPES[extname(path)] ?? "application/octet-stream");
    // An MCP App view runs in a sandboxed iframe whose origin is `null`: its
    // module scripts load only with CORS, as they would from any CDN.
    res.setHeader("access-control-allow-origin", "*");
    res.end(file);
  } catch {
    res.statusCode = 404;
    res.end("not found");
  }
}).listen(process.env.PORT ?? 5199, () =>
  console.log(`http://localhost:${process.env.PORT ?? 5199}/host/`),
);
