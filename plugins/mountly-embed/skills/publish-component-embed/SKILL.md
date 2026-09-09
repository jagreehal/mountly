---
name: publish-component-embed
description: >
  Publish an existing React, Vue or Svelte component as a custom element behind
  one script tag — an embeddable widget, a partner or CMS embed, a component
  another team can drop into a page they own. Use when the user asks to share a
  component with a team that does not use their framework, ship a script-tag
  embed or web component, or give consumers a `<my-thing>` tag. Use
  `defineElementsConfig` from `mountly-vite-plugin`. Do not hand-write a custom
  element class, and do not make the consumer install a package.
---

# Publish a component as a script-tag custom element

The author writes an ordinary component. `defineElementsConfig` reads its props
type at build time and publishes it as a custom element with real attributes,
real properties and real DOM events. The consuming page needs one script tag —
no package install, no import map, no init call.

## Do not

- Hand-write a `class extends HTMLElement`, `attributeChangedCallback` or an
  `observedAttributes` list — the build derives all of it from the props type
- Add a JSON prop blob, a callback map, or an `init()` the consumer must call
- Ask the consumer to install a package or add an import map
- Reach for `<mountly-feature>`, `installRuntime` or manifest fragments — those
  are the runtime for manifest-driven hosts that share one framework instance,
  a different problem
- Add `@vitejs/plugin-vue` or `@sveltejs/vite-plugin-svelte` to the Vite
  `plugins` array — the build adds them, and a second copy is a hard error
- Rename the component's props to suit the element

## Steps

1. Find the component to publish. It stays an ordinary component; nothing in it
   is Mountly-specific.
2. Check where its props type lives. In the component's own file, the build
   reads it. Anywhere else — a shared `types.ts`, a generated file, one `Props`
   imported by nine components — declare the table on the element entry instead
   (see **Declaring props**). Do not reshape the library to suit the extractor.
3. Install: `mountly` and the adapter for the framework (`mountly-react`,
   `mountly-vue` or `mountly-svelte`), plus `mountly-vite-plugin` as a dev
   dependency. Vue and Svelte components also need their own compiler installed
   (`@vitejs/plugin-vue` / `@sveltejs/vite-plugin-svelte`) — installed only, not
   configured.
4. Point the build at the components and give them a namespace:

```ts
// vite.config.ts
import { defineElementsConfig } from "mountly-vite-plugin";

export default defineElementsConfig({
  prefix: "acme",
  elements: "src/elements/*.tsx",
});
```

`PaymentsSummary.tsx` becomes `<acme-payments-summary>`. The framework comes
from the file extension — `.vue`, `.svelte`, `.tsx`/`.jsx` — so one
distribution may mix them. Globs accept a list:
`["src/elements/*.tsx", "src/cards/*.vue"]`.

5. `vite build`, then publish the whole `dist/` to a versioned HTTPS location
   with CORS enabled.
6. Hand the consumer the `embed.js` URL and the tag:

```html
<script type="module" src="https://ui.acme.com/payments/1.2.0/embed.js"></script>
<acme-payments-summary balance="1250" currency="GBP">Loading…</acme-payments-summary>
```

## What the props type becomes

| Prop type          | Consumer writes                            | Component receives     |
| ------------------ | ------------------------------------------ | ---------------------- |
| `number`           | `balance="1250"`                           | `1250`                 |
| `string`           | `currency="GBP"`                           | `"GBP"`                |
| `boolean`          | `compact` (or omit)                        | `true` / `false`       |
| object or array    | `line-items='[…]'` or `el.lineItems = […]` | the parsed value       |
| `(detail) => void` | `addEventListener("view-details", …)`      | a dispatching function |

Camel-case props take kebab-case attributes. `onViewDetails` becomes a
bubbling, composed `view-details` event with the callback's first argument as
`event.detail`. Attributes and properties are both live; an assigned property
beats the attribute of the same name.

## One explicit tag per export

When the components come from one module rather than a directory:

```ts
export default defineElementsConfig({
  prefix: "acme",
  elements: {
    "payments-card": { component: "src/index.tsx", exportName: "PaymentsCard" },
    "methods-panel": { component: "src/index.tsx", exportName: "MethodsPanel" },
  },
});
```

