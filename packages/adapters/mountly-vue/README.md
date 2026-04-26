# mountly-vue

Vue adapter for [mountly](https://npmjs.com/package/mountly) widgets.

Wraps a Vue component as a framework-agnostic `WidgetModule` with idempotent `mount` / `unmount`, shadow-DOM encapsulation, and a light-DOM fallback for elements that reject shadow roots.

## Install

```bash
pnpm add mountly-vue
pnpm add vue
```

`vue` is a peer dependency, so install it in the host project.

## Use

```ts
import { createWidget } from "mountly-vue";
import MyComponent from "./MyComponent.vue";
import styles from "./styles.generated.css";

const widget = createWidget(MyComponent, { styles });

widget.mount(container, { /* props */ });
widget.unmount(container);
```

`mount()` is idempotent, so calling it again with new props re-renders cleanly.

## Companion Packages

- [`mountly`](https://npmjs.com/package/mountly) — core runtime, lifecycle, and CLI
- [`mountly-react`](https://npmjs.com/package/mountly-react) — React adapter
- [`mountly-tailwind`](https://npmjs.com/package/mountly-tailwind) — Tailwind v4 design preset

## License

MIT
