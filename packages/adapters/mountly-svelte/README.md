# mountly-svelte

Svelte adapter for [mountly](https://npmjs.com/package/mountly) widgets.

Wraps a Svelte component constructor as a framework-agnostic `WidgetModule` with idempotent `mount` / `unmount`, shadow-DOM encapsulation, and a light-DOM fallback for elements that reject shadow roots.

## Install

```bash
pnpm add mountly-svelte
pnpm add svelte
```

`svelte` is a peer dependency, so install it in the host project.

## Use

```ts
import { createWidget } from "mountly-svelte";
import MyComponent from "./MyComponent.svelte";
import styles from "./styles.generated.css";

const widget = createWidget(MyComponent, { styles });

widget.mount(container, { /* props */ });
widget.unmount(container);
```

`mount()` is idempotent, so calling it again with new props re-renders cleanly.

## Companion Packages

- [`mountly`](https://npmjs.com/package/mountly) — core runtime, lifecycle, and CLI
- [`mountly-react`](https://npmjs.com/package/mountly-react) — React adapter
- [`mountly-vue`](https://npmjs.com/package/mountly-vue) — Vue adapter
- [`mountly-tailwind`](https://npmjs.com/package/mountly-tailwind) — Tailwind v4 design preset

## License

MIT
