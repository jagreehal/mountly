import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { EXTENSION_ID, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import { signWebhook } from "mountly-mcp/events";
import createServer, { URI } from "./server.mjs";
import { createEventsServer } from "./events-server.mjs";

const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};

// 1. Plugin Extensions server (SDK v1): entrypoints + file viewer.
const server = await createServer();
const client = new Client(
  { name: "verify", version: "0" },
  { capabilities: { extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } } } },
);
const [ct, st] = InMemoryTransport.createLinkedPair();
await server.connect(st);
await client.connect(ct);

const { tools } = await client.listTools();
const entry = (name) => tools.find((t) => t.name === name)?._meta?.["openai/ui"]?.entrypoints?.[0];
assert(entry("deploys.board")?.type === "global", "board tool has no sidebar entrypoint");
assert(
  entry("deploys.open_log")?.extensions?.includes(".log"),
  "open_log has no .log file entrypoint",
);

const resource = await client.readResource({ uri: URI });
assert(
  resource.contents[0]._meta?.["openai/ui"]?.preferredDisplayMode === "inline",
  "resource lost openai/ui",
);

const log = await client.callTool({
  name: "deploys.open_log",
  arguments: { file: { name: "web-d_3.log", resourceUri: "file://web-d_3.log" } },
});
assert(log.structuredContent?.kind === "log", "file entrypoint did not return a log view");
await client.close();

// 2. Events server (MCP 2.0): discover → subscribe (challenge) → emit (signed webhook).
const SECRET = `whsec_${Buffer.alloc(32, 1).toString("base64")}`;
const received = [];
const receiver = async (_url, init) => {
  const body = JSON.parse(init.body);
  if (body.type === "verification") return Response.json({ challenge: body.challenge });
  received.push({ headers: init.headers, raw: init.body, body });
  return new Response(null, { status: 202 });
};
const { events, handler } = createEventsServer({ fetch: receiver });

let id = 0;
async function rpc(method, params = {}) {
  const meta = {
    [PROTOCOL_VERSION_META_KEY]: "2026-07-28",
    [CLIENT_INFO_META_KEY]: { name: "verify", version: "0" },
    [CLIENT_CAPABILITIES_META_KEY]: {},
  };
  const res = await handler.fetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2026-07-28",
        "mcp-method": method,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++id,
        method,
        params: { ...params, _meta: meta },
      }),
    }),
  );
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result;
}

assert(
  (await rpc("server/discover")).capabilities?.events,
  "server/discover does not advertise events",
);
assert(
  (await rpc("events/list")).events[0]?.name === "deploy.finished",
  "events/list missing deploy.finished",
);
const sub = await rpc("events/subscribe", {
  name: "deploy.finished",
  arguments: { app: "web" },
  delivery: { mode: "webhook", url: "https://receiver.example/cb", secret: SECRET },
});

await events.emit(
  "deploy.finished",
  { app: "api", id: "d_9", status: "ok" },
  (a) => a.app === "api",
);
await events.emit(
  "deploy.finished",
  { app: "web", id: "d_10", status: "failed" },
  (a) => a.app === "web",
);
assert(
  received.length === 1 && received[0].body.data.id === "d_10",
  "only the web deploy should be delivered",
);
const h = received[0].headers;
assert(h["x-mcp-subscription-id"] === sub.id, "wrong subscription id header");
assert(
  h["webhook-signature"] ===
    signWebhook({
      secret: SECRET,
      id: h["webhook-id"],
      timestamp: Number(h["webhook-timestamp"]),
      body: received[0].raw,
    }),
  "bad webhook signature",
);

console.log("[mcp-chatgpt-plugin] verification passed");
