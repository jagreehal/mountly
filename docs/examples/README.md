# Examples

Runnable hosts and widgets that exercise the **mountly** runtime. New to mountly? Start with the [60-second Quick Start](../README.md#quick-start-60-seconds) in the project README; it scaffolds your own widget. This page is for evaluating mountly against pre-built examples, or for copying integration patterns into a host.

## One-time setup (repo root)

```bash
pnpm install
pnpm -r build
```

Build output must exist under `packages/mountly/dist/` and each example widget’s `dist/` before opening the static examples.

## Pick an example to run

1. **`marketing-site/`** — Plain HTML “real” marketing page: imperative `attach()`, declarative `<mountly-feature>`, shared React via import map. Best **before/after** story: open DevTools → Network, reload, then hover the hero button or scroll to the inline embed. See [marketing-site/README.md](marketing-site/README.md) for what to expect on the wire (sizes are **representative**; measure your own widgets in DevTools).

2. **`plain-html/`** — No Vite on the host: import maps + native modules only. Two URLs: self-contained widgets vs **shared React** (`shared-react.html`). See [plain-html/README.md](plain-html/README.md).

3. **`demo/`** — Vite app on **port 5174** (`pnpm --filter mountly-demo dev` from repo root, or `pnpm dev` inside `docs/examples/demo/`). Exercises `attach`, multi-instance, custom element registration, devtools, prefetch, and more. Reference when integrating a **bundler** host.

4. **`shadcn-drop-in/`** — Plain HTML host showing a shadcn-style React widget dropped in via import map and `mountly-feature`. Best for teams validating “React UI in static host” with no host framework.

5. **`quickstart/host.html`** — Shortest copy-paste host (import map + one `attach`). Open via a static server that serves the **repository root** (same as `plain-html`).

6. **`pokemon-kitchen-sink/`** — Stress-test of triggers, prefetch, custom elements, analytics. For **deep dives**, not first-day onboarding. Vite dev server on **port 5178** (distinct from `plain-html` so they can run side-by-side).
7. **`mcp-app-demo/`** — MCP Apps reference demo: builds a `ui://` widget resource, registers it on `mountly-mcp/server`, and verifies the full MCP flow in-process (`listTools`, `listResources`, `readResource`, `callTool`). See [mcp-app-demo/README.md](mcp-app-demo/README.md).
8. **`mcp-generative-demo/`** — Generative UI: an agent emits a JSON spec constrained to a [`@json-render`](https://github.com/vercel-labs/json-render) catalog, and mountly renders it as native components, through the MCP bridge and as a plain widget. See [mcp-generative-demo/README.md](mcp-generative-demo/README.md).
9. **`multi-vertical-host/`** — Manifest-driven multi-team host: `installPlatformRuntime`, `defineMountlyFeatureFromManifest`, `mountly/contracts` bus. See [multi-vertical-host/README.md](multi-vertical-host/README.md) and [docs/micro-frontends.md](../docs/micro-frontends.md).

10. **`vite-host-import/`** — Vite React host with federation-style `import("demo-widget")` via `mountlyHostPlugin`, plus auto-generated remote typings from built vertical fragments. See [vite-host-import/README.md](vite-host-import/README.md).

11. **`vite-host-remotes-url/`** — Vite host that declares a remote by **published URL** (`remotes: { "demo-widget": url }`); the host fetches the remote's fragment from that URL to auto-wire the import map + types. See [vite-host-remotes-url/README.md](vite-host-remotes-url/README.md). Proven by [`tests/vite-host-remotes-url.spec.ts`](../tests/vite-host-remotes-url.spec.ts).

Widget source packages live alongside hosts: **`payment-breakdown`**, **`image-lightbox`**, **`signup-card`** under `docs/examples/<name>/`.

12. **`multi-widget-bundle/`** — Three widgets sharing code in one bundle via `createWidgetBundle`. One JS fetch, one shared CSS stylesheet. No build step for the host. Open via the `plain-html` static server. See [multi-widget-bundle/README.md](multi-widget-bundle/README.md).

13. **`monorepo-component-library/`** — Simulates a monorepo: a shared UI library (`ui-lib.js`) consumed by a widgets bundle, loaded via `createWidgetBundle`. Demonstrates third-party imports flowing through a bundle. Open via the `plain-html` static server. See [monorepo-component-library/README.md](monorepo-component-library/README.md).

14. **`cross-framework-bus/`** — React 19 + Vue + Svelte widgets on one page, communicating through a typed `mountly/bus` event bus. No framework imports another. See [cross-framework-bus/README.md](cross-framework-bus/README.md).

## Run commands and ports

Each example has its own dedicated port, so they all run side-by-side without collisions.

| Example                             | Port     | Run command                                                               | URL                                                   |
| ----------------------------------- | -------- | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| `demo` (Vite)                       | **5174** | `pnpm --filter mountly-demo dev`                                          | <http://localhost:5174/>                              |
| `plain-html` (static)               | **5175** | `cd docs/examples/plain-html && pnpm dev`                                      | <http://localhost:5175/docs/examples/plain-html/>          |
| `quickstart/host.html`              | **5175** | (served by `plain-html`'s static server)                                  | <http://localhost:5175/docs/examples/quickstart/host.html> |
| `marketing-site` (static)           | **5176** | `cd docs/examples/marketing-site && pnpm dev`                                  | <http://localhost:5175/docs/examples/marketing-site/>      |
| `shadcn-drop-in` (static)           | **5177** | `cd docs/examples/shadcn-drop-in && pnpm dev`                                  | <http://localhost:5177/docs/examples/shadcn-drop-in/>      |
| `pokemon-kitchen-sink` (Vite)       | **5178** | `pnpm --filter pokemon-kitchen-sink dev`                                  | <http://localhost:5178/>                              |
| `mcp-app-demo` (CLI verify)         | N/A      | `pnpm --filter mcp-app-demo verify`                                       | CLI output                                            |
| `mcp-generative-demo` (CLI verify)  | N/A      | `pnpm --filter mcp-generative-demo verify`                                | CLI output                                            |
| `multi-vertical-host` (static)      | **5182** | `cd docs/examples/multi-vertical-host && pnpm dev`                             | <http://localhost:5182/docs/examples/multi-vertical-host/> |
| `vite-host-import` (Vite host)      | **5190** | `cd docs/examples/vite-host-import && pnpm run build:remote && pnpm dev`       | <http://localhost:5190>                               |
| `vite-host-remotes-url` (Vite host) | **5192** | needs a served remote — see [its README](vite-host-remotes-url/README.md) | <http://localhost:5192>                               |
| `multi-widget-bundle` (static)      | **5175** | (served by `plain-html`'s static server)                                  | <http://localhost:5175/docs/examples/multi-widget-bundle/> |
| `monorepo-component-library` (static)| **5175** | (served by `plain-html`'s static server)                                  | <http://localhost:5175/docs/examples/monorepo-component-library/> |
| `cross-framework-bus` (Vite)        | **5183** | `cd docs/examples/cross-framework-bus && pnpm dev`                             | <http://localhost:5183>                               |

All Vite servers use `strictPort: true`: they fail loudly if the port is already taken instead of picking another. Playwright reuses ports 5174 (demo) and 5175 (repo-root static server); `marketing-site` uses 5176 in its own webServer entry by design.

## Copy-paste patterns (host integration)

- **Imperative `feature.attach({ trigger, mount, ... })`** — Use when the host owns UX (e.g. a specific button opens a popover, you need callbacks like `onSubmit`, or you wire analytics next to the trigger). See `marketing-site/index.html` and `docs/examples/demo/src/main.ts`.

- **Declarative `<mountly-feature module-id="..." trigger="viewport">`** — Use when marketing or a CMS drops a fragment of HTML and you want **viewport / hover** activation without writing glue script per slot. Requires `registerCustomElement` + `defineMountlyFeature()` once per page. See `plain-html/index.html` and `marketing-site/index.html`.

- **Programmatic `feature.mount(container, context, props)`** — Use when the host controls timing (e.g. after a route change, wizard step, or server-driven flag). Pair with `feature.update` / `unmount` when you need fine-grained lifecycle.

Import maps in static HTML should map **`mountly`** and any used **`mountly/*` subpaths** (for example `mountly/attach`, `mountly/elements`) to concrete `.js` files under your runtime build. When using `bootstrapMountly()` from a manifest, only the base `mountly` key is needed — the runtime auto-derives all `mountly/*` subpaths from it. When using peer widget builds (`dist/peer.js`), map **`react`**, **`react/jsx-runtime`**, and **`react-dom/client`** as well. Published hosts use the same specifier pattern with CDN URLs (see [plain-html/README.md](plain-html/README.md)).

## Choosing a distribution

Each widget scaffolded by `mountly init` ships two ESM entries: `dist/index.js` (self-contained, bundles React) and `dist/peer.js` (peer build, expects React from the host's import map). The choice lives in the host's import map. Widget source doesn't change.

| Use case                                | Pick                                 | Why                                                 |
| --------------------------------------- | ------------------------------------ | --------------------------------------------------- |
| One widget on a page, host has no React | **Self-contained** (`dist/index.js`) | Zero host wiring; ~148 KB gz                        |
| Two or more widgets on the same page    | **Shared React** (`dist/peer.js`)    | One copy of React (~45 KB gz) + ~5 KB gz per widget |
| Host is already a React/Next app        | **Shared React**                     | Avoids two React instances on one page              |
| Quick prototype / single embed          | **Self-contained**                   | Faster to wire; bytes only matter in production     |

Numbers are representative. Measure your own widgets in DevTools. For the runnable side-by-side: same widgets, two import maps, see [plain-html/README.md](plain-html/README.md).

## When to use mountly

- Embeddable **widgets** on static sites, CMS pages, or another team’s stack without shipping a full SPA.
- **Intent-based** activation (hover, click, viewport, idle) with a shared **module + data cache** story.
- **Multiple widgets** on one page with one shared React (peer builds + import map).
- **Multi-team verticals** with independent repos/CDN deploys (manifest + import map). See [docs/micro-frontends.md](../docs/micro-frontends.md).

## When not to use it

- You already have a **single** React/Next/Svelte app and every surface is owned by that bundler. Framework-native lazy routes may be enough.
- You need **SSR + hydration** of the same server-rendered tree (Astro/Next islands). mountly focuses on **on-demand mount** of widget modules, not hydrating server HTML.
- You want a **micro-frontend orchestration control plane** (routing, deployment, versioning across teams). mountly is a **runtime + patterns** layer; pair it with your CDN and manifest workflow instead.

## Per-package notes

- [signup-card/README.md](signup-card/README.md) — embed snippet for the signup widget.
- [shadcn-drop-in/README.md](shadcn-drop-in/README.md) — static host proving shadcn-style React can drop into plain HTML.
- [pokemon-kitchen-sink/README.md](pokemon-kitchen-sink/README.md) — exhaustive feature demo.
