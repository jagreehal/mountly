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

## Advanced: json-render

`mountly-mcp/json-render` is optional catalog-driven UI. Start with `create` /
`createMcpView`. Docs: [Generative UI](https://mountly.dev/concepts/generative-ui/).

## Exports

| Entry                     | Contents                             |
| ------------------------- | ------------------------------------ |
| `mountly-mcp`             | `runBridge`, `publishMcpView`, types |
| `mountly-mcp/react`       | `createMcpView` + hooks              |
| `mountly-mcp/vue`         | `createMcpView` + composables        |
| `mountly-mcp/svelte`      | `createMcpView` (props)              |
| `mountly-mcp/vite`        | `mountlyMcpViews()`                  |
| `mountly-mcp/artifact`    | Manifest APIs                        |
| `mountly-mcp/server`      | `registerMcpApps`                    |
| `mountly-mcp/dev`         | Local host helpers                   |
| `mountly-mcp/testing`     | `verifyMcpApps`                      |
| `mountly-mcp/json-render` | Generative path                      |

## See also

- [`mcp-release-readiness`](../../docs/examples/mcp-release-readiness) — production-shaped Vite View
- [`mcp-app-demo`](../../docs/examples/mcp-app-demo) — protocol harness
- [Host matrix](https://mountly.dev/mcp-apps/host-matrix/)
