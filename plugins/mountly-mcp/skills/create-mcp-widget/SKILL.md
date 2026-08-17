---
name: create-mcp-widget
description: Turn an existing React, Vue or Svelte component into an MCP App view (SEP-1865) with mountly-mcp — the ui:// resource, its sidecar, and the MCP server that serves it. Use when the user wants to add UI to an MCP server from components they already have, or asks for an MCP App in Vue or Svelte.
---

# Create an MCP App view from an existing component

Use this when someone already has a component — React, Vue or Svelte — and
wants it rendered inside Claude, ChatGPT, or any MCP Apps host. If they're
starting from nothing and are happy writing plain HTML, the official
`@modelcontextprotocol/ext-apps` skills are the shorter path; `mountly-mcp`
earns its place when there's an existing component (especially a non-React one)
and a build to fit into.

## What you are producing

Three files and a config change:

1. a widget entry that wraps the component and publishes it,
2. a Vite config that emits the `ui://` resource,
3. a server that registers the resource and the tool that drives it.

## 1. Install

```bash
npm install mountly-mcp mountly @modelcontextprotocol/sdk
# plus the adapter for the framework in play:
npm install mountly-react   # or mountly-vue / mountly-svelte
```

## 2. The widget entry

The entry's only job is to wrap the component and put it on
`globalThis.__mountlyMcpWidget__`, which is what the bridge looks for.

```ts
// src/widget.ts
import { createMcpWidget } from "mountly-mcp/vue"; // or /react, /svelte
import Dashboard from "./Dashboard.vue";

(globalThis as { __mountlyMcpWidget__?: unknown }).__mountlyMcpWidget__ =
  createMcpWidget(Dashboard);
```

The bridge provides `mcp`, `toolInput`, `toolResult`, and `hostContext`.
React and Vue consume these in their wrapper and expose them at any depth,
without changing the component's existing prop API:

| React                     | Vue                        |
| ------------------------- | -------------------------- |
| `useMcpHost()`            | `useMcpHost()`             |
| `useToolResult<T>()`      | `useToolResult<T>()` (ref) |
| `useHostContext()`        | `useHostContext()` (ref)   |
| `useRequestDisplayMode()` | `useRequestDisplayMode()`  |

Svelte has no context helpers — pass the props down. See the note in
`mountly-mcp/svelte`.

`useToolResult<T>()` returns the complete MCP result envelope. Type it as, for
example, `{ structuredContent?: Weather }` and read `result.structuredContent`.

**Theming:** call `useHostStyles()` (React) so the host's CSS variables and
fonts apply, and give every variable you use a fallback — hosts may send a
subset or none.

## 3. The build

```ts
// vite.config.ts
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { mountlyMcpWidget } from "mountly-mcp/vite";

export default defineConfig({
  plugins: [
    vue(), // the framework plugin compiles SFCs; mountly-mcp packages the result
    mountlyMcpWidget({
      entry: "src/widget.ts",
      uri: "ui://weather-server/dashboard", // MUST start with ui://
      name: "weather_dashboard",
      displayModes: ["inline", "fullscreen"],
      prefersBorder: true,
      // Declare every external origin the view needs; anything undeclared is
      // blocked by the host's CSP.
      csp: { connectDomains: ["https://api.weather.com"] },
    }),
  ],
});
```

`vite build` writes `dist/weather_dashboard.html` and
`dist/weather_dashboard.html.meta.json`.

## 4. The server

```ts
// src/server.ts
import { serveStdio } from "mountly-mcp/server";

await serveStdio({
  name: "weather-server",
  version: "1.0.0",
  widgets: [
    {
      uri: "ui://weather-server/dashboard",
      htmlPath: "dist/weather_dashboard.html",
      tool: {
        name: "get_weather",
        description: "Get the forecast for a location",
        inputSchema: { type: "object", properties: { location: { type: "string" } } },
        handler: async ({ location }) => ({
          structuredContent: { location, temperature: 72 },
        }),
      },
    },
  ],
});
```

`structuredContent` is what the view renders; a text `content` block is added
automatically so text-only hosts and the model still get an answer.

## Rules worth not breaking

- **`ui://` only.** Any other scheme is rejected at config time.
- **Never write to stdout** in a stdio server — it's the JSON-RPC channel. Log
  to stderr.
- **Declare CSP domains.** No declaration means no external requests; that's
  the spec's secure default, not a bug to work around.
- **App-only tools:** `visibility: ["app"]` hides a tool from the model while
  the view can still call it — refresh buttons, form submits. It's an array.
- **Don't trust `toolInputPartial`.** It's recovered partial JSON for loading
  states only, and only arrives when the build sets `streamToolInput: true`.

## Verify it

```bash
npx @mcp-use/inspector          # renders the view, not just the protocol
npx @modelcontextprotocol/inspector   # protocol-level check
```

Then connect the server to a real host. Hosts differ on sandbox origins
(`_meta.ui.domain`), theming, and display modes, so a view that works in an
inspector still needs one real run before you call it done.
