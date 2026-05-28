# mountly-mcp

Bridge runtime and build helpers for publishing mountly widgets as MCP Apps `ui://` resources.

## Exports

- `runBridge` from `mountly-mcp` (iframe runtime lifecycle)
- `buildMcpResource` from `mountly-mcp/build` (emit `html` + `.meta.json` sidecar)
- `createMcpHost` and channel helpers from `mountly-mcp/bridge`

## Build a resource

```ts
import { buildMcpResource } from "mountly-mcp/build";

await buildMcpResource({
  entry: "./dist/widget.js",
  uri: "ui://example/hello",
  name: "hello-widget",
  output: "./dist/hello.html",
  awaitToolResult: true,
});
```

This writes:

- `./dist/hello.html`
- `./dist/hello.html.meta.json`

Use these with `mountly-mcp-server`.

## See also

- `docs/how-to-test.md`
- `examples/mcp-app-demo/README.md`

