import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { EXTENSION_ID, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { MCP_APPS_PROTOCOL_VERSION } from "mountly-mcp";
import { startDevHost } from "mountly-mcp/dev";
import { createComposeServer } from "./server.mjs";

/**
 * The compose view inside mountly-mcp's dev host: a real two-origin sandbox,
 * the view's CSP applied, and each button calling the real `show_page` with a
 * page an agent could have written. Needs `pnpm serve` running.
 */
const server = await createComposeServer();
const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
await server.connect(serverSide);
const client = new Client(
  { name: "preview", version: "1.0.0" },
  { capabilities: { extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } } } },
);
await client.connect(clientSide);

const { tools } = await client.listTools();
const tool = tools.find((t) => t.name === "show_page");
const [resource] = (await client.readResource({ uri: tool._meta.ui.resourceUri })).contents;
const dir = await mkdtemp(join(tmpdir(), "compose-view-"));
const htmlPath = join(dir, "view.html");
await writeFile(htmlPath, resource.text);
await writeFile(
  `${htmlPath}.meta.json`,
  JSON.stringify({
    protocolVersion: MCP_APPS_PROTOCOL_VERSION,
    uri: resource.uri,
    name: "show_page",
    mimeType: resource.mimeType,
    awaitToolResult: true,
    displayModes: ["inline"],
    _meta: resource._meta,
  }),
);

const host = await startDevHost({
  htmlPath,
  toolName: "show_page",
  callTool: (name, args) => client.callTool({ name, arguments: args }),
  fixtures: {
    "Charged twice": {
      page: {
        tag: "ui-stack",
        children: [
          {
            tag: "cases-case-panel",
            attrs: { heading: "Charged twice this month" },
            children: [
              { tag: "billing-invoice-list", attrs: { "customer-id": "cus_ada", status: "all" } },
              { tag: "support-contact-card", attrs: { topic: "Talk to billing" }, slot: "actions" },
            ],
          },
        ],
      },
    },
    "Where's my parcel": {
      page: {
        tag: "ui-stack",
        children: [{ tag: "shipping-order-tracker", attrs: { "order-id": "ord_77" } }],
      },
    },
  },
});
console.log(host.hostUrl);
