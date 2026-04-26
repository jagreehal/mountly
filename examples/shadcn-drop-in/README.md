# shadcn drop-in example

This example shows how a React widget built with shadcn-style primitives can be dropped into a plain HTML page with no host framework.

## Run

From the repo root (once):

```bash
pnpm build
```

Then from this folder:

```bash
pnpm dev
```

Open <http://localhost:5177/examples/shadcn-drop-in/>.

## What this proves

- The host page is static HTML + import map only (no React app on the host).
- The widget comes from `examples/signup-card/dist/peer.js` and mounts on intent (`hover` preload, `click` activate).
- The same widget is used via both imperative `attach()` and declarative `<mountly-feature>`.
- Host theming flows through CSS variables while the widget keeps its own internal styles.

## Integration snippet

```html
<script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@18.3.1",
      "react/jsx-runtime": "https://esm.sh/react@18.3.1/jsx-runtime",
      "react-dom/client": "https://esm.sh/react-dom@18.3.1/client",
      "mountly": "/packages/mountly/dist/index.js",
      "mountly-react": "/packages/adapters/mountly-react/dist/index.js",
      "signup-card": "/examples/signup-card/dist/peer.js"
    }
  }
</script>

<script type="module">
  import { defineMountlyFeature, registerCustomElement } from "mountly";
  import { signupCard } from "signup-card";
  registerCustomElement("signup-card", () => signupCard);
  defineMountlyFeature();
</script>
```
