---
"mountly": minor
"mountly-vite-plugin": minor
"mountly-react": minor
---

Script embeds gain three features.

- **Function props from the host.** `on*` props still dispatch DOM events. Any other function-typed prop (`getToken: () => Promise<string>`, `format(value: number): string`) is a property the host assigns, so the component receives the host's function and its return value. These props never appear as attributes, which keeps tokens out of the page's markup.
- **Web Workers across origins.** `defineElementsConfig` routes each `new Worker(…)` through a same-origin `blob:` shim that imports the real script, so a distribution served from a CDN can start its workers on the consumer's page. Same-origin workers run as written. Workers build as ES modules and keep the provider's `import.meta.url`.
- **`usePortalContainer()` in `mountly-react`.** Under `shadow: true` it returns a node inside the widget's shadow root, so dialogs, popovers and menus keep the adopted stylesheet. It returns `null` in light DOM, which Radix reads as `document.body`: `<PopoverPrimitive.Portal container={usePortalContainer()}>`.
