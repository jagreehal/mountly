---
'mountly-svelte': patch
'mountly-react': patch
'mountly-tsrx': patch
'mountly-vue': patch
'mountly': patch
---

Reduce bundle size by splitting `mountly` into granular subpath exports (`mountly/shadow`, `mountly/assets`, `mountly/adapter`, `mountly/analytics`, `mountly/bus`, `mountly/url`, etc.) and removing the thin `*-entry.ts` aggregators. Mark the package as side-effect-free except for `mountly/host/auto`, so bundlers can tree-shake unused subpaths.

The framework adapters (`mountly-react`, `mountly-svelte`, `mountly-vue`, `mountly-tsrx`) now import from the specific subpaths they need instead of the root, so consumers only pay for the runtime they actually use.
