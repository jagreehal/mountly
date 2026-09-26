/**
 * Show a page composed from many teams' custom elements inside an MCP host.
 *
 * The agent is the composer: `show_page` carries the catalog's prompt as its
 * description, the agent calls it with a tree, the server validates (or
 * repairs) it, and the `ui://` view renders it with `mountly-compose` — each
 * team's code loading on first use. When the user acts in a widget, the view
 * sends the agent its next turn, with the current page, so it edits rather than
 * starts over.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import type { Catalog, Tree } from "mountly-compose";

const DEFAULT_RESOURCE_URI = "ui://mountly/compose.html";
const DEFAULT_TOOL_NAME = "show_page";

export interface ComposeViewOptions {
  /**
   * The view's import map. Must map `mountly-compose` and
   * `@modelcontextprotocol/ext-apps` (its `app-with-deps` build), plus
   * whatever the teams' peer embeds import: `react`, `react/jsx-runtime`,
   * `react-dom/client`, `mountly-react`, `mountly/embed`.
   */
  imports: Record<string, string>;
  /** The page's own CSS: host layout (`ui-stack`, `ui-grid`, `ui-note`) and design tokens. */
  styles?: string;
  /** Document title. */
  title?: string;
}

export interface RegisterComposeAppOptions extends ComposeViewOptions {
  catalog: Catalog;
  /** MCP tool name. Default `show_page`. */
  name?: string;
  /** `ui://` resource for the view. */
  resourceUri?: string;
  /** Appended to the tool description: what the agent may fill ids from, house rules. */
  instructions?: string;
}

/** The view HTML: an import map, the host's CSS, and a module that renders tool results. */
export function composeViewHtml(options: ComposeViewOptions): string {
  const importMap = JSON.stringify({ imports: options.imports }).replace(/</g, "\\u003c");
  const styles = (options.styles ?? "").replace(/<\/style/gi, "<\\/style");
  const title = (options.title ?? "Page").replace(/[<&]/g, "");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <script type="importmap">${importMap}</script>
    <style>${styles}</style>
  </head>
  <body>
    <main id="page"></main>
    <script type="module">
      import { App } from "@modelcontextprotocol/ext-apps";
      import { connectView } from "mountly-compose";

      const app = new App({ name: "mountly-compose", version: "1.0.0" });
      connectView(app, document.querySelector("#page"), {
        request: "Show the updated page with ${DEFAULT_TOOL_NAME}.",
      });
      await app.connect();
    </script>
  </body>
</html>
`;
}

/** Every origin the view loads code or data from, for its content security policy. */
function originsOf(options: RegisterComposeAppOptions): string[] {
  const urls = [
    ...Object.values(options.imports),
    ...options.catalog.elements.flatMap((el) => (el.embed ? [el.embed] : [])),
  ];
  const origins = new Set<string>();
  for (const url of urls) {
    try {
      origins.add(new URL(url).origin);
    } catch {
      // A relative URL is same-origin with the view and needs no entry.
    }
  }
  return [...origins];
}

function tagsOf(node: Tree, into = new Set<string>()): Set<string> {
  into.add(node.tag);
  for (const child of node.children ?? []) tagsOf(child, into);
  return into;
}

/**
 * What the view renders with: the page, and the catalog's elements and actions.
 * All the elements, not just the page's: an action names the widgets the next
 * page must show, and the view hands that to the agent on the next turn.
 */
function viewPayload(catalog: Catalog, page: Tree) {
  return { page, elements: catalog.elements, actions: catalog.actions };
}

/**
 * Register the `show_page` tool and its `ui://` view on an MCP server.
 *
 * The input is `{ page }`, typed loosely on purpose: a strict schema would make
 * the SDK reject a near-miss before the handler could repair it. The handler
 * validates against the catalog, strips small mistakes, and otherwise returns
 * the reasons as a tool error the agent can act on.
 */
export function registerComposeApp(
  server: McpServer,
  options: RegisterComposeAppOptions,
): { tool: string; resourceUri: string } {
  const { catalog } = options;
  const name = options.name ?? DEFAULT_TOOL_NAME;
  const resourceUri = options.resourceUri ?? DEFAULT_RESOURCE_URI;
  if (!resourceUri.startsWith("ui://")) {
    throw new Error(
      `mountly-mcp/compose: resourceUri must use 'ui://' (received '${resourceUri}')`,
    );
  }
  const origins = originsOf(options);
  const csp = { connectDomains: origins, resourceDomains: origins, frameDomains: [] };
  const html = composeViewHtml(options);

  registerAppResource(
    server,
    "compose_view",
    resourceUri,
    {
      mimeType: RESOURCE_MIME_TYPE,
      description: "A page composed from teams' custom elements.",
      _meta: { ui: { prefersBorder: false, csp } },
    },
    async () => ({
      contents: [
        { uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html, _meta: { ui: { csp } } },
      ],
    }),
  );

  const description = [
    `Show the user a page built from the components below. Call it with { "page": <tree> }.`,
    `To change the page, call it again with the whole updated page.`,
    options.instructions ?? "",
    "",
    catalog.prompt(),
  ]
    .filter((line, index) => line || index > 2)
    .join("\n");

  registerAppTool(
    server,
    name,
    {
      title: "Show page",
      description,
      inputSchema: { page: z.unknown().describe("The page as a tree: { tag, attrs, children }.") },
      _meta: { ui: { resourceUri, visibility: ["model", "app"] } },
    } as never,
    (async (args: { page?: unknown }) => {
      const errors = catalog.validate(args.page);
      let page = args.page as Tree;
      let note = "";
      if (errors.length) {
        const { tree, dropped } = catalog.repair(args.page);
        if (!tree || catalog.validate(tree).length) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `The page cannot be shown:\n${errors.join("\n")}\nFix these and call ${name} again.`,
              },
            ],
          };
        }
        page = tree;
        note = ` Removed what the catalog does not allow: ${dropped.join("; ")}.`;
      }
      const hostTags = new Set(
        catalog.elements.filter((el) => el.team === "host").map((el) => el.tag),
      );
      const tags = [...tagsOf(page)].filter((tag) => !hostTags.has(tag));
      return {
        content: [{ type: "text", text: `Showing ${tags.join(", ") || "the page"}.${note}` }],
        structuredContent: viewPayload(catalog, page),
      };
    }) as never,
  );

  return { tool: name, resourceUri };
}
