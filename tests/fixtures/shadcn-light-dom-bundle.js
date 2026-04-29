// Simulates a built React bundle modelled on shadcn's authoring style:
// each widget is a small React component that composes shared primitives
// (Button, Card) styled by Tailwind-flavoured classes. The bundle ships
// once; the host page provides Tailwind globally via <link>.
import { createElement as h } from "https://esm.sh/react@19.2.5";
import { createWidget } from "/packages/adapters/mountly-react/dist/index.js";

// Shared primitives — copy-paste shadcn flavour (no actual Tailwind needed
// for the test; the global stylesheet defines these utility classes).
const Button = ({ variant = "default", children, ...rest }) =>
  h("button", { className: `btn btn-${variant}`, ...rest }, children);

const Card = ({ title, children }) =>
  h(
    "section",
    { className: "card" },
    h("h3", { className: "card-title" }, title),
    h("div", { className: "card-body" }, children),
  );

// Three widgets all reach for the same primitives + same global Tailwind
// so the user sees consistent design without per-widget CSS.
const Hero = ({ headline, cta }) =>
  h(
    Card,
    { title: "Hero" },
    h("p", { className: "muted" }, headline),
    h(Button, { variant: "primary", "data-testid": "hero-cta" }, cta),
  );

const Pricing = ({ plan, price }) =>
  h(
    Card,
    { title: "Pricing" },
    h("p", { className: "muted" }, `Plan: ${plan}`),
    h("p", { className: "amount" }, `$${price}/mo`),
    h(Button, { variant: "primary" }, "Subscribe"),
  );

const Newsletter = ({ buttonLabel }) =>
  h(
    Card,
    { title: "Newsletter" },
    h(
      "form",
      { className: "form" },
      h("input", { type: "email", placeholder: "you@example.com" }),
      h(Button, { variant: "default" }, buttonLabel ?? "Sign up"),
    ),
  );

// Light-DOM widgets: shadow:false so the host's global Tailwind reaches the
// markup. styleMode is irrelevant since we don't pass styles — the host
// already loads the stylesheet. assetOptions:none would be used at the host
// `createWidgetBundle` call site; here at the widget level we just disable
// shadow.
const lightDom = { shadow: false };
export const hero = createWidget(Hero, lightDom);
export const pricing = createWidget(Pricing, lightDom);
export const newsletter = createWidget(Newsletter, lightDom);
