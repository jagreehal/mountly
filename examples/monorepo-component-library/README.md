# monorepo-component-library

A realistic mountly setup for a monorepo: a shared UI library package, a
widgets package that consumes it, and a host page that loads the resulting
bundle. Demonstrates third-party npm imports flowing through cleanly.

## What this shows

The user's situation:

> "I have an internal component library with shadcn/Radix/etc. I want to
> build several widgets that share it, then mount those widgets on
> different pages with mountly."

This is the recommended structure.

## Package layout

```
my-org/
├── packages/
│   ├── ui-lib/                 # shared component library, no mountly
│   │   ├── src/
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Chip.tsx
│   │   │   └── index.ts        # re-exports
│   │   ├── package.json        # name: "@my-org/ui"
│   │   └── vite.config.ts
│   │
│   └── widgets/                # mountly widgets, consumes @my-org/ui
│       ├── src/
│       │   ├── Counter.tsx
│       │   ├── Status.tsx
│       │   ├── Pricing.tsx
│       │   └── index.ts        # createWidget exports
│       ├── package.json        # name: "@my-org/widgets"
│       └── vite.config.ts
│
└── apps/
    └── docs-site/              # consumes the built widgets via mountly
        └── index.html
```

`packages/ui-lib` is a normal component library. It knows nothing about
mountly. It can pull in shadcn primitives, Radix, Tailwind, lucide-react,
clsx, anything.

`packages/widgets` depends on `@my-org/ui` (workspace-linked through pnpm
or yarn). Each widget imports primitives from the library and is wrapped
with `createWidget` from `mountly-react`. The package's entry exports
every widget, ready for `createWidgetBundle`.

## packages/ui-lib

```json title="package.json"
{
  "name": "@my-org/ui",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js"
  },
  "peerDependencies": {
    "react": "^19"
  },
  "dependencies": {
    "clsx": "^2",
    "@radix-ui/react-slot": "^1"
  },
  "scripts": {
    "build": "vite build"
  }
}
```

```ts title="vite.config.ts"
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    lib: { entry: "src/index.ts", formats: ["es"], fileName: "index" },
    rollupOptions: {
      // Externalise the framework runtime so consumers share one React.
      external: ["react", "react/jsx-runtime"],
    },
  },
});
```

```tsx title="src/Button.tsx"
import clsx from "clsx";

export const Button = ({ variant = "default", className, ...rest }) => (
  <button
    className={clsx("ui-btn", `ui-btn-${variant}`, className)}
    {...rest}
  />
);
```

The library bundles `clsx` (small npm dep) inline and externalises React.
The Vite build emits `dist/index.js` and, if any component imports CSS,
`dist/index.css`. In a Tailwind project, you'd run the Tailwind CLI as a
build step so the CSS includes only the classes you used.

## packages/widgets

```json title="package.json"
{
  "name": "@my-org/widgets",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "exports": { ".": "./dist/index.js" },
  "peerDependencies": {
    "react": "^19",
    "react-dom": "^19"
  },
  "dependencies": {
    "@my-org/ui": "workspace:*",
    "mountly": "workspace:*",
    "mountly-react": "workspace:*"
  },
  "scripts": {
    "build": "vite build"
  }
}
```

```ts title="vite.config.ts"
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    lib: { entry: "src/index.ts", formats: ["es"], fileName: "index" },
    rollupOptions: {
      // Externalise React + ReactDOM. Bundle @my-org/ui inline so we get
      // exactly one copy of the design system in the widgets bundle.
      external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
    },
  },
});
```

```tsx title="src/index.ts"
import { createWidget } from "mountly-react";
import Counter from "./Counter";
import Status from "./Status";
import Pricing from "./Pricing";

export const counter = createWidget(Counter);
export const status = createWidget(Status);
export const pricing = createWidget(Pricing);
```

