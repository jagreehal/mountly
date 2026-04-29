// Stand-in for `@org/widgets` — a workspace package that depends on
// `@org/ui` and exports several widgets through one bundle entry. In a real
// project this file is the package's `src/index.ts`, built by Vite into
// `dist/index.js` + `dist/index.css`.
import { createElement as h, useState } from "https://esm.sh/react@19.2.5";
import { createWidget } from "/packages/adapters/mountly-react/dist/index.js";
// In a workspace this is `import { Button, Card, Chip } from "@org/ui"`.
import { Button, Card, Chip, __ui_lib_marker } from "/tests/fixtures/monorepo-ui-lib.js";

function CounterWidget({ start = 0 }) {
  const [n, setN] = useState(start);
  return h(
    Card,
    { tone: "primary", title: "Counter" },
    h(Chip, null, "live"),
    h("p", { className: "ui-num", "data-testid": "counter-value" }, n),
    h(
      "div",
      { className: "ui-row" },
      h(Button, { variant: "default", onClick: () => setN((x) => x - 1) }, "−"),
      h(Button, { variant: "primary", onClick: () => setN((x) => x + 1) }, "+"),
    ),
  );
}

function StatusWidget({ message = "OK" }) {
  return h(
    Card,
    { tone: "success", title: "Status" },
    h(Chip, null, "healthy"),
    h("p", { className: "ui-msg" }, message),
  );
}

function PricingWidget({ plan = "Pro", price = 29 }) {
  return h(
    Card,
    { tone: "primary", title: "Pricing" },
    h(Chip, null, plan),
    h("p", { className: "ui-amount" }, `$${price}/mo`),
    h(Button, { variant: "primary" }, "Subscribe"),
  );
}

// Each export is a fully-formed WidgetModule. The bundle's CSS file is
// fetched once and adopted into every widget's shadow root.
export const counter = createWidget(CounterWidget);
export const status = createWidget(StatusWidget);
export const pricing = createWidget(PricingWidget);

// Re-exported so the test can confirm the workspace import resolved.
export { __ui_lib_marker };