Entry fields: `component`, `exportName`, `framework` (only when the extension
does not say — a Vue `defineComponent` in a `.ts` file), `props` (an explicit
prop table), `trigger` (core trigger syntax; defaults to `connected`).

## What ships

- `embed.js` — registers every tag, downloads nothing else
- `embed.d.ts` — typed tags for plain DOM and global-JSX frameworks
- `embed.react.d.ts` — React 19 resolves `JSX` from the `react` module, so a
  React host references this one instead; it pulls in `embed.d.ts`
- `custom-elements.json` — Custom Elements Manifest, for editor autocomplete
  without TypeScript

A component, its framework and its CSS arrive only when one of its elements
connects. Components in one distribution share their framework chunk.

## When the build fails

The build refuses to ship an element that would ignore what the consumer sets.

- **Cannot read the props of X** — the props type is imported from another
  module, is Vue's runtime `defineProps({ … })`, or sits behind an opaque
  wrapper. Declare the table (see **Declaring props**), or move the type into
  the component's file when it is yours to move.
- **Two components both map to `<tag>`** — two files share a basename. Use the
  explicit map form and name each tag.
- **`@vitejs/plugin-vue` is registered N times** — remove it from your own
  `plugins` array.
- **Vue components composed with `mixins` / `extends` / a spread** carry a
  contract the build cannot see. Pass `props` explicitly.

## Declaring props

The supported path when the contract is not readable from the one file — not a
workaround. Same shape the build would have derived, and it drives attributes,
properties, events, `embed.d.ts` and `custom-elements.json` identically:

```ts
export default defineElementsConfig({
  prefix: "acme",
  elements: {
    "payments-summary": {
      component: "src/elements/PaymentsSummary.tsx",
      props: [
        { name: "balance", attribute: "balance", kind: "number" },
        { name: "currency", attribute: "currency", kind: "string" },
        { name: "compact", attribute: "compact", kind: "boolean" },
        { name: "lineItems", attribute: "line-items", kind: "json" },
        { name: "onViewDetails", event: "view-details", kind: "event" },
      ],
    },
  },
});
```

`kind` is `string`, `number`, `boolean`, `json`, `auto` or `event`. The table is
then yours to keep in step with the component, so move the type into the file
instead when that is easy.

## Light DOM, and when to leave it

Elements render in light DOM. Keep it: the usual consumer is a page that wants
its own design system to reach in. Set `shadow: true` on the config when the
host is one you do not trust to leave your component alone, or must not be
affected by yours:

```ts
export default defineElementsConfig({
  prefix: "acme",
  elements: "src/elements/*.tsx",
  shadow: true,
});
```

It is distribution-wide — it describes the host you ship to, not the component.
Under it the build emits one stylesheet it injects into no document, and each
element adopts it into its own root.

Neither mode is a security boundary: the component runs as script in the host's
page, with its `window`, cookies and network. If the requirement is mutual
protection from an adversarial host, say so plainly and point at a cross-origin
iframe (`mountly/iframe`) instead of shipping a shadow root as if it were one.

## Adjusting the build

The return value is an ordinary Vite config (relative `base`, CSS code
splitting, sourcemaps, `embed.js` as the entry). Change any of it with Vite's
own `mergeConfig`:

```ts
export default mergeConfig(
  defineElementsConfig({ prefix: "acme", elements: "src/elements/*.vue" }),
  { build: { outDir: "release" } },
);
```

Pass `root` only when the config is not loaded from the project root.

## Deferring the mount

Mountly's own controls live under `data-mountly-*`, so a component is free to
have its own `trigger` prop. A prop named `mount` still works as an attribute,
but not as a property — `element.mount()` is the element's own method and is
never shadowed. The build warns when a component has one.

```html
<acme-payments-summary data-mountly-trigger="viewport:200px"></acme-payments-summary>
```

`data-mountly-trigger="never"` holds the download until `element.mount()`.

## The component still imports directly

```tsx
import PaymentsSummary from "@acme/payments/PaymentsSummary";
```

That registers no custom elements and pulls in none of the embed machinery. Use
the import inside your own app and the script tag for everyone else.

## Reference

- Guide: <https://mountly.dev/concepts/script-embeds/>
- Examples: `docs/examples/react-embed`, `docs/examples/mixed-embed`