```tsx title="src/Counter.tsx"
import { useState } from "react";
import { Button, Card, Chip } from "@my-org/ui";

export default function Counter({ start = 0 }: { start?: number }) {
  const [n, setN] = useState(start);
  return (
    <Card title="Counter">
      <Chip>live</Chip>
      <p>{n}</p>
      <Button variant="default" onClick={() => setN((x) => x - 1)}>−</Button>
      <Button variant="primary" onClick={() => setN((x) => x + 1)}>+</Button>
    </Card>
  );
}
```

After `pnpm -r build`, `packages/widgets/dist/index.js` contains:

- All three widget components
- The `@my-org/ui` library code (Button, Card, Chip)
- `clsx` (transitively through `@my-org/ui`)
- mountly-react's `createWidget`

External: `react`, `react-dom`, `react/jsx-runtime`. Those are provided by
the host's import map.

## apps/docs-site

```html title="index.html"
<script type="importmap">
{
  "imports": {
    "react":            "https://esm.sh/react@19.2.5",
    "react/jsx-runtime":"https://esm.sh/react@19.2.5/jsx-runtime",
    "react-dom/client": "https://esm.sh/react-dom@19.2.5/client?deps=react@19.2.5",
    "react-dom":        "https://esm.sh/react-dom@19.2.5?deps=react@19.2.5",
    "mountly":          "/node_modules/mountly/dist/index.js"
  }
}
</script>

<button id="t-counter">Counter</button>
<button id="t-status">Status</button>
<button id="t-pricing">Pricing</button>
<div id="m-counter"></div>
<div id="m-status"></div>
<div id="m-pricing"></div>

<script type="module">
  import { createWidgetBundle } from "mountly";

  // Point at the widgets package's built bundle.
  const widgets = createWidgetBundle({
    moduleUrl: "/node_modules/@my-org/widgets/dist/index.js",
  });

  widgets.feature({ moduleId: "counter", export: "counter" })
    .attach({ trigger: t1, mountContainer: m1, activateOn: "click", props: { start: 5 } });
  widgets.feature({ moduleId: "status", export: "status" })
    .attach({ trigger: t2, mountContainer: m2, activateOn: "click", props: { message: "OK" } });
  widgets.feature({ moduleId: "pricing", export: "pricing" })
    .attach({ trigger: t3, mountContainer: m3, activateOn: "click", props: { plan: "Pro", price: 29 } });
</script>
```

## What's deduplicated

- **One `@my-org/ui` copy** lives in the widgets bundle. Every widget
  inside the bundle imports the same `Button`, `Card`, `Chip`. No
  per-widget duplication.
- **One `clsx` copy**, transitively bundled through `@my-org/ui`.
- **One React** runtime, served once via the host import map and shared
  by every widget.
- **One JS fetch** for the widgets bundle, regardless of how many
  features are registered against it.
- **One CSS fetch** for the widgets bundle's companion stylesheet.
- **One `CSSStyleSheet` instance** adopted into every shadow root that
  uses the bundle.

## Choosing shadow vs light DOM for the bundle

If `@my-org/ui` is **shadcn-flavoured** (Tailwind tokens on `:root`, Radix
portals targeting `document.body`), every widget should use light DOM:

```ts
const lightDom = { shadow: false };
export const counter = createWidget(Counter, lightDom);
export const status = createWidget(Status, lightDom);
export const pricing = createWidget(Pricing, lightDom);
```

Then the host's `<head>` ships the global Tailwind/tokens stylesheet and
everything reaches in.

If `@my-org/ui` is self-contained (Svelte/Vue scoped styles, plain CSS
that doesn't rely on `:root` tokens, no portals), shadow DOM gives you
true isolation:

```ts
export const counter = createWidget(Counter); // shadow:true is default
```

See [Multi-widget bundles](https://jagreehal.github.io/mountly/concepts/multi-widget/)
and the [Styling concept](https://jagreehal.github.io/mountly/concepts/styling/)
for the full decision tree.

## See also

- `tests/fixtures/monorepo-host.html` and
  `tests/monorepo-component-library.spec.ts`: runnable proof of the
  workflow with a real npm dependency (`clsx`) and three widgets that
  share a UI library.
- `examples/multi-widget-bundle/`: the simpler "all widgets in one
  bundle, no separate library package" pattern.
