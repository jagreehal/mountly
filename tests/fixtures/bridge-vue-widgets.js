// Bridge package: imports the pure Vue UI library, composes its
// primitives into product surfaces, wraps each with mountly-vue's
// createWidget. The library file has zero mountly references; this file
// is the only place mountly meets Vue.
import { h, defineComponent } from "https://esm.sh/vue@3.5.13";
import { createWidget } from "/packages/adapters/mountly-vue/dist/index.js";
// In a real bridge: `import { Button, Card, Stack } from "@my-org/ui-vue"`.
import { Button, Card, Stack } from "/tests/fixtures/bridge-pure-vue-lib.js";

const HeroSurface = defineComponent({
  props: { headline: String, ctaLabel: String, ctaHref: String },
  setup(props) {
    return () =>
      h(Card, { tone: "primary", title: "Hero" }, () =>
        h(Stack, { gap: 8 }, () => [
          h("p", { class: "ui-muted" }, props.headline),
          h(
            "a",
            { href: props.ctaHref, class: "ui-btn ui-btn-primary", "data-testid": "hero-cta" },
            props.ctaLabel,
          ),
        ]),
      );
  },
});

const PricingSurface = defineComponent({
  props: { plan: String, price: Number, blurb: String },
  setup(props) {
    return () =>
      h(Card, { tone: "primary", title: "Pricing" }, () =>
        h(Stack, { gap: 8 }, () => [
          h("p", { class: "ui-muted" }, props.blurb),
          h("p", { class: "ui-amount" }, `$${props.price}/mo`),
          h(Button, { variant: "primary" }, () => `Subscribe to ${props.plan}`),
        ]),
      );
  },
});

const EmailCaptureSurface = defineComponent({
  props: { buttonLabel: { type: String, default: "Subscribe" } },
  setup(props) {
    return () =>
      h(Card, { tone: "neutral", title: "Newsletter" }, () =>
        h(Stack, { gap: 8 }, () => [
          h("input", {
            type: "email",
            placeholder: "you@example.com",
            class: "ui-input",
          }),
          h(Button, { variant: "default" }, () => props.buttonLabel),
        ]),
      );
  },
});

const lightDom = { shadow: false };
export const hero = createWidget(HeroSurface, lightDom);
export const pricing = createWidget(PricingSurface, lightDom);
export const newsletter = createWidget(EmailCaptureSurface, lightDom);

export const __bridge_id = "vue-widgets-bridge@1.0.0";
