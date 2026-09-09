# An ordinary React component, published as a custom element

`src/elements/PaymentsSummary.tsx` is an ordinary React component with no
Mountly imports. `vite.config.ts` points the build at `src/elements/*.tsx` and
gives it the `acme` namespace — nothing else is configured.

From the repository root:

```sh
pnpm install
pnpm --filter mountly --filter mountly-react --filter mountly-vite-plugin build
pnpm --filter react-embed-example build
pnpm exec serve . -l 5197
```

Open `http://localhost:5197/docs/examples/react-embed/host.html`. The page uses
one script tag and `<acme-payments-summary balance="1250" currency="GBP">`.

What the build derived from the component's props type:

- `balance="1250"` arrives as the number `1250`, `currency="GBP"` as a string.
- `compact` is a boolean attribute; `lineItems` takes an array by property or a
  `line-items` JSON attribute.
- `onViewDetails` dispatches a bubbling `view-details` DOM event.
- `dist/embed.d.ts` types every tag; `dist/custom-elements.json` gives editors
  HTML autocomplete.

Open **View details**, then press **Add 250 to balance** repeatedly. Each press
assigns `summary.balance`, which re-renders without remounting, so the open
panel stays open. `<acme-payment-methods>` is never downloaded until one appears
on the page.

Styling comes from Tailwind, added to the same build with `mergeConfig` and
`@tailwindcss/vite`. `src/styles.css` imports the theme and utilities but not
Preflight: this distribution renders in light DOM, so a global reset would land
in the consumer's document and restyle their page. The container keeps a CSS
module so host tokens like `--payments-color` can still reach in.

Publish the whole `dist/` directory to a versioned HTTPS location. Consumers
need only its `embed.js` URL; Mountly and React are bundled. For cross-origin
hosting, enable CORS on the assets and allow the origin in the host's script and
style policies. The executable cross-origin check is `tests/embed-build.spec.ts`.
