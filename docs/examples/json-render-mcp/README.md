# json-render-mcp

The smallest complete MCP App backed by a [json-render](https://github.com/vercel-labs/json-render)
catalog. One catalog drives three things at once: the tool's input schema, the
tool's description, and the React components that render the result inside the
host's sandboxed iframe.

```bash
pnpm --filter json-render-mcp-example verify
```

## What this demonstrates

1. **One catalog, one source of truth** (`src/catalog.ts`) — `createJsonRenderMcpApp`
   derives the tool's `spec` input schema from `catalog.zodSchema()` and its
   description from `catalog.prompt()`. There is no hand-written prompt and no
   hand-written JSON Schema.
2. **A real iframe app** (`src/app.tsx`) — `useJsonRenderApp` performs the MCP
   Apps handshake, receives the spec from the tool result, and renders it with
   json-render's React renderer.
3. **Interop with `@json-render/mcp`** — the tool returns the spec in both wire
   formats, so an iframe written against either package renders this server.
4. **Tolerant rendering** — a spec that misses a field, or names a component the
   catalog never declared, still renders whatever resolves instead of failing
   the whole call.

## Files

| File               | What it does                                                      |
| ------------------ | ----------------------------------------------------------------- |
| `src/catalog.ts`   | The component vocabulary the model may compose                    |
| `src/registry.tsx` | Native React implementations, typed against the catalog           |
| `src/app.tsx`      | The iframe entry: `useJsonRenderApp` + json-render's renderer     |
| `demo-core.mjs`    | Bundles the app, builds the HTML resource, creates the MCP server |
| `verify.mjs`       | Drives the whole flow in-process and asserts each step            |
| `serve-stdio.mjs`  | Serves the same server over stdio for a real host                 |

## The tool contract

The tool takes a single `spec` argument, matching `@json-render/mcp`:

```json
{
  "name": "render_ui",
  "arguments": {
    "spec": {
      "root": "root",
      "elements": {
        "root": { "type": "Stack", "props": { "gap": 20 }, "children": ["title"] },
        "title": { "type": "Heading", "props": { "text": "Revenue" }, "children": [] }
      }
    }
  }
}
```

The result carries that spec twice — as JSON in `content[0].text` (what
`@json-render/mcp`'s iframe hook reads) and as `structuredContent.spec` (what
Mountly's hosts read). `useJsonRenderApp` accepts either, so the two packages
mix freely.

## Server

`demo-core.mjs` reduces to this once the HTML is bundled:

```ts
import { createJsonRenderMcpApp } from "mountly-mcp/json-render/mcp";

const server = createJsonRenderMcpApp({
  name: "json-render-example",
  version: "1.0.0",
  catalog,
  html,
  tool: {
    name: "render_ui",
    title: "Render UI",
    resourceUri: "ui://json-render-example/view.html",
  },
});

await server.listen(new StdioServerTransport());
```

## Iframe app

```tsx
const Dashboard = createRenderer(catalog, components);

function View() {
  const { spec, connected, error } = useJsonRenderApp({
    name: "json-render-mcp-example",
    version: "1.0.0",
  });

  if (error) return <p>{error.message}</p>;
  if (!connected) return <p>Connecting…</p>;
  if (!spec) return <p>Waiting for a tool result…</p>;
  return <Dashboard spec={spec} state={spec.state} />;
}
```

`useJsonRenderApp` also returns `callServerTool(name, args)` for refresh and
drill-down interactions: it calls a tool on the server and replaces the spec
with the result.

## Bundling the HTML

The host serves the view as one self-contained page, so the app is bundled with
everything inlined and wrapped by `buildAppHtml`:

```ts
import { buildAppHtml } from "mountly-mcp/json-render/app";

const html = buildAppHtml({ title: "json-render MCP App", js, css });
```

## Connecting a real client

```bash
pnpm --filter json-render-mcp-example serve:stdio
```

**Cursor** — `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "json-render": {
      "command": "node",
      "args": ["/absolute/path/to/docs/examples/json-render-mcp/serve-stdio.mjs"]
    }
  }
}
```

**Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json`,
same `mcpServers` block.

## Related

- `mcp-generative-demo/` — the agent loop: a model _generates_ the spec and a
  button in the rendered UI drives the next turn.
- `mcp-app-demo/` — MCP Apps without json-render, using a plain React widget.
