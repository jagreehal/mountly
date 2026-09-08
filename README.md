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
[Mountly vs ext-apps](https://mountly.dev/mcp-apps/vs-ext-apps/) ·
[`mountly-mcp`](packages/mcp-apps/README.md)

Both sit on the same widget model, so a component written for one works in the
other. For MCP Apps, prefer the `mountly-mcp` docs. You do not need the islands
API to ship a View.

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
- **Small core**: 2.3 KB gzipped, one file, no dependencies; widgets load on demand, not on page load
- **Custom element**: `<mountly-feature>` web component for declarative usage
- **Isolation when you need it**: light DOM, shadow DOM, or a cross-origin iframe — the host chooses, the widget source does not change
- **Analytics**: built-in interaction timing and performance tracking
- **Predictive prefetch**: idle-time loading scored by interaction history
- **Extensible triggers**: eight built in; add swipe, long-press or a keyboard chord with one assignment to the `triggers` table
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

| Skill                                                                        | What it does                       | Try it                                |
| ---------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------- |
| [`create-mcp-app`](plugins/mountly-mcp/skills/create-mcp-app/SKILL.md)       | Scaffolds via `mountly-mcp create` | _"Create an MCP App"_                 |
| [`add-app-to-server`](plugins/mountly-mcp/skills/add-app-to-server/SKILL.md) | Adds Views to an existing server   | _"Add UI to my MCP server"_           |
| [`convert-web-app`](plugins/mountly-mcp/skills/convert-web-app/SKILL.md)     | Wraps an existing component        | _"Turn my component into an MCP App"_ |
| [`migrate-ext-apps`](plugins/mountly-mcp/skills/migrate-ext-apps/SKILL.md)   | Migrates official ext-apps Views   | _"Migrate from ext-apps"_             |

```
/plugin marketplace add jagreehal/mountly
/plugin install mountly-mcp@mountly
```

Or: `npx skills add jagreehal/mountly` · full install notes:
[Agent Skills](https://mountly.dev/mcp-apps/agent-skills/).

## Build an MCP App from a component you already have

[MCP Apps](https://github.com/modelcontextprotocol/ext-apps) (SEP-1865) lets an
MCP server render interactive UI inside Claude, ChatGPT and other hosts. Mountly MCP is the View kit. New dashboards and existing website components use
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

An island is a URL, a trigger, and some props. Write it in HTML; there is no
JavaScript for you to write.

```html
<button data-mountly="/widgets/cart.js" data-preload="hover" data-target="#panel">
  Basket (3)
</button>
<div id="panel"></div>

<script type="module" src="https://unpkg.com/mountly/dist/auto.js"></script>
```

Hovering the button downloads `cart.js` (and its sibling `cart.css`); clicking
mounts it into `#panel`. Until then the page ships the button and nothing else.

`/widgets/cart.js` is any module with a `mount`:

```js
export default {
  mount(el, props) {
    /* React, Vue, Svelte, or plain DOM */
  },
  unmount(el) {},
};
```

The three adapters produce exactly this shape from a component you already have:

```js
import { createWidget } from "mountly-react";
import Cart from "./Cart";

export default createWidget(Cart);
```

**See it running:** clone the repo, run `pnpm install && pnpm -r build && cd
docs/examples/plain-html && pnpm dev`, then open
<http://localhost:5175/docs/examples/quickstart/host.html>
([source](docs/examples/quickstart/host.html)). **Or try the [hosted
quickstart](https://jagreehal.github.io/mountly/examples/quickstart/host.html)** —
no clone required.

### The attributes

| Attribute            | Default        | What it does                                                                                                                       |
| -------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `data-mountly`       | —              | Module URL, or a key in the host script's `data-mountly-urls` map                                                                  |
| `data-on`            | `click`        | When to mount. `click focus` fires on whichever comes first                                                                        |
| `data-preload`       | —              | When to fetch without mounting — usually `hover` or `viewport`                                                                     |
| `data-props`         | `{}`           | JSON props. A `<script type="application/json">` child works too, when quotes get awkward                                          |
| `data-target`        | the element    | Where to mount, if not the trigger itself                                                                                          |
| `data-toggle`        | off            | A second activation unmounts instead of doing nothing                                                                              |
| `data-css`           | sibling `.css` | `none`, or an explicit stylesheet URL                                                                                              |
| `data-mountly-state` | —              | `idle` / `loading` / `mounted` / `error`, so CSS can style each. Server-render it as `mounted` and mountly leaves the island alone |

Triggers read as `kind` or `kind:arg` — `hover:300`, `viewport:200px`,
`media:(min-width: 60rem)`, `idle:2000`. `click`, `focus`, `url` and `never`
take no argument.

### Share components with another team

Point the build at your components and give them a namespace. Mountly reads each
component's props type and publishes it as a custom element:

```ts
// vite.config.ts
export default defineElementsConfig({ prefix: "acme", elements: "src/elements/*.tsx" });
```

The consuming page needs one script tag and no package install, import map or
init call:

```html
<script type="module" src="https://ui.acme.com/payments/1.2.0/embed.js"></script>
<acme-payments-summary balance="1250" currency="GBP"></acme-payments-summary>
```

`balance` arrives as a number because the component says it is one. `onViewDetails`
becomes a `view-details` DOM event. The build also emits `embed.d.ts` for typed
tags and `custom-elements.json` for editor autocomplete. Component code and CSS
load on demand. The same component still imports directly into your own app.

See the [script embed guide](docs/src/content/docs/concepts/script-embeds.mdx)
and [runnable example](docs/examples/react-embed).

### When HTML is not enough

```js
import { mountly, mount, unmount, update } from "mountly";

const stop = mountly({
  urls: { cart: "/widgets/cart.js" },
  // the one escape hatch: retries, auth headers, a bundler's own import(),
  // a test double — instead of an attribute for each
  load: (url) => fetch(url).then(/* ... */),
});
```

`mountly()` also watches the DOM, so islands rendered later — by another
widget, by htmx, by a Turbo frame swap — wire themselves up with no ordering
knob to configure.

### Going further

- **Imperative feature API (`mountly/feature`)**: `createOnDemandFeature(...)` for data loading, custom cache keys and multi-container lifecycles that the attributes do not cover. See [docs/examples/marketing-site](docs/examples/marketing-site/README.md).
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

`mountly` is `1.0`. The surface below follows semver: additions ship in minor
releases, breaking changes wait for `2.0`.

- the `data-*` island attributes and `data-mountly-state`
- `mountly()` / `mount` / `unmount` / `update` / `wire` / `triggers`
- adapter contract types (`WidgetModule`, `AdapterOptions`)
- `installRuntime` shape (including `react/jsx-runtime` mapping support)

Migrating from an earlier release? See
[the changelog](packages/mountly/CHANGELOG.md).

Releases follow [docs/release-checklist.md](docs/release-checklist.md).

## SSR

Render the island's markup on the server and set `data-mountly-state="mounted"`.
mountly skips it — no double paint, no client mount, and the markup stays
styled if JavaScript never arrives. That one attribute is the whole handshake.

```html
<div data-mountly="/widgets/cart.js" data-mountly-state="mounted">
  <!-- server-rendered markup -->
</div>
```

Anything inside an island before it mounts is its fallback: a link, a static
summary, a skeleton. Reserve space with `style="min-height: 40px"` — no
mountly attribute needed, CSS already does this.

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
