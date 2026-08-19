# json-render-mcp

Minimal integration blueprint for serving a json-render catalog as an MCP App
with Mountly.

## What this demonstrates

1. Catalog-driven tool schema and prompt (`@json-render/core`)
2. MCP resource registration for bundled iframe HTML
3. MCP tool registration that returns the spec in both wire formats
4. Iframe-side React hook wiring via `useJsonRenderApp`

## Calling the tool

The tool takes a single `spec` argument, matching `@json-render/mcp`:

```jsonc
{
  "name": "render_ui",
  "arguments": {
    "spec": {
      "root": "root",
      "elements": { "root": { "type": "Text", "props": { "text": "Hello" }, "children": [] } }
    }
  }
}
```

The tool's input schema is generated from `catalog.zodSchema()` and its
description from `catalog.prompt()`, so the model sees the component
vocabulary without any extra prompting. The result carries the spec as JSON in
`content[0].text` **and** as `structuredContent.spec` — an iframe written
against either `@json-render/mcp` or `mountly-mcp` renders it unchanged.

## Server sketch

```ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createJsonRenderMcpApp } from "mountly-mcp/json-render/mcp";
import { catalog } from "./catalog.js";
import { html } from "./dist/app-html.js";

const app = createJsonRenderMcpApp({
  name: "json-render-example",
  version: "1.0.0",
  catalog,
  html,
  tool: {
    name: "render_ui",
    title: "Render UI",
    description: "Render an interactive UI",
    resourceUri: "ui://json-render-example/view.html",
  },
});

await app.listen(new StdioServerTransport());
```

## Iframe app sketch

```tsx
import { JSONUIProvider, Renderer } from "@json-render/react";
import { useJsonRenderApp } from "mountly-mcp/json-render/app";
import { registry } from "./registry";

export function McpAppView() {
  const { spec, loading, connected, error } = useJsonRenderApp({
    name: "json-render-example",
    version: "1.0.0",
  });

  if (error) return <div>Error: {error.message}</div>;
  if (!connected || loading || !spec) return <div>Waiting…</div>;

  return (
    <JSONUIProvider registry={registry} initialState={spec.state ?? {}}>
      <Renderer spec={spec} registry={registry} loading={loading} />
    </JSONUIProvider>
  );
}
```

## Bundling HTML

```ts
import { buildAppHtml } from "mountly-mcp/json-render/app";
import { readFileSync } from "node:fs";

const html = buildAppHtml({
  title: "json-render MCP App",
  js: readFileSync("dist/app.js", "utf8"),
  css: readFileSync("dist/app.css", "utf8"),
});
```

## Cursor configuration

```json
{
  "mcpServers": {
    "json-render": {
      "command": "npx",
      "args": ["tsx", "path/to/server.ts", "--stdio"]
    }
  }
}
```
