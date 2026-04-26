# signup-card

mountly widget scaffold. Paste your React component into `src/Component.tsx`, run `pnpm build`, drop on any page.

## Build

```bash
pnpm install
pnpm build
```

Outputs `dist/index.js` (React inlined) and `dist/peer.js` (React external).

## Embed

Use an [import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap) so the browser can resolve bare specifiers. Map `mountly` to the runtime build and `signup-card` to this package’s `dist/peer.js` (with `react` / `react-dom/client` mapped too) when using the peer build.

```html
<script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@18.3.1",
      "react-dom/client": "https://esm.sh/react-dom@18.3.1/client",
      "mountly": "/packages/mountly/dist/index.js",
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

<mountly-feature module-id="signup-card" trigger="viewport">
  <button type="button">Open</button>
  <div data-mountly-mount></div>
</mountly-feature>
```

Paths above assume the HTTP server’s document root is the **repository root** (same as `examples/plain-html` and `examples/marketing-site`). Published sites replace those URLs with your CDN or asset host.

## Theming

Host pages retheme via CSS variables on the mount element:

```html
<div data-mountly-mount style="--accent: oklch(0.55 0.20 285);"></div>
```

See `src/styles.css` for available tokens.
