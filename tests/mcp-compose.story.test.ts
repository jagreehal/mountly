import { story } from "executable-stories-vitest";
import { describe, expect, it } from "vite-plus/test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createCatalog,
  DEFAULT_LAYOUT,
  elementsFromCem,
} from "../packages/mountly-compose/src/index";
import { composeViewHtml, registerComposeApp } from "../packages/mcp-apps/src/compose/index";

const CEM = {
  modules: [
    {
      declarations: [
        {
          customElement: true,
          tagName: "billing-invoice-list",
          description: "A customer's invoices.",
          attributes: [
            { name: "customer-id", type: { text: "string" }, schema: { type: "string" } },
            {
              name: "limit",
              type: { text: "number" },
              schema: { type: "number", minimum: 1, maximum: 20 },
            },
          ],
          events: [{ name: "pick-invoice", description: "Detail: { invoiceId }." }],
        },
      ],
    },
  ],
};

const IMPORTS = {
  "mountly-compose": "https://cdn.acme.test/mountly-compose.js",
  "@modelcontextprotocol/ext-apps": "https://cdn.acme.test/ext-apps.js",
  react: "https://esm.test/react.js",
};

async function connect() {
  const packageRequire = createRequire(join(process.cwd(), "packages/mcp-apps/package.json"));
  const sdk = (path: string) => pathToFileURL(packageRequire.resolve(path)).href;
  const [{ McpServer }, { Client }, { InMemoryTransport }] = await Promise.all([
    import(sdk("@modelcontextprotocol/sdk/server/mcp.js")),
    import(sdk("@modelcontextprotocol/sdk/client/index.js")),
    import(sdk("@modelcontextprotocol/sdk/inMemory.js")),
  ]);
  const { EXTENSION_ID, RESOURCE_MIME_TYPE } =
    await import("../packages/mcp-apps/src/server/index");
  const server = new McpServer(
    { name: "compose", version: "1.0.0" },
    { capabilities: { resources: {}, tools: {} } },
  );
  const catalog = createCatalog(
    [...DEFAULT_LAYOUT, ...elementsFromCem(CEM, "billing", "https://billing.acme.test/embed.js")],
    {
      actions: {
        "show-invoice": {
          description: "Show that invoice.",
          on: ["billing-invoice-list:pick-invoice"],
          params: ["invoiceId"],
        },
      },
    },
  );
  registerComposeApp(server, {
    catalog,
    imports: IMPORTS,
    instructions: "Fill customer ids from the conversation.",
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "host", version: "1.0.0" }, {
    capabilities: { extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } } },
  } as never);
  await client.connect(clientTransport);
  return { client, server };
}

describe("A page composed by the agent, shown in an MCP host", () => {
  it("offers the agent the catalog as the tool's description", async ({ task }) => {
    story.init(task);
    const { client, server } = await connect();

    const { tools } = await client.listTools();
    const tool = tools.find((t: { name: string }) => t.name === "show_page");
    story.then("the agent reads every component, its attributes and the actions");
    expect(tool.description).toContain("<billing-invoice-list> — A customer's invoices.");
    expect(tool.description).toContain("limit: number");
    expect(tool.description).toContain("Fill customer ids from the conversation.");
    expect(tool.description).toContain("- show-invoice — Show that invoice.");
    expect(tool._meta.ui.resourceUri).toBe("ui://mountly/compose.html");

    story.then("the view is allowed to load exactly the teams' and runtime origins");
    const resource = await client.readResource({ uri: "ui://mountly/compose.html" });
    const csp = resource.contents[0]._meta.ui.csp;
    expect(csp.resourceDomains.sort()).toEqual([
      "https://billing.acme.test",
      "https://cdn.acme.test",
      "https://esm.test",
    ]);
    expect(resource.contents[0].text).toContain('"mountly-compose":"https://cdn.acme.test');

    await client.close();
    await server.close();
  });

  it("validates the page, repairs small mistakes, and hands the rest back", async ({ task }) => {
    story.init(task);
    const { client, server } = await connect();
    const list = (attrs: Record<string, unknown>) => ({
      page: { tag: "ui-stack", children: [{ tag: "billing-invoice-list", attrs }] },
    });

    story.then("a valid page reaches the view with the elements and actions to render it");
    const ok = await client.callTool({
      name: "show_page",
      arguments: list({ "customer-id": "c1" }),
    });
    expect(ok.isError).toBeFalsy();
    expect(ok.content[0].text).toBe("Showing billing-invoice-list.");
    expect(ok.structuredContent.page.children[0].tag).toBe("billing-invoice-list");
    expect(ok.structuredContent.elements.map((el: { tag: string }) => el.tag)).toEqual([
      "ui-stack",
      "ui-grid",
      "ui-note",
      "billing-invoice-list",
    ]);
    expect(Object.keys(ok.structuredContent.actions)).toEqual(["show-invoice"]);

    story.then("a value out of range is stripped, and the agent is told what went");
    const fixed = await client.callTool({
      name: "show_page",
      arguments: list({ "customer-id": "c1", limit: 99 }),
    });
    expect(fixed.content[0].text).toContain("Removed what the catalog does not allow");
    expect(fixed.structuredContent.page.children[0].attrs).toEqual({ "customer-id": "c1" });

    story.then("a page that cannot be saved is an error the agent can act on");
    const bad = await client.callTool({ name: "show_page", arguments: { page: { tag: "div" } } });
    expect(bad.isError).toBe(true);
    expect(bad.content[0].text).toContain("unknown tag <div>");

    await client.close();
    await server.close();
  });

  it("escapes what it writes into the view", ({ task }) => {
    story.init(task);

    const html = composeViewHtml({
      imports: { x: "https://a.test/</script><script>alert(1)</script>" },
      styles: "main{} </style><script>alert(2)</script>",
      title: "<b>Page</b>",
    });
    expect(html).not.toContain("</script><script>alert(1)");
    expect(html).not.toContain("</style><script>");
    expect(html).toContain("<title>b>Page/b></title>");
  });
});
