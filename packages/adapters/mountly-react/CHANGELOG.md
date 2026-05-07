# mountly-react

## 1.0.1

### Patch Changes

- 978694c: Reduce bundle size by splitting `mountly` into granular subpath exports (`mountly/shadow`, `mountly/assets`, `mountly/adapter`, `mountly/analytics`, `mountly/bus`, `mountly/url`, etc.) and removing the thin `*-entry.ts` aggregators. Mark the package as side-effect-free except for `mountly/host/auto`, so bundlers can tree-shake unused subpaths.

  The framework adapters (`mountly-react`, `mountly-svelte`, `mountly-vue`, `mountly-tsrx`) now import from the specific subpaths they need instead of the root, so consumers only pay for the runtime they actually use.

- Updated dependencies [978694c]
  - mountly@0.2.2

## 1.0.0

### Patch Changes

- 888e622: Add media-query trigger support for island payloads and expand the custom element API for module registration/auto-registration in `mountly`.

  Update adapter peer dependency ranges for React, Svelte, and Vue to support a wider set of framework versions.

- Updated dependencies [888e622]
  - mountly@0.2.0

## 0.1.4

### Patch Changes

- bace1e2: Add first-party Mountly primitives for data sources, URL query state, typed cross-island events, and widget test fixtures.
- Updated dependencies [bace1e2]
  - mountly@0.1.4

## 0.1.3

### Patch Changes

- 5695dd8: Updated tests
- Updated dependencies [5695dd8]
  - mountly@0.1.3

## 0.1.2

### Patch Changes

- 2545d57: Styling DX
- Updated dependencies [2545d57]
  - mountly@0.1.2

## 0.1.1

### Patch Changes

- b2ccc1f: Added Islands
- Updated dependencies [b2ccc1f]
  - mountly@0.1.1
