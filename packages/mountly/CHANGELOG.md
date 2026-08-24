# mountly

## 1.0.1

### Patch Changes

- cbd6037: Documentation accuracy pass, and golden-path DX for MCP Apps.
  
  `mountly`: the core entry is 2.3 KB gzipped, not the ~9 KB carried over from the
  previous runtime. API stability described a pre-1.0 package and froze a `0.6.x`
  line; it now states the 1.0 surface and its semver commitment. References to the
  `mountly-tsrx` adapter are gone, and React version claims say React 19 to match
  the adapter's declared peer.
  
  `mountly-mcp`: new `doctor` and `add` commands, `vanilla` listed in `--help`, and
  failures that carry a stable `mountly-mcp/...` code plus a `Next:` line naming
  the command or file to open. Scaffolds ship `serve-stdio.mjs` and resolve
  `dist/mountly-mcp.manifest.json` from the server module rather than the working
  directory, which an MCP host chooses for you. Docs gain a host matrix, a Mountly
  vs ext-apps page, canonical examples, and a `GLOSSARY.md` that the skills,
  templates, and docs are tested against.

## 1.0.0

### Major Changes

- 24e4f97: Replace the island runtime with a 2.3 KB core.
  
  `mountly/host/auto` shipped 8.2 KB gzipped across two files; `mountly/auto` ships
  2.3 KB in one. The JSON `data-mountly-island` payload, the loader registry and
  the twenty-odd knobs around them are gone, replaced by plain `data-*`
  attributes.
  
  **Breaking**
  
  - `data-mountly-island='{"id":…,"moduleId":…}'` → `data-mountly="<url>"`,
    `data-on`, `data-preload`, `data-props`, `data-target`, `data-toggle`,
    `data-css`.
  - `mountly/island`, `mountly/host` and `mountly/host/auto` are removed. Use
    `mountly` (`mountly()` / `mount` / `unmount` / `update`) and `mountly/auto`.
  - `createOnDemandFeature` and friends moved from `mountly` to `mountly/feature`.
  - `skipIfHydrated`, `forceRemount`, `hydratedAttr`, `requireSsrMarker`,
    `ssrMarkerAttr` and `warnOnHydrationMismatch` collapse into
    `data-mountly-state="mounted"`.
  - `waitForParent` is gone: a MutationObserver picks up islands added at any
    time, including ones a parent widget renders.
  - `retry` / `retryDelayMs` are gone: pass `load` to `mountly()` instead.
  - `data-mountly-reserve` is gone: use `style="min-height: …"`.
  - `once` inverted — activation mounts once by default; `data-toggle` opts in to
    click-to-close.
  - `mountly:refresh` / `mountly:unmount` control events are gone: call
    `update(el, props)` / `unmount(el)`. `mountly:mount`, `mountly:unmount` and
    `mountly:error` are still dispatched.
  - `activateOnMediaQuery` / `preloadOnMediaQuery` fold into the trigger itself:
    `data-on="media:(min-width: 60rem)"`.
  
  **No import map for a plain-HTML host**
  
  The adapters now bundle `mountly/shadow` and `mountly/assets` instead of
  externalising them, and `mountly-vite-plugin`'s self-contained build bundles
  `mountly/*` too. A widget built either way carries everything it needs, so
  dropping it into a page takes zero import-map entries — down from fifteen in
  the quickstart. The peer build still externalises them; sharing through the
  host's import map is the point of that build.
  
  The trade-off: a self-contained widget now carries its own mountly module cache
  and analytics, so a host that also imports `mountly` sees separate state. Use
  the peer build on any host with a bundler — the same rule that already applied
  to React.
  
  **`<mountly-feature>` is a shim over the core**
  
  The custom element had its own trigger resolution, props parsing, mount-target
  handling and lifecycle — a second implementation of the island system with a
  different vocabulary. It now translates its attributes to the core's and calls
  `wire()`. `mountly/elements` drops from 8.3 KB to 5.8 KB gzipped, and
  `mountly/feature` is loaded dynamically, only when a module is registered with
  `loadData`, `getCacheKey` or `render`.
  
  Behaviour changes in the element:
  
  - `preload-on` is opt-in. It used to default to the activation trigger for
    `hover`/`viewport`/`idle`, which preloads on the very event that mounts.
  - Invalid JSON in `props` puts the element in `data-mountly-state="error"` and
    fires `mountly:error`, instead of warning and mounting with `{}`. This holds
    at any point in the element's life, not just at registration.
  - `url-events` is gone; the `url` trigger covers `popstate`, `hashchange`,
    `pushState` and `replaceState`.
  
  **Custom triggers**
  
  `triggers` is exported: a plain object of `(el, arg, run) => teardown`. Assign
  to it to add one. This replaces the `registerTriggerPlugin` / `createPluginTrigger`
  API that the docs described but the source never contained.
  
  **Lifecycle fixes**
  
  - A widget whose `mount()` returns a rejected promise now lands in
    `data-mountly-state="error"` and dispatches `mountly:error`, instead of
    stranding the island in `loading` behind an unhandled rejection. The island
    is left genuinely unmounted, so the next intent retries it.
  - `unmount()` during a load is honoured: the module arriving a moment later no
    longer mounts over the caller's decision, and a widget that finishes an async
    mount after an unmount is torn down rather than left on the page.
  - A teardown that is still unwinding no longer erases the mount that replaced
    it. This covers all three ways it happened: a superseded in-flight `mount()`,
    a widget whose `unmount()` keeps working after it returns, and a `stop()` plus
    re-`wire()` that used to drop the pending teardown with the old state. A new
    mount waits the old one out.
  - Async `update()` joins the same lifecycle queue, reports rejections through
    `mountly:error`, and cannot finish late over a newer mount. The queue is keyed
    by mount target, so separate triggers sharing one `data-target` serialize too.
  - A teardown returned by `wire()` is bound to the state it created and is
    idempotent; calling an old teardown again cannot stop a later re-wire.
  - URL-backed custom elements pass the registered bundle URL as `moduleUrl`
    while retaining the module id as their independent load/cache key.
  - A `data-on` list with one unknown trigger name — `data-on="click telepathy"` —
    now wires nothing at all. It used to attach the valid listener before
    throwing, so the island reported an error and still mounted on click.
  - Switching a `<mountly-feature>` from a URL-backed module id to a
    factory-backed one clears `data-css` instead of keeping the previous
    module's stylesheet.
  - A `data-preload` trigger that fires synchronously — `media:` when the query
    already matches — no longer hits a temporal dead zone and error the island
    out.
  - The built `dist` restores `/* @vite-ignore */` on the CSP fallback
    `import()`; esbuild strips it in every minify mode, and Vite matches that
    exact comment before deciding to warn.
  - `runBridge` latches `data-mountly-mcp-state="error"`. A View that threw once
    still recovers visually on a later notification, but the recorded outcome
    `verify --render` reads stays `error`, which is what the comment always
    claimed.

