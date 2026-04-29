# multi-widget-bundle

A small dashboard with three widgets that ship in one bundle: `counter`,
`clock`, `status`. Demonstrates the `createWidgetBundle` API.

## Why bundle widgets together

When several widgets share code (a design system, a `cn()` helper, a few
utility components), shipping them as separate bundles forces every host
that uses two or more of them to redownload that shared code. Bundling
collapses the duplication.

## Authoring

```ts
// src/widget.ts
import { createWidget } from "mountly-svelte";
import Counter from "./Counter.svelte";
import Clock from "./Clock.svelte";
import Status from "./Status.svelte";

export const counter = createWidget(Counter);
export const clock = createWidget(Clock);
export const status = createWidget(Status);
```

Vite's library mode emits one `dist/index.js` containing all three widgets
plus any shared utility code, and one `dist/index.css` containing every
component's styles.

## Hosting

```ts
import { createWidgetBundle } from "mountly";

const dashboard = createWidgetBundle({
  moduleUrl: "/widgets/dashboard/dist/index.js",
});

const counter = dashboard.feature({ moduleId: "counter", export: "counter" });
const clock   = dashboard.feature({ moduleId: "clock",   export: "clock"   });
const status  = dashboard.feature({ moduleId: "status",  export: "status"  });

counter.attach({ trigger: btn1, activateOn: "click" });
clock.attach({ trigger: btn2, activateOn: "click" });
status.attach({ trigger: btn3, activateOn: "click" });
```

The bundle JS and CSS each fetch **once** for the page. All three features
adopt the same `CSSStyleSheet` instance into their shadow roots (browser-
level constructed-stylesheet sharing).

## When to bundle vs ship separately

Bundle when widgets:

- Share components or utility code.
- Always or usually appear together.
- Are part of the same feature surface (a dashboard, a checkout flow).

Ship separately when widgets:

- Are independent (a signup card and a cookie banner have nothing in common).
- Live on different pages.
- Have very different bundle sizes and you want to load only what's used.

## See also

- `tests/fixtures/multi-widget-svelte.html` — the test fixture.
- `tests/multi-widget-bundles.spec.ts` — the asserts (one fetch, shared sheet, etc.).
- `examples/shadcn-light-dom` (sibling) — same pattern but light-DOM with global Tailwind.
