---
"mountly": minor
---

Add `mountly/iframe` — the same on-intent lifecycle with a browser-enforced isolation boundary.

Every other distribution shares one JavaScript context, which is what makes them fast and what limits their isolation: shadow DOM scopes styles, but a vertical can still mutate `window`, patch a prototype or register a global listener and break another team at runtime. `iframeFeature({ moduleId, src, title })` runs the widget in its own document instead, with the same triggers, lifecycle and `<mountly-feature>` element.

```ts
import { iframeFeature } from "mountly/iframe";

const billing = iframeFeature({
  moduleId: "billing",
  src: "https://billing.acme.com/widget",
  title: "Billing breakdown",
  sandbox: "allow-scripts",
});
```

The framed page calls `mountAsFrame(widget)` from `mountly/iframe/child` with the widget it already ships, so one `createWidget(...)` output runs unchanged in light DOM, in a shadow root and in a frame — **the host picks the isolation level, not the widget author**, and moving a vertical behind a frame is a config change rather than a rewrite.

- `iframeModule(src, options)` is the underlying `FeatureModule`, for `createOnDemandFeature({ loadModule })` when you need `loadData` or a custom render step.
- Props cross on a handshake rather than on load, because an unmounted frame measures zero and a zero size is never reported.
- The frame document is prefetched at preload time — hover, viewport, idle — which recovers the network half of the iframe's cost. The runtime half, a framework bootstrap per widget, is the trade you are making. Reach for `moduleUrl` first.
- `resize-iframe` (0.2.0+) is an **optional** peer dependency, used for content sizing and the message channel. `mountly/iframe/child` has no dependencies at all.
