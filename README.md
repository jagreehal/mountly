# mountly

**Ship your components into pages you do not own.**

Publish a React, Vue or Svelte component as a custom element behind one script
tag. Or run the mountly runtime and load widgets on user intent.
You keep your component model. The host keeps its page.

**Documentation:** <https://jagreehal.github.io/mountly>

### Three ways in

**Sharing a component with another team?** Publish it as a custom element behind
one script tag. Mountly reads its props type at build time; the consuming page
installs nothing.

```ts
// vite.config.ts
export default defineElementsConfig({ prefix: "acme", elements: "src/elements/*.tsx" });
```

```html
<script type="module" src="https://ui.acme.com/payments/1.2.0/embed.js"></script>
<acme-payments-summary balance="1250" currency="GBP"></acme-payments-summary>
```

→ [Script-tag embeds](https://mountly.dev/concepts/script-embeds/) ·
[runnable example](docs/examples/react-embed)

**Building a page you own?** Run the mountly runtime and load widgets on hover,
click, viewport entry, or idle time, so the page ships a shell first. Take this
path when several widgets share one framework instance.
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

All three take the same components. Above that they share no API, and you can
ignore the two you are not using.
[Embeds or runtime?](https://mountly.dev/getting-started/embeds-or-runtime/)
tells you which one you came for.

## The Problem

You have a component in React, Vue, or Svelte. Someone needs it on a page that
does not run your framework: a CMS template, a partner's site, a Rails app from 2014. Your options are to copy the markup and let it rot, stand up a
microfrontend platform, or ask that team to adopt your bundler.

mountly is a fourth option, and a small one. It is a delivery mechanism, not a
platform. It does not do routing, SSR, rollouts, or state.

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
- **Isolation when you need it**: light DOM, shadow DOM, or a cross-origin iframe. You pick per host; the widget source does not change
- **Analytics**: built-in interaction timing and performance tracking
- **Predictive prefetch**: idle-time loading scored by interaction history
- **Extensible triggers**: eight built in; add swipe, long-press or a keyboard chord with one assignment to the `triggers` table
- **Devtools panel**: floating debug UI showing live feature states and events

## Packages

| Package                                                          | Purpose                                                                                                                                                    |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`mountly`](https://npmjs.com/package/mountly)                   | Core runtime, on-demand loader, lifecycle, custom element, CLI                                                                                             |
| [`mountly-react`](https://npmjs.com/package/mountly-react)       | React adapter, `createWidget(Component, { styles })`                                                                                                       |
| [`mountly-vue`](https://npmjs.com/package/mountly-vue)           | Vue adapter, `createWidget(Component, { styles })`                                                                                                         |
| [`mountly-svelte`](https://npmjs.com/package/mountly-svelte)     | Svelte adapter, `createWidget(Component, { styles })`                                                                                                      |
| [`mountly-tailwind`](https://npmjs.com/package/mountly-tailwind) | Tailwind v4 design preset (opt-in)                                                                                                                         |
| [`mountly-vite-plugin`](packages/mountly-vite-plugin)            | Vite lib build plugin, dual `index.js` / `peer.js` widget output                                                                                           |
| [`mountly-manifest`](packages/mountly-manifest)                  | Vertical registry schema, import map + host helpers                                                                                                        |
| [`mountly-mcp`](packages/mcp-apps/README.md)                     | **MCP Apps (SEP-1865)**: build views from React, Vue or Svelte components. Subpaths: `./react`, `./vue`, `./svelte`, `./vite`, `./server`, `./json-render` |

## Build with Agent Skills

Let your coding agent do it. Install the Mountly skills once:

```
/plugin marketplace add jagreehal/mountly
/plugin install mountly-embed@mountly     # publish a component as a tag
/plugin install mountly-mcp@mountly       # build MCP Apps Views
```

Or `npx skills add jagreehal/mountly`. Then ask:

| Skill                                                                                      | What it does                                  | Try it                                    |
| ------------------------------------------------------------------------------------------ | --------------------------------------------- | ----------------------------------------- |
| [`publish-component-embed`](plugins/mountly-embed/skills/publish-component-embed/SKILL.md) | Publishes a component as a script-tag element | _"Let another team embed this component"_ |

For MCP Apps:

| Skill                                                                        | What it does                       | Try it                                |
| ---------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------- |
| [`create-mcp-app`](plugins/mountly-mcp/skills/create-mcp-app/SKILL.md)       | Scaffolds via `mountly-mcp create` | _"Create an MCP App"_                 |
| [`add-app-to-server`](plugins/mountly-mcp/skills/add-app-to-server/SKILL.md) | Adds Views to an existing server   | _"Add UI to my MCP server"_           |
| [`convert-web-app`](plugins/mountly-mcp/skills/convert-web-app/SKILL.md)     | Wraps an existing component        | _"Turn my component into an MCP App"_ |
| [`migrate-ext-apps`](plugins/mountly-mcp/skills/migrate-ext-apps/SKILL.md)   | Migrates official ext-apps Views   | _"Migrate from ext-apps"_             |

Full install notes: [Agent Skills](https://mountly.dev/mcp-apps/agent-skills/).

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
the `ui://` resource plus its sidecar. Then develop it against a real host,
with the sandbox proxy, CSP and full handshake, without installing one:

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
quickstart](https://jagreehal.github.io/mountly/examples/quickstart/host.html)**:
no clone required.

### The attributes

| Attribute            | Default        | What it does                                                                                                                       |
| -------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `data-mountly`       | —              | Module URL, or a key in the host script's `data-mountly-urls` map                                                                  |
| `data-on`            | `click`        | When to mount. `click focus` fires on whichever comes first                                                                        |
| `data-preload`       | —              | When to fetch without mounting. Usually `hover` or `viewport`                                                                      |
| `data-props`         | `{}`           | JSON props. A `<script type="application/json">` child works too, when quotes get awkward                                          |
| `data-target`        | the element    | Where to mount, if not the trigger itself                                                                                          |
| `data-toggle`        | off            | A second activation unmounts instead of doing nothing                                                                              |
| `data-css`           | sibling `.css` | `none`, or an explicit stylesheet URL                                                                                              |
| `data-mountly-state` | —              | `idle` / `loading` / `mounted` / `error`, so CSS can style each. Server-render it as `mounted` and mountly leaves the island alone |

Triggers read as `kind` or `kind:arg`: `hover:300`, `viewport:200px`,
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

See the [script embed guide](https://mountly.dev/concepts/script-embeds/) and the
runnable [React](docs/examples/react-embed) and
[mixed-framework](docs/examples/mixed-embed) examples.

### When HTML is not enough

```js
import { mountly, mount, unmount, update } from "mountly";

const stop = mountly({
  urls: { cart: "/widgets/cart.js" },
  // the one escape hatch: retries, auth headers, a bundler's own import(),
  // a test double. An attribute for each of those would be worse.
  load: (url) => fetch(url).then(/* ... */),
});
```

`mountly()` also watches the DOM. An island that another widget, htmx, or a
Turbo frame swap adds later gets wired up, and you configure no ordering.

### Going further

- **Imperative feature API (`mountly/feature`)**: `createOnDemandFeature(...)` for data loading, custom cache keys and multi-container lifecycles that the attributes do not cover. See [docs/examples/marketing-site](docs/examples/marketing-site/README.md).
- **Plain-HTML host (no bundler)**: `installRuntime({...})` injects a shared-React import map. For direct browser import maps, also map used `mountly/*` subpaths (for example `mountly/attach`, `mountly/elements`, `mountly/shadow`, `mountly/assets`, `mountly/adapter`). See [docs/examples/plain-html](docs/examples/plain-html/README.md).
- **Pick a distribution (self-contained vs shared React)**: when to ship one widget vs many, when to share React. See [docs/examples/README.md#choosing-a-distribution](docs/examples/README.md#choosing-a-distribution).
- **Choosing an architecture**: monorepo first, script-tag embed, manifest verticals, and when you do not need micro frontends at all. See [Choosing an architecture](https://jagreehal.github.io/mountly/getting-started/choosing-an-architecture/).
- **Strong isolation (iframe widgets)**: `mountly/iframe` runs a vertical in its own document, with its own `window` and styles, on the same triggers and lifecycle. The same `createWidget` output works in light DOM, shadow DOM or a frame, so the host picks the boundary. Overlay breakout and host-owned history: see [frame protocols](https://jagreehal.github.io/mountly/concepts/frame-protocols/). Manifest flip: `isolation: "iframe"`.
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
mountly skips it: no double paint, no client mount, and the markup stays styled
if JavaScript never arrives. That attribute is the whole handshake.

```html
<div data-mountly="/widgets/cart.js" data-mountly-state="mounted">
  <!-- server-rendered markup -->
</div>
```

Anything inside an island before it mounts is its fallback: a link, a static
summary, a skeleton. Reserve space with `style="min-height: 40px"`. CSS already
does this, so mountly adds no attribute for it.

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
