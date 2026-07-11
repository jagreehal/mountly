# Vite host — remotes by URL

Declare a remote by its published URL, federation-style:

```ts
mountlyHostPlugin({
  remotes: { "demo-widget": "https://cdn.example.com/demo-widget/" },
});
```

The host fetches the remote's `mountly.manifest.fragment.json` from that URL at build time and auto-wires:

- the **import map** (`demo-widget` → `<url>/index.js`, `demo-widget/Badge` → `<url>/Badge.js`)
- **types**: it fetches the remote's `.d.ts` over HTTP and writes `src/mountly-remotes.d.ts`, so `import("demo-widget/Badge")` is typed
- **externalization**: the host build leaves the remote specifiers external; the import map resolves them at runtime

No local fragment file, no `shared` block. The host imports the remote as native ESM:

```tsx
const RemoteBadge = lazy(() => import("demo-widget/Badge").then((m) => ({ default: m.Badge })));
const mod = await import("demo-widget");
```

## vs vite-plugin-federation

Federation's `remotes: { app: "http://.../remoteEntry.js" }` records a URL but gives the host **no types** and needs a hand-maintained `shared` block on both sides. mountly fetches the fragment the remote already emits, so the host gets typed, discoverable exposes, and React is shared through the import map, nothing to keep in sync.

## Run

The remote must be served before the host builds (the host fetches its fragment). In this repo that orchestration lives in [`tests/vite-host-remotes-url.spec.ts`](../../tests/vite-host-remotes-url.spec.ts), which builds the [`vite-host-import`](../vite-host-import) remote, serves it, then builds and serves this host against that URL and asserts the remote renders in a browser.

Manual loop:

```bash
# 1. build + serve a remote (any mountlyRemote build)
pnpm --filter vite-host-import run build:remote
pnpm exec serve docs/examples/vite-host-import/remote/dist -l 5191   # or any static server

# 2. build this host pointing at the served remote, then preview
MOUNTLY_REMOTE_URL=http://localhost:5191/ pnpm --filter vite-host-remotes-url run build:host
pnpm --filter vite-host-remotes-url preview
```
