# mountly-mcp

**Build MCP Apps from React, Vue, or Svelte components — new or existing.**

[MCP Apps](https://github.com/modelcontextprotocol/ext-apps) (SEP-1865) lets an
MCP server render interactive UI inside Claude, ChatGPT and other hosts. The
official SDK gives you the protocol. `mountly-mcp` is the view layer on top:
write a component, get a `ui://` resource, a local host, and server registration
without hand-writing the handshake HTML.

```ts
import { createMcpView } from "mountly-mcp/react";
import Dashboard from "./Dashboard";

createMcpView(Dashboard);
```

That path is the default whether the dashboard is three metric cards for one
host or a multi-View production server. Prefer the scaffolder for greenfield:

```bash
npx mountly-mcp create my-app --framework react
cd my-app && pnpm install && pnpm dev
```

`--framework` takes `react`, `vue`, `svelte`, or `vanilla`. Vanilla pulls in no
framework and no adapter: a View is just `mount` / `update` / `unmount`, so
`publishMcpView` takes the object directly and the bridge drives it the same
way it drives the others.

## Build with Agent Skills

| Skill | Try it |
| --- | --- |
| [`create-mcp-app`](../../plugins/mountly-mcp/skills/create-mcp-app/SKILL.md) | _"Create an MCP App"_ |
| [`add-app-to-server`](../../plugins/mountly-mcp/skills/add-app-to-server/SKILL.md) | _"Add UI to my MCP server"_ |
| [`convert-web-app`](../../plugins/mountly-mcp/skills/convert-web-app/SKILL.md) | _"Turn my component into an MCP App"_ |
| [`migrate-ext-apps`](../../plugins/mountly-mcp/skills/migrate-ext-apps/SKILL.md) | _"Migrate from ext-apps"_ |

```
/plugin marketplace add jagreehal/mountly
/plugin install mountly-mcp@mountly
```

Docs: [Agent Skills](https://mountly.dev/mcp-apps/agent-skills/).
`mountly-mcp build` emits a versioned App manifest; `registerMcpApps` installs
the Views into the MCP server you already own. Existing website components stay
reusable as-is.

The wire protocol is delegated to the official `@modelcontextprotocol/sdk` and
`@modelcontextprotocol/ext-apps` packages in full, so server transports,
handshakes, capabilities and message types track the spec rather than a
reimplementation of it. Both are runtime dependencies of `mountly-mcp`.

## Install

```bash
# React (default) — mountly + mountly-react included
npm install mountly-mcp react react-dom

# Vue / Svelte
npm install mountly-mcp mountly-vue vue   # or mountly-svelte + svelte
```

Install `@modelcontextprotocol/sdk` directly only when your application imports
its APIs itself, for example to configure a custom HTTP transport. Mountly's
server entry point does not require a separate SDK install.

## One build, one command

```ts
// vite.config.ts
import vue from "@vitejs/plugin-vue";
import { mountlyMcpViews } from "mountly-mcp/vite";

export default defineConfig({
  plugins: [
    vue(),
    mountlyMcpViews({
      apps: [
        {
          entry: "src/dashboard.ts",
          uri: "ui://weather-server/dashboard",
          name: "weather_dashboard",
          displayModes: ["inline", "fullscreen"],
          csp: { connectDomains: ["https://api.weather.com"] },
        },
        {
          entry: "src/settings.ts",
          uri: "ui://weather-server/settings",
          name: "weather_settings",
        },
      ],
    }),
  ],
});
```

```bash
npx mountly-mcp build
```

Each View is built in an isolated Vite environment and emitted as self-contained
HTML with a transitional `.meta.json` file. The canonical
`dist/mountly-mcp.manifest.json` gives build, dev, registration, and CI one
versioned artifact contract. The original single-View plugin shape and
`vite build` remain supported.

## One command to develop it

```bash
npx mountly-mcp dev
# multi-View project
npx mountly-mcp dev --app weather_dashboard
```

Builds the View, serves it in a local MCP Apps host, and rebuilds on save.
Config comes from the plugin already in your vite config.

It's a real host, not a preview: the published official `AppBridge` drives the
handshake and host behavior, while Mountly supplies two origins and a sandbox
proxy enforcing the CSP and permissions the App artifact declares. Sample tool
results come from `mcp.fixtures.json`,
one button each, so clicking between them exercises the update path:

```json
{ "annual": { "total": 99 }, "monthly": { "total": 12 } }
```

Add `--server ./server.js` (a module default-exporting your server) and the
fixtures become tool _arguments_ instead: the view renders what your handler
really returns, and the tool calls the view makes itself are routed there too.

## Install into your production server

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
      handler: async ({ location }) => ({ structuredContent: { location, temperature: 72 } }),
    },
  ],
});
```

Call `registerMcpApps` before connecting the server. Your application retains
ownership of authentication, transport, prompts, non-UI tools, lifecycle, and
deployment. Views and tools are independent, so several tools can link to one
View and app-only tools use `visibility: "app"`. Mountly negotiates the UI
extension and degrades to text-only model tools for hosts without MCP Apps.

`createMcpAppServer` and `serveStdio` remain as convenience adapters for small
servers and existing projects.

## Verify in CI

```bash
npx mountly-mcp verify
npx mountly-mcp verify --strict
npx mountly-mcp verify --render --strict
```

Static verification is deterministic and offline. `--render` additionally
launches Chromium, waits for the explicit bridge mount state, and rejects Views
that time out, throw, or mount without content. Errors always fail; advisory
warnings fail only under `--strict`. The same engine is exported as
`verifyMcpApps()` from `mountly-mcp/testing` for custom test runners. Install
Playwright and Chromium for the browser tier.

## Reading tool data in a view

The bridge exposes `mcp`, `toolInput`, `toolResult`, and `hostContext`. React
and Vue consume those bridge props in their wrapper and expose them through
hooks/composables, leaving the existing component's props unchanged. Svelte
receives them directly as component props:

```tsx
// React
const result = useToolResult<{ structuredContent?: Quote }>();
const quote = result?.structuredContent;
useHostStyles(); // adopt the host's theme variables and fonts
```

```ts
// Vue
const result = useToolResult<{ structuredContent?: Quote }>(); // a ref
const quote = computed(() => result.value?.structuredContent);
```

Svelte reads the props directly via `$props()` — see `mountly-mcp/svelte`.

## json-render MCP Apps integration

Mountly now exposes a first-class json-render MCP facade so catalog-driven UIs
can be shipped as MCP Apps with minimal protocol code:

```ts
import { createJsonRenderMcpApp } from "mountly-mcp/json-render/mcp";
import { catalog } from "./catalog.js";
import { html } from "./dist/app-html.js";