## 0.5.0

### Minor Changes

- 4c8bece: Framed verticals become full participants, strict CSP loading works, and MCP scaffolds stop breaking on create.
  
  **Typed cross-frame events** (`channel` on `iframeFeature` / `iframeModule` / `mountAsFrame`) — explicit, validated, versioned events in both directions. Not a bridge over the same-context bus.
  
  **Host-owned routing** (`mountly/router`, `createFeatureRouter`) — URL segments map to features; navigation within a segment calls `update` rather than remounting. Frames emit navigation events; the host stays the only history writer.
  
  **Strict CSP loading** — dynamic import fallback when `eval` is unavailable, so on-demand widgets load under MCP Apps–style CSP without `'unsafe-eval'`.
  
  **Frame failure reporting** — `readyTimeout` (default 10s, `0` disables) and `onError` when a cross-origin frame never handshakes.
  
  **Frame overlay breakout** (`bindFrameOverlay` / `openHostOverlay`) — framed widgets ask the host to open modals in the top document so UI is not clipped by the iframe box.
  
  **Host-owned history protocol** (`history:navigate` / `history:sync`, `bindFrameHistoryToRouter`) — frames never write `window.history`. `FeatureRouter` gains `replace()`.
  
  **Manifest `isolation: "iframe"`** — flip a vertical behind `iframeFeature` with `src`, `iframeTitle`, optional `sandbox` / `allow` / `placeholderUrl`.
  
  **Optional same-origin proxy** (`createSameOriginProxy` on `mountly-manifest/server`) — GET/HEAD prefix forwarder for cookies/relative assets. Never required for embed.
  
  **Pre-activation placeholders** (`placeholder` / `placeholderUrl`, `mountly/placeholder`) — static skeleton until the frame reports ready.
  
  **MCP scaffold fixes** — pin `mountly-mcp` to the generating CLI version (caret could not cross the 4.0 major). Adds `--framework vanilla` template that builds and passes verify.

