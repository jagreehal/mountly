# Marketing-site example

A plain-HTML marketing page consuming a widget that lives in another package in this monorepo. Shows the full "dev ships widget → marketing drops it on a page" flow.

## Run

From the repo root:

```bash
pnpm build
```

Then from this folder:

```bash
pnpm dev
```

Open <http://localhost:5176/examples/marketing-site/>.

## What you're looking at

The page has two widgets:

1. **Hero "Join the newsletter"** — imperative `signupCard.attach(...)`, hover preloads, click mounts. Includes an `onSubmit` callback that posts to the backend.
2. **Inline "Try it inline"** — declarative `<mountly-feature>`, viewport-triggered. Mounts when you scroll it into view. Also demonstrates retheming via `--primary`/`--ring` overrides on the mount element.

Open DevTools Network tab before interacting. You'll see:

- On page load: only `mountly/dist/index.js` (~9 KB gz) and one React copy from `esm.sh`. Exact sizes vary by release; use DevTools to confirm.
- On viewport entry for the inline embed: `signup-card/dist/peer.js` (~5 KB gz).
- On hover of the subscribe button: the same `peer.js` (already cached — no new request).

The two widget instances share one React copy because both import-map entries point at `peer.js` and React is resolved through a shared entry.

## The dev story

1. Developer has their own app using component primitives (e.g. shadcn-style). They want marketing to be able to drop the signup form anywhere without touching React.
2. They scaffold a widget with `npx mountly init signup-card` (or `pnpm dlx mountly init signup-card`), then implement `src/Component.tsx` in that package.
3. They paste or merge their UI into `examples/signup-card/src/Component.tsx` (or their own package path).
4. They run `pnpm build`. `dist/index.js` and `dist/peer.js` are ready to publish.
5. Marketing drops this HTML snippet anywhere:

   ```html
   <mountly-feature module-id="signup-card" trigger="viewport">
     <div data-mountly-mount></div>
   </mountly-feature>

   <script type="importmap">
     {
       "imports": {
         "react": "https://esm.sh/react@18.3.1",
         "react/jsx-runtime": "https://esm.sh/react@18.3.1/jsx-runtime",
         "react-dom/client": "https://esm.sh/react-dom@18.3.1/client",
         "mountly": "https://cdn.jsdelivr.net/npm/mountly@1/dist/index.js",
         "mountly-react": "https://cdn.jsdelivr.net/npm/mountly-react@1/dist/index.js",
         "signup-card": "https://cdn.jsdelivr.net/npm/signup-card@1/dist/peer.js"
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

   In this monorepo during local dev, the import map in `index.html` points `mountly` and `signup-card` at `/packages/mountly/dist/index.js` and `/examples/signup-card/dist/peer.js` instead.

That's it. Zero framework on the host page. Full React in the widget's shadow root.
