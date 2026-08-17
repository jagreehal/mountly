# mountly-mcp

## 1.0.0

### Minor Changes

- ad95cff: BREAKING: simplify the package surface. mountly stays import-map-native — the import map already pins one URL per bare specifier, so the browser loads one React. The Module-Federation-style share-scope runtime and SPA-shell layer have been removed; they re-solved a problem import maps don't have.

  Removed packages:

  - `mountly-share` — share-scope resolution + runtime admission. Gone. The genuinely useful check (duplicate-React / version skew) already lives in `validateManifest`, derived from `platform.imports`.
  - `mountly-shell` / `mountly-shell-tanstack` — SPA-shell orchestration. Gone. Use your router's native lazy-route loading (e.g. TanStack Router `createLazyRoute`) to `import()` a remote when its route activates.
  - `mountly-tsrx` — dropped.

  Merged: `mountly-mcp-react`, `mountly-mcp-server`, `mountly-json-render` are now subpaths of `mountly-mcp` (`mountly-mcp/react`, `mountly-mcp/server`, `mountly-mcp/json-render`).

  Folded: `mountly-contracts` is now `mountly/contracts` (zod-free; `mountly` core has zero runtime dependencies again).

  `mountly` (`mountly/runtime`): removed `loadRemote`, `initShareScope`, and the `mountly-share` dependency. `bootstrapMountly` no longer locks a share scope.

  `mountly-manifest`: removed `platform.shared`, per-vertical `shared`, the `mounts`/`routes` schema, `defaultReactPlatformShared`, and all share-scope re-exports. The `mountly manifest resolve` CLI subcommand is gone (`validate` / `compose` / `codegen` remain).

  `mountly-vite-plugin`: removed `mode: "shell"`, `shareStrict`, and the `shared`/`mounts` fragment options; `mountlyHostPlugin` now has one (widget/host) mode. Added `mountlyRemote({ name, exposes })` — a drop-in remote plugin (`vite build`, no build script, no `shared`). `mountlyHostPlugin` gains federation-style `remotes: { name: url }` (fetches the remote's published fragment to auto-wire the import map + types); the previous `remotes` dev-origin-override option is renamed `devOrigins`.

  `mountly-mcp` also gains the `./json-render` subpath: generative UI. `createGenerativeWidget({ catalog, components })` renders [`@json-render`](https://github.com/vercel-labs/json-render) specs as MCP Apps widgets — reading the spec from the tool result, resolving `$state` bindings, and routing the rendered UI's actions back to the agent via `App.sendMessage`. `streamSpec({ catalog, model, prompt })` (the `mountly-mcp/json-render/server` entry, model-agnostic) turns a prompt into UI: `await .result` for the final validated spec, or iterate `.partialSpecStream` to watch the UI build element by element. `useUIStream`/`useChatUI` and `compileTextStreamToSpecs` are re-exported. `streamSpec` also ships local ports of two not-yet-released json-render repairs — a prompt rule requiring a `children` array on every element, and pruning of children references to elements the model never defined (reported in `fixes`) — to be dropped once `@json-render/core` releases past 0.19.0. See `docs/examples/mcp-generative-demo`.

### Patch Changes

- 814f6e8: Fix `exports` condition order so the packages are typed for `node16`/`nodenext` consumers.

  Every subpath listed `import` before `types`. Export conditions match in order, so `import` always won and the `types` condition was never reached — anyone on `moduleResolution: node16` or `nodenext` resolved these packages as untyped and fell back to `any`. `bundler` resolution masked it by finding the adjacent `.d.ts` on its own.

  No runtime change; `types` now comes first on all 38 subpaths.

- Updated dependencies [814f6e8]
- Updated dependencies [ad95cff]
  - mountly@0.3.0
  - mountly-react@2.0.0
