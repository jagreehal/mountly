---
name: migrate-ext-apps
description: This skill should be used when the user asks to "migrate from ext-apps", "migrate from @modelcontextprotocol/ext-apps", "migrate basic-server-react", "replace useApp with Mountly", "migrate from MCP Apps SDK templates", or move an existing official MCP Apps View to mountly-mcp while keeping the protocol SDK underneath.
---

# Migrate an ext-apps View to Mountly

Keep `@modelcontextprotocol/sdk` and `@modelcontextprotocol/ext-apps` as the
protocol layer. Replace hand-rolled View lifecycle / singlefile HTML with a
Mountly View build.

## Mapping

| Official ext-apps | Mountly |
| --- | --- |
| `useApp` / `App` + `connect()` in the View | `createMcpView` + bridge (no manual handshake) |
| `vite-plugin-singlefile` + `mcp-app.html` | `mountlyMcpViews({ apps: [...] })` + `mountly-mcp build` |
| `registerAppTool` / `registerAppResource` | `registerMcpApps({ views, tools })` (or keep resources Mountly registers) |
| Clone `examples/basic-server-*` | `npx mountly-mcp create` for new apps; migrate in place for existing |
| `basic-host` for local preview | `npx mountly-mcp dev --server ./server.mjs` |

## Steps

1. Extract the React/Vue/Svelte UI into a component that reads data from props or `useToolResult`.
2. Add a Mountly entry that calls `createMcpView(...)` (it publishes the View for the bridge).
3. Swap Vite config to `mountlyMcpViews`; remove singlefile HTML entry if unused.
4. Before `server.connect`, call:

```ts
const { artifacts } = await readMcpAppManifest("dist/mountly-mcp.manifest.json");
await registerMcpApps(server, {
  views: artifacts.map((artifact) => ({ artifact })),
  tools: [/* same names/handlers; add resourceUri + visibility */],
});
```

5. Remove View-side `new App()`, `PostMessageTransport`, and manual
   `ontoolresult` wiring — Mountly's bridge owns that.
6. Keep host/bridge protocol code on ext-apps if the user is building a **host**;
   this skill is for **Views** and server registration only.
7. `npx mountly-mcp verify --render --strict`.

## App-only tools

Official `_meta.ui.visibility: ["app"]` maps 1:1 to Mountly tool
`visibility: ["app"]` (string or array).
