# mountly

**On-Demand Interactive UI Platform**

Load rich UI only when the user needs it.
Use your existing React, Vue, or Svelte components with no new component model.
Modernize legacy pages incrementally without rewriting the host app.

**Documentation:** <https://jagreehal.github.io/mountly>

### Two ways in

**Building a web app?** Load widgets on user intent — hover, click, viewport,
idle — so the page ships a shell instead of everything.
→ [Quick start](#quick-start-60-seconds)

**Building an MCP server?** Turn a React, Vue or Svelte component into an
MCP Apps (SEP-1865) view that renders inside Claude and ChatGPT.

```bash
npx mountly-mcp create my-app --framework react
cd my-app && pnpm install && pnpm dev
```

→ [Agent Skills](https://mountly.dev/mcp-apps/agent-skills/) ·
[MCP Apps quick start](https://mountly.dev/mcp-apps/quick-start/) ·
[`mountly-mcp`](packages/mcp-apps/README.md)

Both sit on the same widget model, so a component written for one works in the
other.

## The Problem

Modern web apps ship too much JavaScript upfront. Component libraries load everything at once. Microfrontends are operationally heavy. Framework lazy-loading lacks standardized interaction patterns.

No unified system covers: **"Load rich UI only when the user needs it."**

## What mountly Does

mountly is a frontend platform for building Features, Widgets that load **on user intent** (hover, click, focus, viewport entry, or idle time).

```
Before mountly:                    After mountly:
┌──────────────────────┐            ┌──────────────────────┐
│  Full app JS bundle  │            │  Page shell (light)  │
│  - Payment widget    │            │                      │
│  - Video player      │────►       │  [User hovers]       │
│  - Image lightbox    │            │  → Load widget code  │
│  - Analytics panel   │            │  → Fetch data        │
│  - Chat widget       │            │  → Mount UI          │
└──────────────────────┘            └──────────────────────┘
  Slow TTI, heavy bundle              Fast TTI, lean bundle
```

## Key Features

- **Intent-driven loading**: code splits at the feature level, loads on hover/click/focus/viewport/idle/url-change
- **Dual caching**: module cache (JS code) plus data cache (API responses) with in-flight deduplication
- **Framework-agnostic core**: the runtime is framework-agnostic. React, Vue, and Svelte adapters today; Solid in the same shape later.
- **Standardized lifecycle**: `idle → preload → activate → mount → unmount`
- **Multiple instances**: mount the same feature multiple times on one page
- **Small core**: ~9 KB gzipped; widgets load on demand, not on page load
- **Custom element**: `<mountly-feature>` web component for declarative usage
- **Isolation when you need it**: light DOM, shadow DOM, or a cross-origin iframe — the host chooses, the widget source does not change
- **Analytics**: built-in interaction timing and performance tracking
- **Predictive prefetch**: idle-time loading scored by interaction history
- **Plugin triggers**: swipe, long-press, keyboard, URL-change, and custom trigger plugins
- **Devtools panel**: floating debug UI showing live feature states and events

## Packages

| Package                                                          | Purpose                                                                                                                                                     |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`mountly`](https://npmjs.com/package/mountly)                   | Core runtime, on-demand loader, lifecycle, custom element, CLI                                                                                              |
| [`mountly-react`](https://npmjs.com/package/mountly-react)       | React adapter, `createWidget(Component, { styles })`                                                                                                        |
| [`mountly-vue`](https://npmjs.com/package/mountly-vue)           | Vue adapter, `createWidget(Component, { styles })`                                                                                                          |
| [`mountly-svelte`](https://npmjs.com/package/mountly-svelte)     | Svelte adapter, `createWidget(Component, { styles })`                                                                                                       |
| [`mountly-tailwind`](https://npmjs.com/package/mountly-tailwind) | Tailwind v4 design preset (opt-in)                                                                                                                          |
| [`mountly-vite-plugin`](packages/mountly-vite-plugin)            | Vite lib build plugin, dual `index.js` / `peer.js` widget output                                                                                            |
| [`mountly-manifest`](packages/mountly-manifest)                  | Vertical registry schema, import map + host helpers                                                                                                         |
| [`mountly-mcp`](packages/mcp-apps/README.md)                     | **MCP Apps (SEP-1865)** — build views from React, Vue or Svelte components. Subpaths: `./react`, `./vue`, `./svelte`, `./vite`, `./server`, `./json-render` |

## Build with Agent Skills

The fastest way to build an MCP App View is to let your coding agent do it.
Install the Mountly skills once, then ask:

| Skill | What it does | Try it |
| --- | --- | --- |
| [`create-mcp-app`](plugins/mountly-mcp/skills/create-mcp-app/SKILL.md) | Scaffolds via `mountly-mcp create` | _"Create an MCP App"_ |
| [`add-app-to-server`](plugins/mountly-mcp/skills/add-app-to-server/SKILL.md) | Adds Views to an existing server | _"Add UI to my MCP server"_ |
| [`convert-web-app`](plugins/mountly-mcp/skills/convert-web-app/SKILL.md) | Wraps an existing component | _"Turn my component into an MCP App"_ |
| [`migrate-ext-apps`](plugins/mountly-mcp/skills/migrate-ext-apps/SKILL.md) | Migrates official ext-apps Views | _"Migrate from ext-apps"_ |

```
/plugin marketplace add jagreehal/mountly
/plugin install mountly-mcp@mountly
```

Or: `npx skills add jagreehal/mountly` · full install notes:
[Agent Skills](https://mountly.dev/mcp-apps/agent-skills/).

## Build an MCP App from a component you already have

[MCP Apps](https://github.com/modelcontextprotocol/ext-apps) (SEP-1865) lets an
MCP server render interactive UI inside Claude, ChatGPT and other hosts. Mountly
is the default View layer — new dashboards and existing website components use
the same path:

```ts
import { createMcpView } from "mountly-mcp/vue";
import Dashboard from "./Dashboard.vue";

createMcpView(Dashboard);
```

Greenfield without an agent:

```bash
npx mountly-mcp create my-app --framework react
```

Add `mountlyMcpViews()` to your Vite config and `npx mountly-mcp build` emits
the `ui://` resource plus its sidecar. Then develop it against a real host —
sandbox proxy, CSP, the full handshake — without installing one:

```bash
npx mountly-mcp dev --server ./server.js
```

`registerMcpApps(server, { views, tools })` installs the result into an MCP
server you own, so transport, auth and deployment stay yours. The wire protocol
is delegated to the official
[`@modelcontextprotocol/ext-apps`](https://www.npmjs.com/package/@modelcontextprotocol/ext-apps)
SDK, so it tracks the spec rather than reimplementing it.

→ [Agent Skills](https://mountly.dev/mcp-apps/agent-skills/) ·
[MCP Apps quick start](https://mountly.dev/mcp-apps/quick-start/) ·
[protocol harness demo](docs/examples/mcp-app-demo/README.md)

## Quick Start (60 seconds)

```bash
npx mountly init my-widget
cd my-widget
pnpm install
pnpm build
```

Drop the built widget into any HTML page:

```html
<div id="mount"></div>
<script type="module">
  import widget from "./my-widget/dist/index.js";
  widget.mount(document.getElementById("mount"));
</script>
```

The widget mounts inside the container in light DOM by default, with bundled styles applied. Pass `shadow: true` to `createWidget` when you need a hard style boundary. That's the whole flow.

**See it running first:** clone the repo, run `pnpm install && pnpm -r build && cd docs/examples/plain-html && pnpm dev`, then open <http://localhost:5175/docs/examples/quickstart/host.html> ([source](docs/examples/quickstart/host.html)). **Or try the [hosted quickstart](https://jagreehal.github.io/mountly/examples/quickstart/host.html)** — no clone required.

### Going further

- **Lazy load on user intent (Features)**: `createOnDemandFeature(...)` adds hover/click/viewport/idle triggers around a widget. See [docs/examples/marketing-site](docs/examples/marketing-site/README.md).
- **Plain-HTML host (no bundler)**: `installRuntime({...})` injects a shared-React import map. For direct browser import maps, also map used `mountly/*` subpaths (for example `mountly/attach`, `mountly/elements`, `mountly/shadow`, `mountly/assets`, `mountly/adapter`). See [docs/examples/plain-html](docs/examples/plain-html/README.md).
- **Pick a distribution (self-contained vs shared React)**: when to ship one widget vs many, when to share React. See [docs/examples/README.md#choosing-a-distribution](docs/examples/README.md#choosing-a-distribution).
- **Choosing an architecture**: monorepo first, widget drop-in, manifest verticals — when you do and do not need micro frontends. See [Choosing an architecture](https://jagreehal.github.io/mountly/getting-started/choosing-an-architecture/).
- **Strong isolation (iframe widgets)**: `mountly/iframe` runs a vertical in its own document — its own `window`, its own styles — with the same triggers and lifecycle. The same `createWidget` output works in light DOM, shadow DOM or a frame, so the host picks the boundary. Overlay breakout and host-owned history: see [frame protocols](https://jagreehal.github.io/mountly/concepts/frame-protocols/). Manifest flip: `isolation: "iframe"`.
- **Import-map verticals (advanced)**: independent **widget** repos via manifest + CDN, not Webpack federation. See [docs/micro-frontends.md](docs/micro-frontends.md) and [docs/examples/multi-vertical-host](docs/examples/multi-vertical-host/README.md). Read the architecture guide first.
- **When _not_ to use mountly**: single SPA, full SSR-hydration ownership, MFE orchestration control plane. See [When not to use mountly](https://jagreehal.github.io/mountly/concepts/when-not-to-use/).
- **All runnable examples**: [docs/examples/README.md](docs/examples/README.md).
- **Host runtime API**: [packages/mountly/README.md](packages/mountly/README.md).
- **MCP Apps integration**: [docs/protocol-layering.md](docs/protocol-layering.md) and [docs/how-to-test.md](docs/how-to-test.md).
- **MCP Apps runnable demo**: [`docs/examples/mcp-app-demo`](docs/examples/mcp-app-demo/README.md) for an end-to-end `ui://` resource + MCP server verification.
- **Generative UI (agent emits the UI)**: [`mountly-mcp/json-render`](packages/mcp-apps/README.md) renders [`@json-render`](https://github.com/vercel-labs/json-render) specs as MCP widgets with an agent-action bridge; `createGenerativeView` + `streamSpec`. Self-driving streaming demo: [`docs/examples/mcp-generative-demo`](docs/examples/mcp-generative-demo/README.md).
- **MCP adapter package docs**: [`mountly-mcp`](packages/mcp-apps/README.md), with subpaths `mountly-mcp/react` and `mountly-mcp/server`. All thin wrappers around the official [`@modelcontextprotocol/ext-apps`](https://www.npmjs.com/package/@modelcontextprotocol/ext-apps) SDK (SEP-1865, 2026-01-26).

## API Stability

`mountly` is pre-1.0, but the public API used in the examples is now frozen for the `0.1.x` line:

- `createOnDemandFeature`
- `registerCustomElement` / `defineMountlyFeature`
- adapter contract types (`WidgetModule`, `AdapterOptions`)
- `installRuntime` shape (including `react/jsx-runtime` mapping support)

Breaking changes to this surface should wait for `0.2.0` and must be called out in release notes. Releases follow [docs/release-checklist.md](docs/release-checklist.md).

## Islands + SSR Controls

`mountly` now includes guarded island mounting primitives for SSR handoff safety:

- `mountIslandFeature()` / `mountAllIslands()`
- hydration guards: `skipIfHydrated`, `forceRemount`, `hydratedAttr`
- nested ordering guard: `waitForParent`
- single deterministic hydration: `once`
- loader resilience: `retry`, `retryDelayMs`
- SSR marker gating: `requireSsrMarker`, `ssrMarkerAttr`
- teardown controls: `unmount()`, `unmountAllIslands()`, `mountly:unmount` event
- runtime state marker: `data-mountly-state` (`idle|loading|mounted|error`)

## Examples

See **[docs/examples/README.md](docs/examples/README.md)** for start order, ports, and when to use each pattern.

Summary:

- `docs/examples/payment-breakdown`: a popover with async data loading and shadow-DOM styling
- `docs/examples/image-lightbox`: a media viewer with focus restoration
- `docs/examples/signup-card`: a marketing card
- `docs/examples/demo`: a Vite host that exercises all of the above
- `docs/examples/plain-html`: bundler-free integration via import maps
- `docs/examples/marketing-site`: embedding widgets in static HTML
- `docs/examples/quickstart/host.html`: minimal import map + `attach()` host
- `docs/examples/pokemon-kitchen-sink`: stress-test of all features

## Development

```bash
pnpm install
pnpm -r build
pnpm test
```

## License

MIT
