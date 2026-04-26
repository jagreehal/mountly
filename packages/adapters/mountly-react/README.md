# mountly-react

React adapter for [mountly](https://npmjs.com/package/mountly) widgets.

Wraps a React component as a framework-agnostic `WidgetModule` with idempotent `mount` / `unmount`, shadow-DOM encapsulation, and a light-DOM fallback for elements that reject shadow roots.

## Install

```bash
pnpm add mountly-react
pnpm add react react-dom
```

`react` and `react-dom` are peer dependencies — install them in your host project. The adapter externalises them so multiple widgets share a single React copy.

## Use

```ts
import { createWidget } from "mountly-react";
import MyComponent from "./MyComponent";
import styles from "./styles.generated.css";

const widget = createWidget(MyComponent, { styles });

// Returned object implements mountly's WidgetModule contract:
widget.mount(container, { /* props */ });
widget.unmount(container);
```

`mount()` is idempotent — calling it again with new props re-renders cleanly.

## Companion Packages

- [`mountly`](https://npmjs.com/package/mountly) — core runtime, lifecycle, and CLI
- [`mountly-tailwind`](https://npmjs.com/package/mountly-tailwind) — Tailwind v4 design preset

## License

MIT
