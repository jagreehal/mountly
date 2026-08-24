---
name: convert-web-app
description: >
  Turn an existing React, Vue, or Svelte component or web app into an MCP Apps
  View with Mountly. Use when the user asks to wrap existing UI as an MCP App,
  convert a SPA or iframe embed to MCP Apps, or reuse a website component as a View.
---

# Convert a web component / app into an MCP App View

Keep the component's public props unchanged. Mountly supplies tool data through
hooks/composables (or Svelte props). Do not rename props to match MCP.

## Do not

- Clone monorepos for a template when the UI already exists
- Rewrite the component to talk postMessage / `App` lifecycle by hand
- Fork the UI into a separate "MCP-only" tree unless the user asks
- Mention islands vocabulary in the View entry

## Pattern

1. Identify the component that should render from tool `structuredContent`.
2. Thin View entry that wraps it (props of the existing component stay the same):

```ts
import { createMcpView, useToolResult } from "mountly-mcp/react";
import { PaymentCard } from "./PaymentCard"; // existing website component

function PaymentView() {
  const result = useToolResult<{ structuredContent?: PaymentData }>();
  const data = result?.structuredContent;
  if (!data) return null;
  return <PaymentCard data={data} />;
}

createMcpView(PaymentView);
```

3. Vite plugin with `mountlyMcpViews({ apps: [...] })`. URI must be `ui://…`.
4. Server: `registerMcpApps` linking a tool's `resourceUri` to that View (before `connect`).
5. Theming: prefer host CSS variables with fallbacks. React: `useHostStyles()`.
6. Website entry keeps importing `PaymentCard` directly. Only the MCP entry uses `createMcpView`.

## Verify

```bash
npx mountly-mcp build
npx mountly-mcp verify --render
npx mountly-mcp dev --server ./server.mjs
```
