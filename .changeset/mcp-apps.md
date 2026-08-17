---
"mountly-mcp": major
"mountly-vite-plugin": minor
"mountly-manifest": patch
"mountly-react": patch
"mountly-svelte": patch
"mountly-vue": patch
"mountly": patch
---

MCP Apps: spec vocabulary, a real development host, conformance verification,
and a TypeScript 7 build.

**Breaking:** renamed type aliases are gone. `mountly-mcp` now re-exports the
MCP Apps spec names from `@modelcontextprotocol/ext-apps` directly, so there is
one vocabulary to learn instead of two:

| Removed                  | Use instead                             |
| ------------------------ | --------------------------------------- |
| `DisplayMode`            | `McpUiDisplayMode`                      |
| `HostContext`            | `McpUiHostContext`                      |
| `HostCapabilities`       | `McpUiHostCapabilities`                 |
| `AppCapabilities`        | `McpUiAppCapabilities`                  |
| `McpHost`                | `App`                                   |
| `McpCsp`                 | `McpUiResourceCsp`                      |
| `McpResourceMeta`        | `McpUiResourceMeta`                     |
| `McpResourcePermissions` | `McpUiResourcePermissions`              |
| `McpToolMeta`            | `McpUiToolMeta`                         |
| `McpToolVisibility`      | `McpUiToolVisibility`                   |
| `ToolInput`              | `McpUiToolInputNotification["params"]`  |
| `ToolResult`             | `McpUiToolResultNotification["params"]` |

`McpWidgetProps` and `McpResourceDeclaration` stay — they are mountly's own.

## Build a View from any framework

- `mountly-mcp/vue` and `mountly-mcp/svelte` — build MCP App views from Vue and
  Svelte components, not just React.
- `mountly-mcp/vite` — a Vite plugin that turns a component entry into a
  `ui://` resource plus sidecar in one `vite build`.
- `mountlyMcpWidget({ apps: [...] })` builds multiple independent Views through
  Vite build environments and emits `dist/mountly-mcp.manifest.json`. Use
  `mountly-mcp build` for the full collection and `mountly-mcp dev --app <name>`
  to select one View during development. The original single-View configuration
  continues to work.
- `streamToolInput` opt-in for `ui/notifications/tool-input-partial`, surfaced
  as `toolInputPartial` (and `useToolInputPartial()` in React).
- `useRequestDisplayMode()`, which honours the spec's requirement to check
  `availableDisplayModes` before requesting a change.

## Develop against a real host

```bash
npx mountly-mcp dev
```

Builds the widget, serves it in a local host, and rebuilds on save. Config comes
from the `mountlyMcpWidget()` plugin already in your vite config, so there is
nothing extra to set up.

It's a real host rather than a preview: two origins as the spec requires, a
sandbox proxy that enforces the CSP and permissions the sidecar declares, and
the full `ui/initialize` handshake. Sample tool results come from
`mcp.fixtures.json`, one button each, so the update path is exercised and not
just the first render.

`--server ./server.js` points it at a module default-exporting your MCP server.
Fixtures then carry the tool's arguments and the view renders what your handler
really returns, and tool calls the view makes itself — including `visibility:
["app"]` tools the model never sees — are routed to your server instead of
returning a stub.

`mountly-mcp/dev` exports `startDevHost`, `connectMcpServer` for driving an
untransported server module in-process, and `sandboxProxyHtml()`. The sandbox
proxy is the security boundary — it builds the CSP from the sidecar and decides
what a View may execute and reach — and is now one compiled module rather than a
string copied into every harness that needs a host, with runtime text escaped
before inline-script insertion so a future `</script>` literal cannot break the
document. The browser-side host protocol is implemented by the official
published `AppBridge`; Mountly owns only the development UI, server routing, and
the proxy around it.

## Install into the server you own

`registerMcpApps(server, { views, tools })` installs Views and linked tools into
an existing unconnected `McpServer`, leaving transport, auth, ordinary MCP
features, and deployment under application control. `createMcpAppServer` and
`serveStdio` are retained as compatibility conveniences.

## Verify what you built

`mountly-mcp verify` and the public `mountly-mcp/testing` module provide one
conformance engine for local use and CI. Errors fail; warnings fail only with
`--strict`. Static reports identify themselves without creating a warning.
`--render` loads each View in a real browser, waits for the bridge's explicit
mounted state, and fails on timeout, mount errors, or an empty View root.
`report.mode` names the tier that produced a result. Playwright remains an
optional peer.

The bridge publishes that outcome as `data-mountly-mcp-state` on the View root —
`mounted` once your widget's `mount` resolves, `error` if the boundary replaced
it. It only moves forward, so end-to-end tests can wait on it too.

## TypeScript 7

TypeScript 7 is the native compiler and its npm package no longer exports the
classic in-process compiler API, so everything that reached for it needed a new
route.

Declarations now come from `tsc --emitDeclarationOnly` in each package's build
script instead of tsup's `dts` step, which depends on `rollup-plugin-dts` and
that removed API. Every `types` path in every `exports` map is unchanged —
`src/x.ts` still lands at `dist/x.d.ts` — but declarations are emitted per
module rather than bundled per entry, so a `.d.ts` may now import from a sibling
`.d.ts` in the same package.

`mountlyManifestFragmentPlugin` asks the TypeScript checker
(`typescript/unstable/sync`) which names a source entry exports, replacing a
hand-walked AST. The checker sees through re-exports and `export * from`, which
the walk missed, and type-only exports are dropped — `types.module` and
`types.exports[…].names` describe what a host can import at runtime. Declaration
emit for the fragment drives the `tsc` binary, so the widget's own tsconfig
stays authoritative.

## Fixed

- The Vite plugin now replaces `process.env.NODE_ENV`. Vite's lib mode leaves it
  for a consuming bundler, but the bundle is inlined into HTML and run in a
  sandboxed iframe where `process` is undefined — so React and Vue views threw
  on their first environment check. Any view built with `mountly-mcp/vite`
  should be rebuilt.
- `_meta.ui.visibility` is emitted as an array (`["app"]`), as the spec
  requires, instead of a bare string.
- Servers negotiate the `io.modelcontextprotocol/ui` extension and fall back to
  text-only tools (no UI metadata, no `ui://` resources, no app-only tools) for
  hosts that don't support MCP Apps.
- Tool results always carry a `content` block, derived from `structuredContent`
  when a handler omits it.
- `awaitToolResult` and `displayModes` now reach the view, so `ui/initialize`
  matches what the sidecar declares.
- CDN-mode HTML loads the widget bundle before the bridge, which previously
  threw on boot.
- Plain JSON Schema tool inputs and outputs are converted for SDK 1.x instead of
  crashing during tool registration; existing Zod schemas/raw shapes remain
  supported.
- The view bridge now composes with consumer notification handlers, relies on
  the SDK's single automatic resize observer, and cleans up listeners and the
  owned transport during teardown.
- Immediate views receive the initial host context, and failed initialization
  renders an error state without leaking an unhandled promise rejection.
- `mountly`'s dynamic-import helper no longer builds its `Function` at module
  scope, so bundles boot under the CSP MCP Apps hosts enforce.
- The official `@modelcontextprotocol/sdk` is now a runtime dependency rather
  than an optional peer, so `mountly-mcp/server` works from a normal install.

The package moved to `packages/mcp-apps/` in the repo — the published name is
still `mountly-mcp`, so nothing changes for installs.
