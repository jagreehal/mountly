# React, Vue and Svelte from one build

Three ordinary components — `ReactCard.tsx`, `VuePanel.vue`, `SvelteList.svelte` —
published as custom elements by a `vite.config.ts` that names **no compiler
plugins**. Each carries a small stylesheet that reads a host CSS variable
(`--react-embed-color`, `--vue-embed-color`, `--svelte-embed-color`) so light-DOM
hosts can theme them, and so `shadow: true` builds can prove isolation.

```ts
export default defineElementsConfig({
  prefix: "acme",
  elements: "src/elements/*.{tsx,vue,svelte}",
  root: fileURLToPath(new URL(".", import.meta.url)),
});
```

`defineElementsConfig` globs the components at config time, so it already knows
which frameworks are in play and brings `@vitejs/plugin-vue` and
`@sveltejs/vite-plugin-svelte` itself. Registering one of them by hand as well
is an error rather than a silent double transform.

From the repository root:

```sh
pnpm install
pnpm --filter mountly --filter mountly-react --filter mountly-vue --filter mountly-svelte --filter mountly-vite-plugin build
pnpm --filter mixed-embed-example build
pnpm exec serve . -l 5198
```

Open `http://localhost:5198/docs/examples/mixed-embed/host.html`. Each element
renders from its own framework, with its attributes coerced by the props type
the build read: `balance="12"` is the number `12`, `rows="7"` the number `7`.
"Add a row" assigns `list.rows`, proving a property update reaches a Svelte 5
component rather than being inert.

Each framework arrives only when one of its elements connects, so a page with
only `<acme-react-card>` never downloads Vue or Svelte.

`tests/embed-build.spec.ts` builds this example and asserts all three render.

See the [script embed guide](https://mountly.dev/concepts/script-embeds/).
