---
"mountly-mcp": major
"mountly-vite-plugin": minor
---

## `verify --render` audits the assembled View

A View that mounts is now checked with [axe](https://github.com/dequelabs/axe-core)
and reports each violation as a `render/a11y` warning naming the rule, its
impact, and the first failing element.

This is the check a component-level tool cannot make. Every component in a View
can be individually accessible and the composition still fail — a missing label,
a heading order, a contrast pairing only exist once the parts are together, and
a View assembled from a prompt is exactly where that happens.

They are warnings, so an ordinary run stays green and only `--strict` fails on
them. `axe-core` joins Playwright as an optional peer; without it the render
tier behaves as before and the audit is skipped. axe is evaluated through the
debugger protocol rather than injected as page script, so it reaches the View
without the CSP granting `unsafe-eval` — the audit sees the same document a host
renders, under the same restrictions.

## One vocabulary for declaring Views and tools

**Breaking:** `createMcpAppServer()` takes `views` and `tools`, exactly as
`registerMcpApps()` does. The `widgets: [{ uri, htmlPath, tool }]` shape and its
`McpWidgetRegistration` / `McpWidgetTool` types are gone.

```ts
// Before
createMcpAppServer({
  name,
  version,
  widgets: [{ uri, htmlPath, tool: { name: "quote", inputSchema, handler } }],
});

// After
createMcpAppServer({
  name,
  version,
  views: [{ uri, artifact: htmlPath }],
  tools: [{ name: "quote", resourceUri: uri, config: { inputSchema }, handler }],
});
```

`createMcpAppServer` was always a thin façade over `registerMcpApps` — it just
owned the `McpServer` — but it accepted a second vocabulary that had to be
translated, and that translation needed dedup logic because the old shape
repeated a View once per tool. Declaring a View that backs several tools is now
one entry and several tools, which is what it always meant.

## `typescript` is an optional peer of `mountly-vite-plugin`

It powers the manifest fragment's `types` block and declaration emit, and
nothing else, so it no longer ships as a hard dependency that drags a compiler
into every install. Projects that build a widget almost always have TypeScript
already. Without it the build still succeeds — the fragment is written without
its `types` block, and typed remotes are unavailable until it is installed.

`mountly-manifest` and `mountly-vite-plugin` also ship READMEs.
