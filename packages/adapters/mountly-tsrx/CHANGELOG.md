# mountly-tsrx

## 1.0.1

### Patch Changes

- 978694c: Reduce bundle size by splitting `mountly` into granular subpath exports (`mountly/shadow`, `mountly/assets`, `mountly/adapter`, `mountly/analytics`, `mountly/bus`, `mountly/url`, etc.) and removing the thin `*-entry.ts` aggregators. Mark the package as side-effect-free except for `mountly/host/auto`, so bundlers can tree-shake unused subpaths.

  The framework adapters (`mountly-react`, `mountly-svelte`, `mountly-vue`, `mountly-tsrx`) now import from the specific subpaths they need instead of the root, so consumers only pay for the runtime they actually use.

- Updated dependencies [978694c]
  - mountly@0.2.2

## 1.0.0

### Patch Changes

- Updated dependencies [888e622]
  - mountly@0.2.0

## 0.1.3

- Initial package scaffold.
