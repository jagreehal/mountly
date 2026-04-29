// `@my-org/widgets-mountly` — the BRIDGE. Tiny package that:
//   1. Imports the framework-agnostic UI library.
//   2. Composes its primitives into product surfaces (Hero, Pricing, etc.).
//   3. Wraps each surface with createWidget so mountly can mount them.
//
// Light DOM (`shadow: false`) is the realistic mode for a bridge over a
// shadcn/Tailwind-style library: the host's global stylesheet reaches every
// widget, and Radix portal-using primitives (Dialog, Popover, etc.) work
// without per-component reconfiguration.
import { createElement as h } from "https://esm.sh/react@19.2.5";
import { createWidget } from "/packages/adapters/mountly-react/dist/index.js";
// In a real bridge package this is `import { Button, Card, Stack } from "@my-org/ui"`.
import { Button, Card, Stack } from "/tests/fixtures/bridge-pure-ui-lib.js";

// Compose primitives into concrete widgets. These compositions live in
// the bridge package, never in the UI library — they're shaped for the
// mountly host context (CTAs, marketing surfaces) rather than for use
// inside a larger React app.
function HeroSurface({ headline, ctaLabel, ctaHref }) {
  return h(
    Card,
    { tone: "primary", title: "Hero" },
    h(Stack, { gap: 8 },
      h("p", { className: "ui-muted" }, headline),
      // shadcn `asChild` pattern from the library — the <a> renders with
      // the Button's classes & events. Proves the Radix Slot dependency
      // survives the bridge.
      h(Button, { variant: "primary", asChild: true, "data-testid": "hero-cta" },
        h("a", { href: ctaHref }, ctaLabel),
      ),
    ),
  );
}

function PricingSurface({ plan, price, blurb }) {
  return h(
    Card,
    { tone: "primary", title: "Pricing" },
    h(Stack, { gap: 8 },
      h("p", { className: "ui-muted" }, blurb),
      h("p", { className: "ui-amount" }, `$${price}/mo`),
      h(Button, { variant: "primary" }, `Subscribe to ${plan}`),
    ),
  );
}

function EmailCaptureSurface({ buttonLabel = "Subscribe" }) {
  return h(
    Card,
    { tone: "neutral", title: "Newsletter" },
    h(Stack, { gap: 8 },
      h("input", {
        type: "email",
        placeholder: "you@example.com",
        className: "ui-input",
      }),
      h(Button, { variant: "default" }, buttonLabel),
    ),
  );
}

const lightDom = { shadow: false };
export const hero = createWidget(HeroSurface, lightDom);
export const pricing = createWidget(PricingSurface, lightDom);
export const newsletter = createWidget(EmailCaptureSurface, lightDom);

// Marker so the test can confirm this is the bridge module.
export const __bridge_id = "widgets-bridge@1.0.0";
