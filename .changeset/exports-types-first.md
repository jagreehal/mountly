---
"mountly": patch
"mountly-manifest": patch
"mountly-vite-plugin": patch
"mountly-mcp": patch
"mountly-react": patch
"mountly-svelte": patch
"mountly-vue": patch
---

Fix `exports` condition order so the packages are typed for `node16`/`nodenext` consumers.

Every subpath listed `import` before `types`. Export conditions match in order, so `import` always won and the `types` condition was never reached — anyone on `moduleResolution: node16` or `nodenext` resolved these packages as untyped and fell back to `any`. `bundler` resolution masked it by finding the adjacent `.d.ts` on its own.

No runtime change; `types` now comes first on all 38 subpaths.
