# mountly-mcp-react

React integration for MCP Apps widgets built with mountly.

## Exports

- `createMcpWidget(Component, options?)`
- `useMcpHost()`
- `useMcpToolResult<T>()`
- `useMcpDisplayMode()`

## Usage

```tsx
import { createMcpWidget, useMcpHost } from "mountly-mcp-react";

function Hello({ greeting }: { greeting: string }) {
  const mcp = useMcpHost();
  return <button onClick={() => mcp.openLink("https://example.com")}>{greeting}</button>;
}

globalThis.__mountlyMcpWidget__ = createMcpWidget(Hello);
```

`createMcpWidget` injects MCP host context from the bridge-provided `mcp` prop.

