# mountly

**On-Demand Interactive UI Platform**

Load rich UI only when the user actually needs it.
Use your existing React, Vue, or Svelte components with no new component model.
Modernize legacy pages incrementally without rewriting the host app.

**Documentation:** <https://jagreehal.github.io/mountly>

## Docs screenshots

- Gallery page in docs: [docs/src/content/docs/evidence/screenshots.mdx](docs/src/content/docs/evidence/screenshots.mdx)
- Generated originals: [docs/screenshots](docs/screenshots)
- Site-served copies: [docs/public/screenshots](docs/public/screenshots)

## The Problem

Modern web apps ship too much JavaScript upfront. Component libraries load everything at once. Microfrontends are operationally heavy. Framework lazy-loading lacks standardized interaction patterns.

There's no unified system for: **"Load rich UI only when the user actually needs it."**

## Vocabulary

mountly has two layers and uses one term for each — they are not synonyms.

- **Component** — your normal React, Vue, or Svelte component. mountly never asks you to learn a new component model; you write components the way you already do.
- **Widget** — a Component wrapped by a framework adapter into a self-contained, mountable, framework-agnostic unit. React, Vue, and Svelte adapters all expose `createWidget(Component, { styles })` which returns `{ mount, unmount }`. A Widget knows nothing about how or when it's loaded.
- **Feature** — an *on-demand* Widget: it adds a trigger (hover / click / focus / viewport / idle), a module loader, optional data fetching, caching, and a standardized lifecycle. Built with `createOnDemandFeature(...)` or declared with `<mountly-feature>`.

Rule of thumb: **you write Components, the adapter wraps them as Widgets, and you ship them as Features.** Don't substitute the terms in code, docs, or examples — `Component` is the input, `Widget` is the framework-agnostic output, `Feature` adds the lazy-load lifecycle on top.

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

The widget mounts inside its own shadow root with bundled styles. That's the whole flow.

**See it running first:** clone the repo, run `pnpm install && pnpm -r build && cd examples/plain-html && pnpm dev`, then open <http://localhost:5175/examples/quickstart/host.html> ([source](examples/quickstart/host.html)).

### Going further

- **Lazy load on user intent (Features)** — `createOnDemandFeature(...)` adds hover/click/viewport/idle triggers around a widget. See [examples/marketing-site](examples/marketing-site/README.md).
- **Plain-HTML host (no bundler)** — `installRuntime({...})` injects a shared-React import map. See [examples/plain-html](examples/plain-html/README.md).
- **Pick a distribution (self-contained vs shared React)** — when to ship one widget vs many, when to share React. See [examples/README.md#choosing-a-distribution](examples/README.md#choosing-a-distribution).
- **When *not* to use mountly** — single SPA, SSR + hydration, MFE orchestration. See [examples/README.md#when-not-to-use-it](examples/README.md#when-not-to-use-it).
- **All runnable examples** — [examples/README.md](examples/README.md).
- **Host runtime API** — [packages/mountly/README.md](packages/mountly/README.md).

## API Stability

`mountly` is pre-1.0, but the public API used in the examples is now frozen for the `0.1.x` line:

- `createOnDemandFeature`
- `registerCustomElement` / `defineMountlyFeature`
- adapter contract types (`WidgetModule`, `AdapterOptions`)
- `installRuntime` shape (including `react/jsx-runtime` mapping support)

Breaking changes to this surface should wait for `0.2.0` and must be called out in release notes. Releases follow [docs/release-checklist.md](docs/release-checklist.md).

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
