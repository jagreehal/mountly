# Vite host — import remotes

Federation-style import DX for Vite host apps via `mountlyHostPlugin`:

```tsx
const mod = await import("demo-widget");
const { Badge } = await import("demo-widget/Badge");
```

Plain HTML hosts continue with `bootstrapMountly()`. See [`multi-vertical-host`](../multi-vertical-host).

## Remote: one plugin, `vite build`

The remote ([`remote/vite.config.ts`](remote/vite.config.ts)) adds `mountlyRemote` and runs `vite build`. No build script, and no `shared` config to keep in sync with the host. The framework peers are externalized and the host shares them through its import map.

```ts
// remote/vite.config.ts
export default defineConfig({
  plugins: [
    react(),
    mountlyRemote({
      name: "demo-widget",
      exposes: { ".": "src/index.ts", "./Badge": "src/Badge.tsx" },
    }),
  ],
});
```

`vite build` emits each exposed entry plus `mountly.manifest.fragment.json` and `.d.ts` files, so the host's `import("demo-widget/Badge")` is fully typed.

The host plugin auto-composes the host from built remote fragments:

```ts
mountlyHostPlugin({
  verticals: [{ fragment: "./remote/dist/mountly.manifest.fragment.json" }],
});
```

No handwritten host manifest is required for the common React case.

The host plugin also writes `src/mountly-remotes.d.ts`, and by convention it expects remote declarations at:

- root remote: `./types/index.d.ts`
- subpath export `./Badge`: `./types/Badge.d.ts`

If those files exist, `import("demo-widget")` and `import("demo-widget/Badge")` get real declaration-backed types, not `unknown`. Missing remote declaration files are treated as a contract violation in build mode by default.

## Run

From repo root:

```bash
pnpm -r build
cd docs/examples/vite-host-import && pnpm run build:remote && pnpm dev
```

Serve static artifacts for production-like URLs (optional, for proxy):

```bash
cd docs/examples/multi-vertical-host && pnpm dev
```

Open http://localhost:5190

## Override generated types path

```ts
mountlyHostPlugin({
  verticals: [{ fragment: "./remote/dist/mountly.manifest.fragment.json" }],
  types: { outFile: "./types/mountly-remotes.d.ts" },
  writeManifest: "./manifest.json",
});
```

Compose a static manifest without Vite:

```bash
npx mountly manifest compose ./remote/dist/mountly.manifest.fragment.json --out manifest.json
```
