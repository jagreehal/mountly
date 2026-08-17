/**
 * Drives the demo's stdio server with an out-of-process MCP client — the way an
 * MCP inspector or a real host would.
 *
 * The vitest suite exercises the server over `InMemoryTransport` in-process;
 * this is the only check that covers a real transport, a client we didn't
 * write, and both sides of extension capability negotiation.
 *
 *   pnpm --filter mcp-app-demo verify:stdio
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTENSION_ID = "io.modelcontextprotocol/ui";
const MIME = "text/html;profile=mcp-app";

async function connect({ ui }) {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["./serve-stdio.mjs"],
    cwd: __dirname,
    // StdioClientTransport scrubs env by default, which drops TMPDIR and makes
    // the demo's mkdtemp fall back to /tmp.
    env: { ...process.env },
    stderr: "inherit",
  });
  const client = new Client(
    { name: ui ? "ui-host-sim" : "text-only-host-sim", version: "1.0.0" },
    ui ? { capabilities: { extensions: { [EXTENSION_ID]: { mimeTypes: [MIME] } } } } : undefined,
  );
  await client.connect(transport);
  return client;
}

const out = [];
const check = (label, ok, detail = "") =>
  out.push(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);

// --- Host that speaks MCP Apps -------------------------------------------
{
  const client = await connect({ ui: true });

  const { tools } = await client.listTools();
  const quote = tools.find((t) => t.name === "quote_payment");
  const refresh = tools.find((t) => t.name === "refresh_payment_widget");
  check("tools/list exposes quote_payment", !!quote);
  check(
    "tool carries _meta.ui.resourceUri",
    quote?._meta?.ui?.resourceUri === "ui://mountly-demo/payment-breakdown",
    quote?._meta?.ui?.resourceUri,
  );
  check(
    "app-only tool visibility is an array",
    Array.isArray(refresh?._meta?.ui?.visibility),
    JSON.stringify(refresh?._meta?.ui?.visibility),
  );

  const { resources } = await client.listResources();
  const res = resources.find((r) => r.uri === "ui://mountly-demo/payment-breakdown");
  check("resources/list includes the ui:// resource", !!res);
  check("declared mimeType is the MCP Apps profile", res?.mimeType === MIME, res?.mimeType);

  const read = await client.readResource({ uri: "ui://mountly-demo/payment-breakdown" });
  const content = read.contents?.[0];
  check("resources/read returns the profile mimeType", content?.mimeType === MIME);
  check("resources/read returns an HTML5 document", !!content?.text?.startsWith("<!doctype html>"));
  check(
    "resource content carries _meta.ui",
    !!content?._meta?.ui,
    JSON.stringify(content?._meta?.ui),
  );
  check(
    "emitted HTML declares the view's display modes",
    !!content?.text?.includes("__mountlyMcpAvailableDisplayModes__"),
  );
  // Whether the bundle survives a spec CSP is proved by the browser e2e, not by
  // grepping: `new Function` inside a lazy initializer is fine, at module scope is not.
  check(
    "emitted HTML carries the bridge runtime",
    !!content?.text?.includes("ui/notifications/tool-result"),
  );

  const called = await client.callTool({ name: "quote_payment", arguments: { plan: "annual" } });
  check("tools/call returns structuredContent", called.structuredContent?.total === 99);
  check(
    "tools/call also returns a text content block for the model",
    called.content?.[0]?.type === "text",
    JSON.stringify(called.content?.[0]?.text)?.slice(0, 60),
  );

  await client.close();
}

// --- Host that does NOT speak MCP Apps -----------------------------------
{
  const client = await connect({ ui: false });

  const { tools } = await client.listTools();
  const quote = tools.find((t) => t.name === "quote_payment");
  check("text-only host still gets the tool", !!quote);
  check("text-only host gets no ui metadata", quote?._meta?.ui === undefined);
  check(
    "app-only tool is hidden from a text-only host",
    !tools.some((t) => t.name === "refresh_payment_widget"),
  );

  const { resources } = await client.listResources();
  check(
    "no ui:// resources offered to a text-only host",
    !resources.some((r) => r.uri.startsWith("ui://")),
  );

  const called = await client.callTool({ name: "quote_payment", arguments: { plan: "monthly" } });
  check("tool still answers in text", called.content?.[0]?.type === "text");

  await client.close();
}

console.log(out.join("\n"));
console.log(out.some((l) => l.startsWith("FAIL")) ? "\nRESULT: FAILURES" : "\nRESULT: all passed");
process.exit(out.some((l) => l.startsWith("FAIL")) ? 1 : 0);
