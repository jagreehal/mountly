# mountly-mcp-server

Opinionated server helper for wiring built `ui://` resources and tools into `@modelcontextprotocol/sdk`.

## Exports

- `createMcpAppServer({ name, version, widgets })`

Each widget registration includes:

- `uri`: resource URI (`ui://...`)
- `htmlPath`: path to emitted HTML from `buildMcpResource`
- `tool`: tool name/schema/handler that returns `structuredContent`

## Usage

```ts
import { createMcpAppServer } from "mountly-mcp-server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = createMcpAppServer({
  name: "demo",
  version: "0.0.1",
  widgets: [
    {
      uri: "ui://example/hello",
      htmlPath: "./dist/hello.html",
      tool: {
        name: "say_hello",
        inputSchema: { type: "object", properties: {} },
        handler: async () => ({
          structuredContent: { greeting: "hello" },
        }),
      },
    },
  ],
});

await server.listen(new StdioServerTransport());
```

