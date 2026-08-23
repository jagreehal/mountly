---
name: convert-web-app
description: This skill should be used when the user asks to "add MCP App support to my web app", "turn my web app into a hybrid MCP App", "make my web page work as an MCP App too", "wrap my existing UI as an MCP App", "convert iframe embed to MCP App", "turn my SPA into an MCP App", or convert an existing React/Vue/Svelte component into an MCP Apps View with Mountly.
---

# Convert a web component / app into an MCP App View

Mountly's differentiator: the same React, Vue, or Svelte component can run on
a website and as an MCP Apps View. Keep the component's public props; Mountly
supplies tool data through hooks/composables (or Svelte props).

## Do not

- Clone monorepos for a template when the UI already exists
- Rewrite the component to talk postMessage / `App` lifecycle by hand
- Fork the UI into a separate "MCP-only" tree unless the user asks

## Pattern

1. **Identify the component** that should render from tool `structuredContent`.
2. **Thin View entry** that wraps it:

```ts
import { createMcpView, useToolResult } from "mountly-mcp/react";
import { PaymentCard } from "./PaymentCard"; // existing website component

function PaymentView() {
  const result = useToolResult<{ structuredContent?: PaymentData }>();
  const data = result?.structuredContent;
  if (!data) return null;
  return <PaymentCard data={data} />;
}

createMcpView(PaymentView, { shadow: true, styles: existingCss });
```

3. **Vite plugin** with `mountlyMcpViews({ apps: [...] })` — uri must be `ui://…`.
4. **Server** — `registerMcpApps` linking a tool's `resourceUri` to that View.
5. **Theming** — prefer host CSS variables with fallbacks (`var(--color-text-primary, #171717)`). React: `useHostStyles()`.
6. **Standalone still works** — website entry keeps importing `PaymentCard` directly; only the MCP entry uses `createMcpView`.

## Hybrid detection (optional)

If one bundle must run both in a browser page and inside a host iframe, branch on whether MCP bridge props arrive; otherwise prefer **two entries** (website + MCP View) sharing the same component module.

## Verify

```bash
npx mountly-mcp build
npx mountly-mcp verify --render
npx mountly-mcp dev --server ./server.mjs
```
