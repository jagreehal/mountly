# Pokemon Kitchen Sink Demo

This example shows mountly features end-to-end using Pokemon data from PokeAPI.

## Run

```bash
pnpm --filter pokemon-kitchen-sink dev
```

Open <http://localhost:5178/>. The Vite dev server uses port 5178, distinct from `examples/plain-html` (5175), so you can run both side-by-side.

## What each section demonstrates

- **Global controls**
  - Load list data from PokeAPI.
  - Programmatic immediate render (no interaction trigger).
  - Manual unmount of all active mounts.
- **Hover + Click attach()**
  - Hover preloads widget code/data.
  - Click mounts details and toggles unmount on second click.
- **Viewport preload**
  - Preload triggered by visibility in viewport.
  - Click activates mount once preloaded.
- **Custom element**
  - `<mountly-feature>` usage on a non-React host.
  - `data-url` context path feeds detail fetch.
- **Analytics + Devtools**
  - Timing events streamed in-page.
  - Floating mountly devtools panel for feature state/caches.

## API usage in this demo

- List endpoint: `https://pokeapi.co/api/v2/pokemon?limit=18&offset=0`
- Detail endpoint: `https://pokeapi.co/api/v2/pokemon/{name}`

Reference: [PokeAPI v2](https://pokeapi.co/api/v2/)

## Tailwind in custom widgets

Yes, widgets can use Tailwind. Recommended pattern:

1. Build Tailwind CSS inside the widget package.
2. Import that generated CSS from the widget module entry.
3. Keep host-page theming through CSS variables.

Example commands in a widget package:

```bash
pnpm add -D tailwindcss @tailwindcss/cli
pnpm exec tailwindcss -i ./src/styles.css -o ./src/styles.generated.css --minify
```

Then import generated styles in the widget module:

```ts
import "./styles.generated.css";
```

In this demo, the **Tailwind-style widget in custom element** section shows this pattern end-to-end:

- `module-id="pokemon-tailwind-ce"` mounts a separately styled React widget
- host sets `--pk-accent`, `--pk-surface`, `--pk-text` on the custom element
- internal widget classes remain encapsulated from host styles
