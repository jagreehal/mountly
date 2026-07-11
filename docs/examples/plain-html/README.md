# Plain HTML example

Zero build step on the host. One HTML file, one import map, script tags.

## Run

From the repo root (once, to build the packages):

```bash
pnpm build
```

Then from this folder:

```bash
pnpm dev
```

Two pages to open:

- <http://localhost:5175/docs/examples/plain-html/>: self-contained widgets (each ships its own React).
- <http://localhost:5175/docs/examples/plain-html/shared-react.html>: three widgets sharing one React via import map.

Also try the minimal host: <http://localhost:5175/docs/examples/quickstart/host.html> (same server; serves the repo root).

## Two distribution patterns

### Pattern A — self-contained (`index.html`)

Each widget bundle inlines React. One widget on one page, zero host configuration:

```html
<script type="importmap">
  {
    "imports": {
      "mountly": "/packages/mountly/dist/index.js",
      "mountly/attach": "/packages/mountly/dist/attach.js",
      "mountly/elements": "/packages/mountly/dist/elements.js",
      "mountly/shadow": "/packages/mountly/dist/shadow.js",
      "mountly/assets": "/packages/mountly/dist/assets.js",
      "mountly/adapter": "/packages/mountly/dist/adapter.js",
      "payment-breakdown":../docs/examples/payment-breakdown/dist/index.js"
    }
  }
</script>
```

**Cost:** ~148 KB gz per widget. **Use when:** one widget per page, or the host has no React.

### Pattern B — shared React (`shared-react.html`)

Widgets use their `peer` entry (external React). Host supplies React once via the import map:

```html
<script type="importmap">
  {
    "imports": {
      "react": "https://esm.sh/react@18.3.1",
      "react/jsx-runtime": "https://esm.sh/react@18.3.1/jsx-runtime",
      "react-dom/client": "https://esm.sh/react-dom@18.3.1/client",
      "mountly": "/packages/mountly/dist/index.js",
      "mountly/attach": "/packages/mountly/dist/attach.js",
      "mountly/elements": "/packages/mountly/dist/elements.js",
      "mountly/shadow": "/packages/mountly/dist/shadow.js",
      "mountly/assets": "/packages/mountly/dist/assets.js",
      "mountly/adapter": "/packages/mountly/dist/adapter.js",
      "mountly-react": "/packages/adapters/mountly-react/dist/index.js",
      "payment-breakdown":../docs/examples/payment-breakdown/dist/peer.js",
      "image-lightbox":../docs/examples/image-lightbox/dist/peer.js"
    }
  }
</script>
```

**Cost:** ~45 KB gz once (React) + ~5 KB gz per widget. **Use when:** 2+ widgets on a page, or the host already has React.

No changes to widget source. Each widget ships both builds, and the import map chooses which one the browser loads.

## The "what if my React widget is composed of ten smaller ones?" question

Widget authors write `src/index.ts` importing whatever sub-components, hooks, and contexts they want. `tsup` bundles the entire reachable graph into a single ESM file: sub-components, utilities, CSS, everything. You get one `index.js` and one `peer.js` per widget regardless of how many files went in.

The host sees one module per widget, while the widget author writes normal React composition. The bundler stitches the two together.

## CDN distribution

If you publish the widget to a CDN like jsDelivr, the import map entries become CDN URLs (replace versions and package names with yours):

```html
<script type="importmap">
  {
    "imports": {
      "mountly": "https://cdn.jsdelivr.net/npm/mountly@1/dist/index.js",
      "mountly/attach": "https://cdn.jsdelivr.net/npm/mountly@1/dist/attach.js",
      "mountly/elements": "https://cdn.jsdelivr.net/npm/mountly@1/dist/elements.js",
      "mountly/shadow": "https://cdn.jsdelivr.net/npm/mountly@1/dist/shadow.js",
      "mountly/assets": "https://cdn.jsdelivr.net/npm/mountly@1/dist/assets.js",
      "mountly/adapter": "https://cdn.jsdelivr.net/npm/mountly@1/dist/adapter.js",
      "mountly-react": "https://cdn.jsdelivr.net/npm/mountly-react@1/dist/index.js",
      "payment-breakdown": "https://cdn.jsdelivr.net/npm/payment-breakdown@1/dist/peer.js",
      "react": "https://esm.sh/react@18.3.1",
      "react/jsx-runtime": "https://esm.sh/react@18.3.1/jsx-runtime",
      "react-dom/client": "https://esm.sh/react-dom@18.3.1/client"
    }
  }
</script>
```
