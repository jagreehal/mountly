# MCP release-readiness view

A production-shaped Vue example for the Mountly sweet spot: reuse a normal
component as an MCP App, let Mountly build the self-contained `ui://` resource,
and keep custom server behavior on the official MCP SDK primitives.

The reusable component is [`src/ReleaseReadiness.vue`](src/ReleaseReadiness.vue).
It knows nothing about MCP. [`src/McpReleaseReadiness.vue`](src/McpReleaseReadiness.vue)
adapts the tool result and calls the app-only decision tool.

## Verify

From the repository root:

```bash
pnpm --filter mcp-release-readiness verify
```

The command:

1. builds `dist/release_readiness.html` with `mountly-mcp/vite`;
2. registers the resource and two tools with `registerAppResource()` and
   `registerAppTool()` from the official SDK;
3. checks discovery, resource delivery, the model-visible review tool, and the
   app-only decision tool over an in-memory MCP transport.

Run it as a real stdio server with:

```bash
pnpm --filter mcp-release-readiness serve:stdio
```

## Why this architecture

- **Mountly owns the view lifecycle and artifact build.** Vue remains Vue; the
  output is one sandbox-ready HTML resource.
- **The server remains explicit.** Custom transports, authentication, storage,
  and deployment policy can be added without going through a Mountly server
  abstraction.
- **The component remains reusable.** A normal web application can import
  `ReleaseReadiness.vue` and pass a `report` prop directly.
- **The model still gets text.** Both handlers return meaningful `content`
  alongside `structuredContent`.

The fixture data is deterministic and intentionally local. Replace
`releaseReport()` in `server.mjs` with calls to your deployment, observability,
and change-management systems.

To develop the view inside a real MCP Apps host — sandbox proxy, CSP, the full
handshake — with `review_release` and `record_release_decision` served by
`server.mjs`:

```bash
pnpm --filter mcp-release-readiness dev:mcp
```

`mcp.fixtures.json` supplies the tool arguments behind each button, so the
staging and production reports come from `releaseReport()` rather than a
hardcoded sample.

For a direct, non-MCP rendering of the reusable Vue component:

```bash
pnpm --filter mcp-release-readiness dev
```

Open <http://127.0.0.1:5194/preview.html>.
