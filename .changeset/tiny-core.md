---
"mountly": major
"mountly-manifest": patch
"mountly-react": minor
"mountly-vue": minor
"mountly-svelte": minor
"mountly-vite-plugin": minor
---

Replace the island runtime with a 2.3 KB core.

`mountly/host/auto` shipped 8.2 KB gzipped across two files; `mountly/auto` ships
2.3 KB in one. The JSON `data-mountly-island` payload, the loader registry and
the twenty-odd knobs around them are gone, replaced by plain `data-*`
attributes.

**Breaking**

- `data-mountly-island='{"id":…,"moduleId":…}'` → `data-mountly="<url>"`,
  `data-on`, `data-preload`, `data-props`, `data-target`, `data-toggle`,
  `data-css`.
- `mountly/island`, `mountly/host` and `mountly/host/auto` are removed. Use
  `mountly` (`mountly()` / `mount` / `unmount` / `update`) and `mountly/auto`.
- `createOnDemandFeature` and friends moved from `mountly` to `mountly/feature`.
- `skipIfHydrated`, `forceRemount`, `hydratedAttr`, `requireSsrMarker`,
  `ssrMarkerAttr` and `warnOnHydrationMismatch` collapse into
  `data-mountly-state="mounted"`.
- `waitForParent` is gone: a MutationObserver picks up islands added at any
  time, including ones a parent widget renders.
- `retry` / `retryDelayMs` are gone: pass `load` to `mountly()` instead.
- `data-mountly-reserve` is gone: use `style="min-height: …"`.
- `once` inverted — activation mounts once by default; `data-toggle` opts in to
  click-to-close.
- `mountly:refresh` / `mountly:unmount` control events are gone: call
  `update(el, props)` / `unmount(el)`. `mountly:mount`, `mountly:unmount` and
  `mountly:error` are still dispatched.
- `activateOnMediaQuery` / `preloadOnMediaQuery` fold into the trigger itself:
  `data-on="media:(min-width: 60rem)"`.

**No import map for a plain-HTML host**

The adapters now bundle `mountly/shadow` and `mountly/assets` instead of
externalising them, and `mountly-vite-plugin`'s self-contained build bundles
`mountly/*` too. A widget built either way carries everything it needs, so
dropping it into a page takes zero import-map entries — down from fifteen in
the quickstart. The peer build still externalises them; sharing through the
host's import map is the point of that build.

The trade-off: a self-contained widget now carries its own mountly module cache
and analytics, so a host that also imports `mountly` sees separate state. Use
the peer build on any host with a bundler — the same rule that already applied
to React.

**`<mountly-feature>` is a shim over the core**

The custom element had its own trigger resolution, props parsing, mount-target
handling and lifecycle — a second implementation of the island system with a
different vocabulary. It now translates its attributes to the core's and calls
`wire()`. `mountly/elements` drops from 8.3 KB to 5.8 KB gzipped, and
`mountly/feature` is loaded dynamically, only when a module is registered with
`loadData`, `getCacheKey` or `render`.

Behaviour changes in the element:

- `preload-on` is opt-in. It used to default to the activation trigger for
  `hover`/`viewport`/`idle`, which preloads on the very event that mounts.
- Invalid JSON in `props` puts the element in `data-mountly-state="error"` and
  fires `mountly:error`, instead of warning and mounting with `{}`. This holds
  at any point in the element's life, not just at registration.
- `url-events` is gone; the `url` trigger covers `popstate`, `hashchange`,
  `pushState` and `replaceState`.

**Custom triggers**

`triggers` is exported: a plain object of `(el, arg, run) => teardown`. Assign
to it to add one. This replaces the `registerTriggerPlugin` / `createPluginTrigger`
API that the docs described but the source never contained.

**Lifecycle fixes**

- A widget whose `mount()` returns a rejected promise now lands in
  `data-mountly-state="error"` and dispatches `mountly:error`, instead of
  stranding the island in `loading` behind an unhandled rejection. The island
  is left genuinely unmounted, so the next intent retries it.
- `unmount()` during a load is honoured: the module arriving a moment later no
  longer mounts over the caller's decision, and a widget that finishes an async
  mount after an unmount is torn down rather than left on the page.
- A teardown that is still unwinding no longer erases the mount that replaced
  it. This covers all three ways it happened: a superseded in-flight `mount()`,
  a widget whose `unmount()` keeps working after it returns, and a `stop()` plus
  re-`wire()` that used to drop the pending teardown with the old state. A new
  mount waits the old one out.
- Async `update()` joins the same lifecycle queue, reports rejections through
  `mountly:error`, and cannot finish late over a newer mount. The queue is keyed
  by mount target, so separate triggers sharing one `data-target` serialize too.
- A teardown returned by `wire()` is bound to the state it created and is
  idempotent; calling an old teardown again cannot stop a later re-wire.
- URL-backed custom elements pass the registered bundle URL as `moduleUrl`
  while retaining the module id as their independent load/cache key.
- A `data-on` list with one unknown trigger name — `data-on="click telepathy"` —
  now wires nothing at all. It used to attach the valid listener before
  throwing, so the island reported an error and still mounted on click.
- Switching a `<mountly-feature>` from a URL-backed module id to a
  factory-backed one clears `data-css` instead of keeping the previous
  module's stylesheet.
- A `data-preload` trigger that fires synchronously — `media:` when the query
  already matches — no longer hits a temporal dead zone and error the island
  out.
- The built `dist` restores `/* @vite-ignore */` on the CSP fallback
  `import()`; esbuild strips it in every minify mode, and Vite matches that
  exact comment before deciding to warn.
- `runBridge` latches `data-mountly-mcp-state="error"`. A View that threw once
  still recovers visually on a later notification, but the recorded outcome
  `verify --render` reads stays `error`, which is what the comment always
  claimed.
