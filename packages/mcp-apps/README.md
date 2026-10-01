# mountly-mcp

Build MCP Apps Views from React, Vue, or Svelte. New apps or components you
already ship.

[MCP Apps](https://github.com/modelcontextprotocol/ext-apps) (SEP-1865) is the
protocol. Official packages speak the wire. `mountly-mcp` is the View kit:
component → `ui://` resource → local host → `registerMcpApps` on your server.

```bash
npx mountly-mcp create my-app --framework react
cd my-app && pnpm install && pnpm dev
```

```ts
import { createMcpView } from "mountly-mcp/react";
import Dashboard from "./Dashboard";

createMcpView(Dashboard);
```

`--framework`: `react` | `vue` | `svelte` | `vanilla`. Vanilla calls
`publishMcpView` with `mount` / `update` / `unmount`. No framework runtime.

## vs ext-apps

| Need                                                    | Package                          |
| ------------------------------------------------------- | -------------------------------- |
| Host / bridge protocol                                  | `@modelcontextprotocol/ext-apps` |
| Component → View → `dev` → `verify` → `registerMcpApps` | `mountly-mcp`                    |

Details: [Mountly vs ext-apps](https://mountly.dev/mcp-apps/vs-ext-apps/).

## Agent Skills

| Skill                                                                              | Ask for                             |
| ---------------------------------------------------------------------------------- | ----------------------------------- |
| [`create-mcp-app`](../../plugins/mountly-mcp/skills/create-mcp-app/SKILL.md)       | "Create an MCP App"                 |
| [`add-app-to-server`](../../plugins/mountly-mcp/skills/add-app-to-server/SKILL.md) | "Add UI to my MCP server"           |
| [`convert-web-app`](../../plugins/mountly-mcp/skills/convert-web-app/SKILL.md)     | "Turn my component into an MCP App" |
| [`migrate-ext-apps`](../../plugins/mountly-mcp/skills/migrate-ext-apps/SKILL.md)   | "Migrate from ext-apps"             |

```
/plugin marketplace add jagreehal/mountly
/plugin install mountly-mcp@mountly
```

Or `npx skills add jagreehal/mountly`. Docs: [Agent Skills](https://mountly.dev/mcp-apps/agent-skills/).

## Install

```bash
# React (default). mountly + mountly-react are included.
npm install mountly-mcp react react-dom

# Vue / Svelte
npm install mountly-mcp mountly-vue vue   # or mountly-svelte + svelte
```

Add `@modelcontextprotocol/sdk` when you import `McpServer`.

Peers: Node 20+ (22 preferred), React 18 or 19. Scaffolds pin Vite 8.
`npx mountly-mcp doctor` checks a project.

## Build

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { mountlyMcpViews } from "mountly-mcp/vite";

export default defineConfig({
  plugins: [
    react(),
    mountlyMcpViews({
      apps: [
        {
          entry: "src/view.tsx",
          uri: "ui://weather-server/dashboard",
          name: "weather_dashboard",
          displayModes: ["inline", "fullscreen"],
          csp: { connectDomains: ["https://api.weather.com"] },
        },
      ],
    }),
  ],
});
```

```bash
npx mountly-mcp build
```

Writes HTML and `dist/mountly-mcp.manifest.json`.

## Develop

```bash
npx mountly-mcp dev --server ./server.mjs
npx mountly-mcp dev --app weather_dashboard --server ./server.mjs
```

Real AppBridge host plus sandbox CSP. Tool arguments come from
`mcp.fixtures.json`.

## Production server

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readMcpAppManifest } from "mountly-mcp/artifact";
import { registerMcpApps } from "mountly-mcp/server";

const server = new McpServer(
  { name: "weather-server", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {} } },
);
const { artifacts } = await readMcpAppManifest("dist/mountly-mcp.manifest.json");

await registerMcpApps(server, {
  views: artifacts.map((artifact) => ({ artifact })),
  tools: [
    {
      name: "get_weather",
      resourceUri: "ui://weather-server/dashboard",
      config: {
        inputSchema: { type: "object", properties: { location: { type: "string" } } },
      },
      handler: async ({ location }) => ({
        structuredContent: { location, temperature: 72 },
      }),
    },
  ],
});
// connect with YOUR transport after this
```

Call `registerMcpApps` before `connect`. You keep auth, transport, and deploy.

## ChatGPT / OpenAI extensions

Install the optional peer [`@openai/mcp-extensions`](https://www.npmjs.com/package/@openai/mcp-extensions)
for ChatGPT entrypoints, mentions, forms, and settings. Mountly helpers import that SDK.

```bash
pnpm add @openai/mcp-extensions
```

**Resource metadata** — pass `openaiUi` on the Vite View (or `buildMcpResource`).
`registerMcpApps` writes it to `_meta["openai/ui"]` on the `ui://` resource:

```ts
mountlyMcpViews({
  apps: [
    {
      entry: "src/view.tsx",
      uri: "ui://parts/library",
      name: "parts_library",
      openaiUi: {
        preferredDisplayMode: "fullscreen",
        availableDisplayModes: ["inline", "fullscreen"],
      },
    },
  ],
});
```

**Tool entrypoints** — merge typed `openai/ui` into the tool `_meta`:

```ts
import {
  enableOpenAiExtensions,
  openaiUiToolMeta,
} from "mountly-mcp/openai/server";

const openai = enableOpenAiExtensions(server); // mentions, settings, elicitInput

await registerMcpApps(server, {
  views: artifacts.map((artifact) => ({ artifact })),
  tools: [
    {
      name: "parts.library",
      resourceUri: "ui://parts/library",
      config: {
        title: "Parts Library",
        inputSchema: {},
        _meta: {
          ...openaiUiToolMeta({
            entrypoints: [{ type: "global" }],
          }),
        },
      },
      handler: async () => ({ structuredContent: {} }),
    },
  ],
});
```

**View-side** — import from the OpenAI React entry:

```ts
import { useOpenAIExtensions } from "mountly-mcp/react/openai";

function Library() {
  const openai = useOpenAIExtensions();
  // openai.message, openai.deepLink, openai.files, …
}
```

**Entrypoint types** place one View on several ChatGPT surfaces. Other hosts
ignore `openai/ui` and render the View inline:

| `type`     | ChatGPT surface                                 | Extra fields                     |
| ---------- | ----------------------------------------------- | -------------------------------- |
| `global`   | Persistent sidebar panel                        | `quickAction` (sidebar shortcut) |
| `thread`   | Conversation panel beside the chat              | none                             |
| `file`     | File viewer/editor for matching extensions      | `extensions`                     |
| `settings` | Plugin settings page                            | `searchTerms`                    |

A file viewer receives the opened file as tool input. Parse it with the SDK schema:

```ts
import { OpenAIFileEntrypointInputSchema } from "@openai/mcp-extensions/server";

{
  name: "parts.open_cad",
  resourceUri: "ui://parts/cad-viewer",
  config: {
    inputSchema: OpenAIFileEntrypointInputSchema.shape,
    _meta: openaiUiToolMeta({
      entrypoints: [{ type: "file", extensions: [".step", ".stl"] }],
    }),
  },
  handler: async ({ file }) => ({ structuredContent: { name: file.name, uri: file.resourceUri } }),
}
```

Smoke in ChatGPT: serve Streamable HTTP at `/mcp`, enable Developer mode, add the
connector, then open a `global` entrypoint from the Desktop sidebar. See the
[host matrix](https://mountly.dev/mcp-apps/host-matrix/).

## MCP Events (experimental)

`mountly-mcp/events` lets your server wake a ChatGPT conversation when something
changes, such as a finished deploy or a new comment. It implements webhook
delivery from the draft MCP Events spec: Standard Webhooks signing, callback
challenge verification, retries with backoff, and `410` cleanup. The API follows
the draft spec.

You need an **MCP 2.0** server (`@modelcontextprotocol/server` v2, protocol
`2026-07-28`). Register the helpers as custom methods:

```ts
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { defineEvents } from "mountly-mcp/events";
import { z } from "zod";

const events = defineEvents({
  events: {
    "deploy.finished": {
      description: "A deploy for the app finished.",
      input: z.object({ app: z.string() }),
      payload: z.object({ app: z.string(), id: z.string(), status: z.enum(["ok", "failed"]) }),
    },
  },
  store: subscriptionsTable, // get/set/delete/values; a Map is fine for dev
  authorize: ({ arguments: args, authInfo }) => canSeeApp(authInfo, args.app),
});

const handler = createMcpHandler(() => {
  const server = new McpServer({ name: "deploys", version: "1.0.0" });
  server.server.registerCapabilities({ events: {} });
  const params = z.looseObject({});
  server.server.setRequestHandler("events/list", { params }, () => events.list());
  server.server.setRequestHandler("events/subscribe", { params }, (p, ctx) =>
    events.subscribe(p, { authInfo: ctx.http?.authInfo }));
  server.server.setRequestHandler("events/unsubscribe", { params }, (p, ctx) =>
    events.unsubscribe(p, { authInfo: ctx.http?.authInfo }));
  return server;
});

// Later, when it happens:
await events.emit(
  "deploy.finished",
  { app: "web", id: "d_42", status: "ok" },
  (args) => args.app === "web",
);
```

Give the events server at least one tool. ChatGPT creates a connector once
`tools/list` succeeds.

`authorize` runs on subscribe and again before each delivery, using the principal
stored at subscribe time, so revoking access stops delivery. Callback URLs use
`https:`; pass `allowCallbackUrl` to restrict them further. Keep `authInfo`
serializable when your store persists subscriptions.

ChatGPT subscribes from Work chats and processes events asynchronously. See the
[`mcp-chatgpt-plugin` example](https://github.com/jagreehal/mountly/tree/main/docs/examples/mcp-chatgpt-plugin) for a
full walkthrough.

## Verify

```bash
npx mountly-mcp doctor
npx mountly-mcp verify
npx mountly-mcp verify --strict --render
```

## Second View

```bash
npx mountly-mcp add settings --framework react
```

## Glossary

[GLOSSARY.md](./GLOSSARY.md). Protocol: [`@modelcontextprotocol/ext-apps`](https://www.npmjs.com/package/@modelcontextprotocol/ext-apps).

## Compose from teams' elements

`mountly-mcp/compose` lets the agent build a page from many teams' custom
elements, using a [`mountly-compose`](../mountly-compose/README.md) catalog read
from their `custom-elements.json`:

```ts
import { loadCatalog } from "mountly-compose";
import { registerComposeApp } from "mountly-mcp/compose";

registerComposeApp(server, {
  catalog: await loadCatalog("https://cdn.acme.com/registry.json", { actions }),
  imports: {
    "mountly-compose": "https://cdn.acme.com/mountly-compose.js",
    "@modelcontextprotocol/ext-apps": "https://cdn.acme.com/ext-apps/app-with-deps.js",
    react: "…",
    "react/jsx-runtime": "…",
    "react-dom/client": "…",
    "mountly-react": "…",
    "mountly/embed": "…",
  },
});
```

The catalog becomes `show_page`'s description, and the agent composes the page.
The handler validates the page and repairs small mistakes. When a page needs
more than a repair, the handler returns the reasons as a tool error for the
agent to fix. The `ui://` view renders with `mountly-compose` and loads each
team's embed on first use. Its CSP allows the origins in `imports` and the
teams' embed origins. The view runs at a `null` origin, so the servers behind
those URLs send `Access-Control-Allow-Origin`. When the user acts in a widget,
the view sends the agent its next turn with the current page. The
[`ai-compose`](../../docs/examples/ai-compose) example runs this in `mcp/`.

## Advanced: json-render

`mountly-mcp/json-render` is optional catalog-driven UI. Start with `create` /
`createMcpView`. Docs: [Generative UI](https://mountly.dev/concepts/generative-ui/).

## Exports

| Entry                     | Contents                                |
| ------------------------- | --------------------------------------- |
| `mountly-mcp`             | `runBridge`, `publishMcpView`, types    |
| `mountly-mcp/react`       | `createMcpView` + hooks                 |
| `mountly-mcp/react/openai` | `useOpenAIExtensions` (ChatGPT peer)   |
| `mountly-mcp/vue`         | `createMcpView` + composables           |
| `mountly-mcp/svelte`      | `createMcpView` (props)                 |
| `mountly-mcp/vite`        | `mountlyMcpViews()`                     |
| `mountly-mcp/artifact`    | Manifest APIs                           |
| `mountly-mcp/server`      | `registerMcpApps`                       |
| `mountly-mcp/openai/server` | ChatGPT helpers (`enableOpenAiExtensions`, `openaiUiToolMeta`) |
| `mountly-mcp/events`      | Experimental MCP Events (`defineEvents`, `signWebhook`) |
| `mountly-mcp/dev`         | Local host helpers                      |
| `mountly-mcp/testing`     | `verifyMcpApps`                         |
| `mountly-mcp/json-render` | Generative path                         |
| `mountly-mcp/compose`     | `registerComposeApp`, `composeViewHtml` |

## See also

- [`mcp-release-readiness`](../../docs/examples/mcp-release-readiness) — production-shaped Vite View
- [`mcp-app-demo`](../../docs/examples/mcp-app-demo) — protocol harness
- [Host matrix](https://mountly.dev/mcp-apps/host-matrix/)
