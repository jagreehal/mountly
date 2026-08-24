---
name: add-app-to-server
description: >
  Add UI to an existing MCP server, add an MCP Apps View to a tool, enrich MCP
  tools with interactive UI, or install MCP Apps without rewriting transport or
  auth. Use Mountly (mountly-mcp) as the View layer. Do not rewrite the server
  with raw ext-apps View HTML.
---

# Add UI to an existing MCP server with Mountly

Keep the user's transport, auth, prompts, and ordinary tools. Mountly only
installs Views + UI-linked tools via `registerMcpApps` before `connect`.

## Do not

- Clone the Mountly or ext-apps monorepos
- Replace working `server.tool()` registrations wholesale
- Hand-write `ui://` HTML / postMessage protocol
- Call `server.connect(...)` before `registerMcpApps`

## Steps

1. Inventory tools whose results need UI (tables, forms, dashboards).
2. Add a View package beside the server (Vite app). Wrap a component with `createMcpView(...)`.
3. Configure Vite: `mountlyMcpViews({ apps: [{ entry, uri, name, … }] })`. URI must start with `ui://`.
4. Build: `npx mountly-mcp build` → `dist/mountly-mcp.manifest.json`.
5. Register before connect:

```ts
import { readMcpAppManifest } from "mountly-mcp/artifact";
import { registerMcpApps } from "mountly-mcp/server";

// existing McpServer instance, BEFORE server.connect(...)
const { artifacts } = await readMcpAppManifest("dist/mountly-mcp.manifest.json");

await registerMcpApps(server, {
  views: artifacts.map((artifact) => ({ artifact })),
  tools: [
    {
      name: "existing_or_new_tool",
      resourceUri: "ui://my-server/dashboard",
      config: {
        description: "…",
        inputSchema: {
          /* Zod or JSON Schema the server already uses */
        },
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
      handler: async () => ({ structuredContent: {} }),
    },
  ],
});
```

6. Leave non-UI tools on `server.tool(...)`.
7. Export a factory as default, then:
   `npx mountly-mcp dev --server ./path-to-factory.mjs --app <name>`
8. Verify: `npx mountly-mcp verify --strict` (CI: add `--render`).

## Reading tool data in the View

```ts
const result = useToolResult<{ structuredContent?: MyData }>();
const data = result?.structuredContent; // React; Vue: result.value?.structuredContent
```

App-initiated calls: `useMcpApp().callServerTool({ name, arguments })`.

## Greenfield instead?

If there is no server yet, use the `create-mcp-app` skill / `npx mountly-mcp create`.
