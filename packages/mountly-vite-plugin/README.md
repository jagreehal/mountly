# mountly-vite-plugin

Vite plugins for both ends of a [mountly](https://npmjs.com/package/mountly)
setup: building a widget so other teams can load it, and configuring the host
page that loads them.

```bash
pnpm add -D mountly-vite-plugin
```

## Building a widget

One config produces two builds from the same source:

```ts
// vite.config.ts
import { defineMountlyWidgetConfig } from "mountly-vite-plugin";

export default defineMountlyWidgetConfig({
  framework: "react",
  entry: "src/index.ts",
  verticalId: "billing",
  featureExport: "checkout",
  exposes: { "./Checkout": "src/Checkout.tsx" },
});
```

- **`dist/index.js`** — React inlined. Drops onto any page, no host setup.
- **`dist/peer.js`** — React external. The host supplies one copy through its
  import map, so three widgets share it instead of shipping three.

Widget authors pick neither; both are emitted, and the host decides which URL
it points at.

It also writes **`dist/mountly.manifest.fragment.json`**, the entry your CI
merges into the host's manifest — including a `types` block naming what each
entry exports, read from the TypeScript checker rather than guessed. Declaration
files land in `dist/types/`, so a host that imports `billing/Checkout` gets real
types for a module it never compiled.

`vite build` outputs both, plus the fragment, with no separate build script.

## Configuring the host

```ts
// vite.config.ts
import { mountlyHostPlugin } from "mountly-vite-plugin";

export default {
  plugins: [mountlyHostPlugin({ manifest: "./mountly.manifest.json" })],
};
```

The host plugin externalizes every remote the manifest declares — so Vite
doesn't try to bundle code that lives on someone else's CDN — and injects the
import map into the served HTML. Vite's `base` is applied to the map, so a site
served from a subpath resolves correctly.

Point it at fragments instead and it composes the manifest itself, which is
useful in a monorepo where the remotes are built alongside the host:

```ts
mountlyHostPlugin({
  verticals: [{ fragment: "./packages/billing/dist/mountly.manifest.fragment.json" }],
});
```

## Individual plugins

`defineMountlyWidgetConfig` is a preset over these, exported for when you need
to compose them into a config you already own:

| Export                          | Does                                                     |
| ------------------------------- | -------------------------------------------------------- |
| `mountlyHostPlugin`             | externalize remotes, inject the import map               |
| `mountlyRemote`                 | build one vertical, emit its manifest fragment           |
| `mountlyManifestFragmentPlugin` | emit the fragment and declarations for an existing build |
| `mountlyCssAsText`              | import CSS as a string, for adopting into a shadow root  |
| `getFrameworkPeerExternals`     | the externals list for a peer build                      |

## TypeScript

`mountlyManifestFragmentPlugin` reads exports from the TypeScript checker and
drives `tsc` for declaration emit, so `typescript` is a peer dependency. Nearly
every project that builds a widget already has it. Without it, the build still
succeeds — the fragment is written without its `types` block, and typed remotes
are unavailable until you install it.

TypeScript 7 or later is required, since it uses the `typescript/unstable`
checker API.

## Documentation

<https://mountly.dev/concepts/manifest-hosts/>

## License

Apache-2.0
