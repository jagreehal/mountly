# Multi-vertical host

Manifest-driven shell demonstrating the mountly micro-frontend model:

1. **Vite builds ESM**: vertical widgets (`payment-breakdown`, `image-lightbox`) ship `dist/peer.js`
2. **CDN hosts ESM**: local paths simulate versioned CDN URLs in `manifest.json`
3. **Import map pins versions**: `installPlatformRuntime()` injects platform + vertical mappings
4. **Runtime loads + mounts widgets**: `bootstrapMountly()` auto-derives all `mountly/*` subpath imports from a single `mountly` key in the manifest
5. **Manifest describes verticals**: teams register `id`, `url`, `team`, `version`

## Run

From repo root (after `pnpm -r build`):

```bash
cd docs/examples/multi-vertical-host && pnpm dev
```

Open <http://localhost:5182/docs/examples/multi-vertical-host/>

## What to try

- Click **Show payment breakdown**: payments vertical loads on intent
- Click **Open gallery**: media vertical via declarative `<mountly-feature>`
- Use bus buttons: cross-team events via `mountly/contracts` (no widget coupling)

## Mock API

Payment breakdown expects `/api/payments/pay_123`. For a full demo, run `docs/examples/demo` on port 5174 in parallel, or add a static mock. The widget still proves manifest loading if the fetch fails after mount.
