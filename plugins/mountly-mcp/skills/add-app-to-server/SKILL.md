---
name: add-app-to-server
description: This skill should be used when the user asks to "add an app to my MCP server", "add UI to my MCP server", "add a view to my MCP tool", "enrich MCP tools with UI", "add interactive UI to existing server", or "add MCP Apps to my server". Use Mountly (mountly-mcp) as the View layer — do not rewrite the server with raw ext-apps View HTML.
---

# Add UI to an existing MCP server with Mountly

Enrich tools the server already has with interactive Views. Keep the user's
transport, auth, prompts, and ordinary tools. Mountly only installs Views +
UI-linked tools via `registerMcpApps`.

## Do not

- Clone the Mountly or ext-apps monorepos
- Replace working `server.tool()` registrations wholesale
- Hand-write `ui://` HTML / postMessage protocol

## Steps

1. **Inventory tools** — which tool results benefit from UI (tables, forms, dashboards)?
2. **Add a View** — wrap a React/Vue/Svelte component with `createMcpView(...)` (it publishes the View for the bridge).
3. **Configure Vite** — `mountlyMcpViews({ apps: [{ entry, uri, name, … }] })`.
4. **Build** — `npx mountly-mcp build` → `dist/mountly-mcp.manifest.json`.
5. **Register before connect**:

```ts
import { readMcpAppManifest } from "mountly-mcp/artifact";
import { registerMcpApps } from "mountly-mcp/server";

// existing McpServer instance, before server.connect(...)
const { artifacts } = await readMcpAppManifest("dist/mountly-mcp.manifest.json");

await registerMcpApps(server, {
  views: artifacts.map((artifact) => ({ artifact })),
  tools: [
    {
      name: "existing_or_new_tool",
      resourceUri: "ui://my-server/dashboard",
      config: {
        description: "…",
        inputSchema: { /* keep Zod or JSON Schema the server already uses */ },
      },
      handler: async (args) => ({
        structuredContent: /* same payload the View reads via useToolResult */,
      }),
    },
    {
      name: "refresh_from_view",
      resourceUri: "ui://my-server/dashboard",
      visibility: ["app"],
      config: { description: "App-only refresh" },
      handler: async () => ({ structuredContent: { /* … */ } }),
    },
  ],
});
```

6. **Ordinary tools stay ordinary** — leave non-UI tools on `server.tool(...)`.
7. **Develop** — `npx mountly-mcp dev --server ./path-to-factory.mjs --app <name>`.
8. **Verify** — `npx mountly-mcp verify --strict`.

## Reading tool data in the View

```ts
const result = useToolResult<{ structuredContent?: MyData }>();
const data = result?.structuredContent; // React; Vue: result.value?.structuredContent
```

App-initiated calls: `useMcpApp().callServerTool({ name, arguments })`.

## Greenfield instead?

If there is no server yet, use the `create-mcp-app` skill / `npx mountly-mcp create`.