## 0.4.0

### Minor Changes

- a72d1b0: Add `mountly/iframe` — the same on-intent lifecycle with a browser-enforced isolation boundary.
  
  Every other distribution shares one JavaScript context, which is what makes them fast and what limits their isolation: shadow DOM scopes styles, but a vertical can still mutate `window`, patch a prototype or register a global listener and break another team at runtime. `iframeFeature({ moduleId, src, title })` runs the widget in its own document instead, with the same triggers, lifecycle and `<mountly-feature>` element.
  
  ```ts
  import { iframeFeature } from "mountly/iframe";
  
  const billing = iframeFeature({
    moduleId: "billing",
    src: "https://billing.acme.com/widget",
    title: "Billing breakdown",
    sandbox: "allow-scripts",
  });
  ```
  
  The framed page calls `mountAsFrame(widget)` from `mountly/iframe/child` with the widget it already ships, so one `createWidget(...)` output runs unchanged in light DOM, in a shadow root and in a frame — **the host picks the isolation level, not the widget author**, and moving a vertical behind a frame is a config change rather than a rewrite.
  
  - `iframeModule(src, options)` is the underlying `FeatureModule`, for `createOnDemandFeature({ loadModule })` when you need `loadData` or a custom render step.
  - Props cross on a handshake rather than on load, because an unmounted frame measures zero and a zero size is never reported.
  - The frame document is prefetched at preload time — hover, viewport, idle — which recovers the network half of the iframe's cost. The runtime half, a framework bootstrap per widget, is the trade you are making. Reach for `moduleUrl` first.
  - `resize-iframe` (0.2.0+) is an **optional** peer dependency, used for content sizing and the message channel. `mountly/iframe/child` has no dependencies at all.

### Patch Changes

- a72d1b0: Fix a CI failure that only appeared on a turbo cache hit.
  
  `mountlyHostPlugin` writes its ambient remote declarations to `src/mountly-remotes.d.ts`, which is gitignored — but that path was not in turbo's `build` outputs, so a cache hit skipped the build without restoring the file. Type-aware lint then failed on any host example that imports a remote by bare specifier (`Cannot find module 'demo-widget'`), on a clean checkout that had done nothing wrong.
  
  The generated declarations are now declared build outputs, so a cached build restores them.

## 0.3.2

### Patch Changes

- 2ad7d91: Improve runtime correctness, host safety, and MCP Apps DX across core and adapters.
  
  This patch fixes listener and timer leaks, hardens devtools rendering and controls, improves overlay and prefetch behavior, adds MCP sandbox export and verify JSON output, and aligns bootstrap and manifest validation for non-React hosts.

## 0.3.1

### Patch Changes

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

## 0.3.0

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

## 0.2.2

### Patch Changes

- 978694c: Reduce bundle size by splitting `mountly` into granular subpath exports (`mountly/shadow`, `mountly/assets`, `mountly/adapter`, `mountly/analytics`, `mountly/bus`, `mountly/url`, etc.) and removing the thin `*-entry.ts` aggregators. Mark the package as side-effect-free except for `mountly/host/auto`, so bundlers can tree-shake unused subpaths.

  The framework adapters (`mountly-react`, `mountly-svelte`, `mountly-vue`, `mountly-tsrx`) now import from the specific subpaths they need instead of the root, so consumers only pay for the runtime they actually use.

## 0.2.1

### Patch Changes

- b3f8290: shadow now opt-in

## 0.2.0

### Minor Changes

- 888e622: Add media-query trigger support for island payloads and expand the custom element API for module registration/auto-registration in `mountly`.

  Update adapter peer dependency ranges for React, Svelte, and Vue to support a wider set of framework versions.

## 0.1.4

### Patch Changes

- bace1e2: Add first-party Mountly primitives for data sources, URL query state, typed cross-island events, and widget test fixtures.

## 0.1.3

### Patch Changes

- 5695dd8: Updated tests

## 0.1.2

### Patch Changes

- 2545d57: Styling DX

## 0.1.1

### Patch Changes

- b2ccc1f: Added Islands
