# mountly-vite-plugin

## 1.2.2

### Patch Changes

- mountly-manifest@1.0.3

## 1.2.1

### Patch Changes

- 2ad7d91: Improve runtime correctness, host safety, and MCP Apps DX across core and adapters.
  
  This patch fixes listener and timer leaks, hardens devtools rendering and controls, improves overlay and prefetch behavior, adds MCP sandbox export and verify JSON output, and aligns bootstrap and manifest validation for non-React hosts.
- Updated dependencies [2ad7d91]
  - mountly-manifest@1.0.2

## 1.2.0

### Minor Changes

- c07ea65: ## `verify --render` audits the assembled View
  
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

## 1.1.0

### Minor Changes

- 5c5f022: MCP Apps: spec vocabulary, a real development host, conformance verification,
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

### Patch Changes

- 9865d92: `mountlyHostPlugin` now applies Vite's `base` to the import map it injects.
  
  Import maps are resolved against the document, not the bundler, so a host deployed under a sub-path — GitHub Pages, a reverse proxy, anything that isn't the server root — emitted remote URLs like `/remote/dist/Badge.js` that resolved against the origin root and 404'd. Every remote failed to load.
  
  Production builds now prefix site-relative import-map URLs with the resolved `base`. Absolute (`https:`), protocol-relative (`//`) and `data:` URLs are left untouched, and a root base (`/`) is a no-op, so nothing changes for hosts served from the root. Dev is unaffected — it already resolved through `devOrigins`.
- Updated dependencies [5c5f022]
  - mountly-manifest@1.0.1

## 1.0.0

### Minor Changes

- ad95cff: BREAKING: simplify the package surface. mountly stays import-map-native — the import map already pins one URL per bare specifier, so the browser loads one React. The Module-Federation-style share-scope runtime and SPA-shell layer have been removed; they re-solved a problem import maps don't have.

  Removed packages:

  - `mountly-share` — share-scope resolution + runtime admission. Gone. The genuinely useful check (duplicate-React / version skew) already lives in `validateManifest`, derived from `platform.imports`.
  - `mountly-shell` / `mountly-shell-tanstack` — SPA-shell orchestration. Gone. Use your router's native lazy-route loading (e.g. TanStack Router `createLazyRoute`) to `import()` a remote when its route activates.
  - `mountly-tsrx` — dropped.

  Merged: `mountly-mcp-react`, `mountly-mcp-server`, `mountly-json-render` are now subpaths of `mountly-mcp` (`mountly-mcp/react`, `mountly-mcp/server`, `mountly-mcp/json-render`).

  Folded: `mountly-contracts` is now `mountly/contracts` (zod-free; `mountly` core has zero runtime dependencies again).

  `mountly` (`mountly/runtime`): removed `loadRemote`, `initShareScope`, and the `mountly-share` dependency. `bootstrapMountly` no longer locks a share scope.

  `mountly-manifest`: removed `platform.shared`, per-vertical `shared`, the `mounts`/`routes` schema, `defaultReactPlatformShared`, and all share-scope re-exports. The `mountly manifest resolve` CLI subcommand is gone (`validate` / `compose` / `codegen` remain).

  `mountly-vite-plugin`: removed `mode: "shell"`, `shareStrict`, and the `shared`/`mounts` fragment options; `mountlyHostPlugin` now has one (widget/host) mode. Added `mountlyRemote({ name, exposes })` — a drop-in remote plugin (`vite build`, no build script, no `shared`). `mountlyHostPlugin` gains federation-style `remotes: { name: url }` (fetches the remote's published fragment to auto-wire the import map + types); the previous `remotes` dev-origin-override option is renamed `devOrigins`.

  `mountly-mcp` also gains the `./json-render` subpath: generative UI. `createGenerativeWidget({ catalog, components })` renders [`@json-render`](https://github.com/vercel-labs/json-render) specs as MCP Apps widgets — reading the spec from the tool result, resolving `$state` bindings, and routing the rendered UI's actions back to the agent via `App.sendMessage`. `streamSpec({ catalog, model, prompt })` (the `mountly-mcp/json-render/server` entry, model-agnostic) turns a prompt into UI: `await .result` for the final validated spec, or iterate `.partialSpecStream` to watch the UI build element by element. `useUIStream`/`useChatUI` and `compileTextStreamToSpecs` are re-exported. `streamSpec` also ships local ports of two not-yet-released json-render repairs — a prompt rule requiring a `children` array on every element, and pruning of children references to elements the model never defined (reported in `fixes`) — to be dropped once `@json-render/core` releases past 0.19.0. See `docs/examples/mcp-generative-demo`.

### Patch Changes

- 814f6e8: Fix `exports` condition order so the packages are typed for `node16`/`nodenext` consumers.

  Every subpath listed `import` before `types`. Export conditions match in order, so `import` always won and the `types` condition was never reached — anyone on `moduleResolution: node16` or `nodenext` resolved these packages as untyped and fell back to `any`. `bundler` resolution masked it by finding the adjacent `.d.ts` on its own.

  No runtime change; `types` now comes first on all 38 subpaths.

- Updated dependencies [814f6e8]
- Updated dependencies [ad95cff]
  - mountly-manifest@1.0.0
