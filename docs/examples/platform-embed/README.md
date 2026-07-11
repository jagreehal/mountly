# Platform embed

Product A needs a frontend customization inside another team's platform shell — the classic "should I use micro frontends?" scenario. This example shows **Stage 2** from [Choosing an architecture](/mountly/getting-started/choosing-an-architecture/): a widget drop-in, not Module Federation.

## Layout

```
docs/examples/
├── product-a-widget/          # Product A team — React widget + Product A API
└── platform-embed/
    └── platform-host/         # Platform team — plain HTML shell + manifest
```

- **Product A** owns the widget, builds `dist/peer.js`, deploys to a CDN.
- **Platform team** adds one custom element and a manifest entry. They never import React or Product A source.
- **Product A API** is exclusive to Product A; the widget calls it via `loadData` / `fetch`.

## Why not Module Federation?

| Federation pain | mountly approach |
| ---------------- | ---------------- |
| Hand-maintained `shared` block on host and remote | One React pin in the host import map |
| No types on remote imports | Typed ESM via manifest + fragments (Vite hosts) |
| Build-time coupling between teams | Widget is a versioned CDN artifact |
| Orchestrator for a single customization | One `<mountly-feature module-id="product-a-settings">` tag |

For a temporary customization before a platform split, Federation is overkill. See the decision ladder in the docs.

## Manifest checklist

Peer widget builds import `mountly`, `mountly-react`, and sometimes `mountly/*` subpaths such as `mountly/mount`.

- With `bootstrapMountly()`, map top-level `mountly` and it derives `mountly/*` subpaths for you.
- If you hand-write the host import map instead of using `bootstrapMountly()`, map any `mountly/*` subpaths the widget uses.
- On React hosts, keep the widget on `dist/peer.js`, not `dist/index.js`, so the host provides one React.

```bash
cd docs/examples/platform-embed/platform-host
pnpm validate   # mountly manifest validate
pnpm doctor     # validate + deploy footgun hints
```

## Run

From repo root:

```bash
pnpm install
pnpm -r build
cd docs/examples/platform-embed/platform-host && pnpm dev
```

Open <http://localhost:5184/docs/examples/platform-embed/platform-host/>

Validate the manifest before deploy:

```bash
cd docs/examples/platform-embed/platform-host
pnpm validate
```

## Migration to standalone Product A

When Product A becomes its own platform:

1. Keep `product-a-widget` artifacts unchanged (`dist/peer.js` on CDN).
2. New Product A host page loads the same manifest entry (or npm-imports the feature in a Vite app).
3. Remove the embed from the old platform shell.

No widget rewrite. No Federation migration project.

## See also

- [Choosing an architecture](/mountly/getting-started/choosing-an-architecture/)
- [marketing-site](../marketing-site/README.md) — similar "foreign host" flow
- [multi-vertical-host](../multi-vertical-host/README.md) — Stage 3 when multiple teams need independent CDN deploys
