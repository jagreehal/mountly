# Examples

Runnable hosts and widgets that exercise the **mountly** runtime. New to mountly? Start with the [60-second Quick Start](../README.md#quick-start-60-seconds) in the project README — it scaffolds your own widget. This page is for evaluating mountly against pre-built examples, or for copying integration patterns into a host.

## One-time setup (repo root)

```bash
pnpm install
pnpm -r build
```

Build output must exist under `packages/mountly/dist/` and each example widget’s `dist/` before opening the static examples.

## Pick an example to run

1. **`marketing-site/`** — Plain HTML “real” marketing page: imperative `attach()`, declarative `<mountly-feature>`, shared React via import map. Best **before/after** story: open DevTools → Network, reload, then hover the hero button or scroll to the inline embed. See [marketing-site/README.md](marketing-site/README.md) for what to expect on the wire (sizes are **representative**; measure your own widgets in DevTools).

2. **`plain-html/`** — No Vite on the host: import maps + native modules only. Two URLs: self-contained widgets vs **shared React** (`shared-react.html`). See [plain-html/README.md](plain-html/README.md).

3. **`demo/`** — Vite app on **port 5174** (`pnpm --filter mountly-demo dev` from repo root, or `pnpm dev` inside `examples/demo/`). Exercises `attach`, multi-instance, custom element registration, devtools, prefetch, and more. Reference when integrating a **bundler** host.

4. **`shadcn-drop-in/`** — Plain HTML host showing a shadcn-style React widget dropped in via import map and `mountly-feature`. Best for teams validating “React UI in static host” with no host framework.

5. **`quickstart/host.html`** — Shortest copy-paste host (import map + one `attach`). Open via a static server that serves the **repository root** (same as `plain-html`).

6. **`pokemon-kitchen-sink/`** — Stress-test of triggers, prefetch, custom elements, analytics. For **deep dives**, not first-day onboarding. Vite dev server on **port 5178** (distinct from `plain-html` so they can run side-by-side).

Widget source packages live alongside hosts: **`payment-breakdown`**, **`image-lightbox`**, **`signup-card`** under `examples/<name>/`.

## Run commands and ports

Each example has its own dedicated port — no collisions, all of them can run side-by-side.

| Example | Port | Run command | URL |
|---|---|---|---|
| `demo` (Vite) | **5174** | `pnpm --filter mountly-demo dev` | <http://localhost:5174/> |
| `plain-html` (static) | **5175** | `cd examples/plain-html && pnpm dev` | <http://localhost:5175/examples/plain-html/> |
| `quickstart/host.html` | **5175** | (served by `plain-html`'s static server) | <http://localhost:5175/examples/quickstart/host.html> |
| `marketing-site` (static) | **5176** | `cd examples/marketing-site && pnpm dev` | <http://localhost:5176/examples/marketing-site/> |
| `shadcn-drop-in` (static) | **5177** | `cd examples/shadcn-drop-in && pnpm dev` | <http://localhost:5177/examples/shadcn-drop-in/> |
| `pokemon-kitchen-sink` (Vite) | **5178** | `pnpm --filter pokemon-kitchen-sink dev` | <http://localhost:5178/> |

All Vite servers use `strictPort: true` — they fail loudly if the port is already taken instead of silently picking another. Playwright reuses ports 5174 (demo) and 5175 (repo-root static server); `marketing-site` uses 5176 in its own webServer entry by design.

## Copy-paste patterns (host integration)

- **Imperative `feature.attach({ trigger, mount, ... })`** — Use when the host owns UX (e.g. a specific button opens a popover, you need callbacks like `onSubmit`, or you wire analytics next to the trigger). See `marketing-site/index.html` and `examples/demo/src/main.ts`.

- **Declarative `<mountly-feature module-id="..." trigger="viewport">`** — Use when marketing or a CMS drops a fragment of HTML and you want **viewport / hover** activation without writing glue script per slot. Requires `registerCustomElement` + `defineMountlyFeature()` once per page. See `plain-html/index.html` and `marketing-site/index.html`.

- **Programmatic `feature.mount(container, context, props)`** — Use when the host controls timing (e.g. after a route change, wizard step, or server-driven flag). Pair with `feature.update` / `unmount` when you need fine-grained lifecycle.

Import maps in static HTML should map the bare specifier **`mountly`** to your built runtime, e.g. **`/packages/mountly/dist/index.js`** when serving the monorepo root. If you use peer widget builds (`dist/peer.js`), map **`react`**, **`react/jsx-runtime`**, and **`react-dom/client`** as well. Published hosts use the same specifier pattern with CDN URLs (see [plain-html/README.md](plain-html/README.md)).

## Choosing a distribution

Each widget scaffolded by `mountly init` ships two ESM entries: `dist/index.js` (self-contained, bundles React) and `dist/peer.js` (peer build, expects React from the host's import map). The choice lives in the host's import map — widget source doesn't change.

| Use case | Pick | Why |
|---|---|---|
| One widget on a page, host has no React | **Self-contained** (`dist/index.js`) | Zero host wiring; ~148 KB gz |
| Two or more widgets on the same page | **Shared React** (`dist/peer.js`) | One copy of React (~45 KB gz) + ~5 KB gz per widget |
| Host is already a React/Next app | **Shared React** | Avoids two React instances on one page |
| Quick prototype / single embed | **Self-contained** | Faster to wire; bytes only matter in production |

Numbers are representative — measure your own widgets in DevTools. For the runnable side-by-side: same widgets, two import maps, see [plain-html/README.md](plain-html/README.md).

## When to use mountly

- Embeddable **widgets** on static sites, CMS pages, or another team’s stack without shipping a full SPA.
- **Intent-based** activation (hover, click, viewport, idle) with a shared **module + data cache** story.
- **Multiple widgets** on one page with one shared React (peer builds + import map).

## When not to use it

- You already have a **single** React/Next/Svelte app and every surface is owned by that bundler — framework-native lazy routes may be enough.
- You need **SSR + hydration** of the same server-rendered tree (Astro/Next islands). mountly focuses on **on-demand mount** of widget modules, not hydrating server HTML.
- You want a **micro-frontend orchestration** platform (routing, deployment, versioning across teams) — this is a **runtime + patterns** layer, not a full MFE control plane.

## Per-package notes

- [signup-card/README.md](signup-card/README.md) — embed snippet for the signup widget.
- [shadcn-drop-in/README.md](shadcn-drop-in/README.md) — static host proving shadcn-style React can drop into plain HTML.
- [pokemon-kitchen-sink/README.md](pokemon-kitchen-sink/README.md) — exhaustive feature demo.
