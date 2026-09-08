---
"mountly-svelte": patch
---

Fix prop updates on Svelte 5 components. `mount()` reads its `props` object once, so
`update()` changed nothing on screen — a component showing `7` kept showing `7` after the
host set the prop to `9`. The adapter now hands Svelte a `$state`-tracked props object and
patches it in place, so updates render while the component keeps its own internal state.
Props the host drops are cleared rather than lingering.

The rune module is loaded on demand, so a host using legacy class components or supplying
its own `mount` never pulls in Svelte's client runtime and never has to map it.
