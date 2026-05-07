# mountly

**On-Demand Interactive UI Platform**

Load rich UI only when the user actually needs it.
Use your existing React, Vue, or Svelte components with no new component model.
Modernize legacy pages incrementally without rewriting the host app.

**Documentation:** <https://jagreehal.github.io/mountly>

## The Problem

Modern web apps ship too much JavaScript upfront. Component libraries load everything at once. Microfrontends are operationally heavy. Framework lazy-loading lacks standardized interaction patterns.

There's no unified system for: **"Load rich UI only when the user actually needs it."**

## What mountly Does

mountly is a frontend platform for building Features — Widgets that load **only on user intent** (hover, click, focus, viewport entry, or idle time).

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

- **Intent-driven loading** — code splits at the feature level, loads on hover/click/focus/viewport/idle/url-change
- **Dual caching** — module cache (JS code) + data cache (API responses) with in-flight deduplication
- **Framework-agnostic core** — runtime is framework-agnostic. React, Vue, and Svelte adapters today; Solid in the same shape later.
- **Standardized lifecycle** — `idle → preload → activate → mount → unmount`
- **Multiple instances** — mount the same feature multiple times on one page
- **Small core** — ~9 KB gzipped; widgets load on demand, not on page load
- **Custom element** — `<mountly-feature>` web component for declarative usage
- **Analytics** — built-in interaction timing and performance tracking
- **Predictive prefetch** — idle-time loading scored by interaction history
- **Plugin triggers** — swipe, long-press, keyboard, URL-change, and custom trigger plugins
- **Devtools panel** — floating debug UI showing live feature states and events

## Packages

| Package | Purpose |
|---|---|
| [`mountly`](https://npmjs.com/package/mountly) | Core runtime, on-demand loader, lifecycle, custom element, CLI |
| [`mountly-react`](https://npmjs.com/package/mountly-react) | React adapter — `createWidget(Component, { styles })` |
| [`mountly-vue`](https://npmjs.com/package/mountly-vue) | Vue adapter — `createWidget(Component, { styles })` |
| [`mountly-svelte`](https://npmjs.com/package/mountly-svelte) | Svelte adapter — `createWidget(Component, { styles })` |
| [`mountly-tailwind`](https://npmjs.com/package/mountly-tailwind) | Tailwind v4 design preset (opt-in) |

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

**See it running first:** clone the repo, run `pnpm install && pnpm -r build && cd examples/plain-html && pnpm dev`, then open <http://localhost:5175/examples/quickstart/host.html> ([source](examples/quickstart/host.html)).

### Going further

- **Lazy load on user intent (Features)** — `createOnDemandFeature(...)` adds hover/click/viewport/idle triggers around a widget. See [examples/marketing-site](examples/marketing-site/README.md).
- **Plain-HTML host (no bundler)** — `installRuntime({...})` injects a shared-React import map. For direct browser import maps, also map used `mountly/*` subpaths (for example `mountly/attach`, `mountly/elements`, `mountly/shadow`, `mountly/assets`, `mountly/adapter`). See [examples/plain-html](examples/plain-html/README.md).
- **Pick a distribution (self-contained vs shared React)** — when to ship one widget vs many, when to share React. See [examples/README.md#choosing-a-distribution](examples/README.md#choosing-a-distribution).
- **When *not* to use mountly** — single SPA, full SSR-hydration ownership, MFE orchestration. See [examples/README.md#when-not-to-use-it](examples/README.md#when-not-to-use-it).
- **All runnable examples** — [examples/README.md](examples/README.md).
- **Host runtime API** — [packages/mountly/README.md](packages/mountly/README.md).

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
- deterministic single hydration: `once`
- loader resilience: `retry`, `retryDelayMs`
- SSR marker gating: `requireSsrMarker`, `ssrMarkerAttr`
- teardown controls: `unmount()`, `unmountAllIslands()`, `mountly:unmount` event
- runtime state marker: `data-mountly-state` (`idle|loading|mounted|error`)

## Examples

See **[examples/README.md](examples/README.md)** for start order, ports, and when to use each pattern.

Summary:

- `examples/payment-breakdown` — a popover with async data loading and shadow-DOM styling
- `examples/image-lightbox` — a media viewer with focus restoration
- `examples/signup-card` — a marketing card
- `examples/demo` — a Vite host that exercises all of the above
- `examples/plain-html` — bundler-free integration via import maps
- `examples/marketing-site` — embedding widgets in static HTML
- `examples/quickstart/host.html` — minimal import map + `attach()` host
- `examples/pokemon-kitchen-sink` — stress-test of all features

## Development

```bash
pnpm install
pnpm -r build
pnpm test
```

## License

MIT
