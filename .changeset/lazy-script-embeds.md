---
"mountly": minor
"mountly-vite-plugin": minor
---

Add script-tag component distributions. `defineElementsConfig({ prefix, elements })` takes a
glob of ordinary React, Vue or Svelte components, infers each one's framework from its file
extension, and reads its props from the source — React prop types, Vue's `defineProps` and
`defineEmits`, Svelte 5's `$props` rune. Each becomes a custom element with real attributes,
real properties and real DOM events: no JSON prop blob, no callback map, and nothing for the
consumer to install or initialize beyond one script tag. Vue's Options API, quoted prop names
like `'aria-label'` and method-syntax callbacks are read too, and a contract the build cannot
read fully fails the build rather than shipping an element that ignores half its props.

Mountly's own controls live under `data-mountly-*`, so a component is free to have props named
`trigger` or `mount`.

Vue and Svelte builds need no compiler plugin in the config: the build reads the extensions it
globbed and brings `@vitejs/plugin-vue` or `@sveltejs/vite-plugin-svelte` itself, and refuses a
second copy rather than transforming twice.

The build emits `embed.d.ts` for typed tags and a `custom-elements.json` manifest for editor
autocomplete alongside a lazily loaded `embed.js`, which registers every tag and downloads
nothing until an element connects. One distribution may mix frameworks; components in it
share their framework chunk. Props and data changes made during an asynchronous mount are
retained.