const app = createJsonRenderMcpApp({
  name: "json-render-dashboard",
  version: "1.0.0",
  catalog,
  html,
  tool: {
    name: "render_ui",
    title: "Render UI",
    description: "Render an interactive dashboard from a json-render spec.",
    resourceUri: "ui://json-render-dashboard/view.html",
  },
});
```

For iframe-side React hosts, use `mountly-mcp/json-render/app`:

```tsx
import { useJsonRenderApp } from "mountly-mcp/json-render/app";

function View() {
  const { spec, loading, connected, error } = useJsonRenderApp({
    name: "json-render-dashboard",
    version: "1.0.0",
  });

  if (error) return <div>{error.message}</div>;
  if (!connected || loading || !spec) return <div>Waiting…</div>;
  return <pre>{JSON.stringify(spec, null, 2)}</pre>;
}
```

`buildAppHtml({ title, js, css })` is also exported from
`mountly-mcp/json-render/app` to generate a self-contained HTML resource.

### Interoperability with `@json-render/mcp`

Mountly's facade is wire-compatible with [`@json-render/mcp`](https://www.npmjs.com/package/@json-render/mcp) in both
directions, so you can mix the two without a bridge:

- **Tool input** is `{ spec }`, typed from `catalog.zodSchema()`, and the tool
  description carries `catalog.prompt()` — the model sees the full component
  vocabulary.
- **Tool output** carries the spec twice: as JSON in `content[0].text` (the
  shape `@json-render/mcp`'s iframe hook reads) and as `structuredContent.spec`
  (what Mountly's own hosts read).
- **`useJsonRenderApp`** reads either shape, so an iframe built with Mountly
  renders a `@json-render/mcp` server unchanged, and vice versa.

One deliberate difference: `@json-render/core` 0.19 generates a _strict_ catalog
schema that requires `visible` and `children` on every element, which rejects
most first-attempt model output at the SDK's input gate. Mountly accepts the
catalog schema **or** a looser spec shape, then validates in the handler and
renders what it can. Drop the loose branch once core relaxes those fields.

## Exports

| Entry                  | What's in it                                             |
| ---------------------- | -------------------------------------------------------- |
| `mountly-mcp`          | `runBridge`, spec types re-exported from ext-apps        |
| `mountly-mcp/react`    | `createMcpView` + hooks                                |
| `mountly-mcp/vue`      | `createMcpView` + composables                          |
| `mountly-mcp/svelte`   | `createMcpView` (props-based)                          |
| `mountly-mcp/vite`     | single- and multi-View `mountlyMcpViews()` build plugin |
| `mountly-mcp/artifact` | versioned manifest and App artifact APIs                 |
| `mountly-mcp/dev`      | `startDevHost()` and in-process server connectivity      |
| `mountly-mcp/build`    | `buildMcpResource` for other bundlers                    |
| `mountly-mcp/server`   | `registerMcpApps` plus convenience server adapters       |
| `mountly-mcp/testing`  | static/browser conformance and report formatting         |

Types use the spec's own names (`McpUiHostContext`, `McpUiDisplayMode`, …) —
one vocabulary, no translation layer.

## Agent Skills

Install the plugin skills and ask your coding agent to create an MCP App:
[Agent Skills docs](https://mountly.dev/mcp-apps/agent-skills/) ·
[`create-mcp-app`](../../plugins/mountly-mcp/skills/create-mcp-app/SKILL.md).

Greenfield without an agent: `npx mountly-mcp create my-app --framework react`.

## See also

- [`docs/examples/mcp-release-readiness`](../../docs/examples/mcp-release-readiness) —
  production-shaped Vite View (closest to `create`)
- [`docs/examples/mcp-app-demo`](../../docs/examples/mcp-app-demo) — advanced
  protocol harness (not the greenfield starter)
- `docs/how-to-test.md`
