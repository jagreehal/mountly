# mountly

## 0.2.2

### Patch Changes

- 978694c: Reduce bundle size by splitting `mountly` into granular subpath exports (`mountly/shadow`, `mountly/assets`, `mountly/adapter`, `mountly/analytics`, `mountly/bus`, `mountly/url`, etc.) and removing the thin `*-entry.ts` aggregators. Mark the package as side-effect-free except for `mountly/host/auto`, so bundlers can tree-shake unused subpaths.

  The framework adapters (`mountly-react`, `mountly-svelte`, `mountly-vue`, `mountly-tsrx`) now import from the specific subpaths they need instead of the root, so consumers only pay for the runtime they actually use.

## 0.2.1

### Patch Changes

- b3f8290: shadow now opt-in

## 0.2.0

### Minor Changes

- 888e622: Add media-query trigger support for island payloads and expand the custom element API for module registration/auto-registration in `mountly`.

  Update adapter peer dependency ranges for React, Svelte, and Vue to support a wider set of framework versions.

## 0.1.4

### Patch Changes

- bace1e2: Add first-party Mountly primitives for data sources, URL query state, typed cross-island events, and widget test fixtures.

## 0.1.3

### Patch Changes

- 5695dd8: Updated tests

## 0.1.2

### Patch Changes

- 2545d57: Styling DX

## 0.1.1

### Patch Changes

- b2ccc1f: Added Islands
