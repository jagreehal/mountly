// Bridge package: imports the pure Svelte UI library, composes its
// primitives into product surfaces, wraps each with mountly-svelte's
// createWidget. Library file has zero mountly references.
import { createWidget } from "/packages/adapters/mountly-svelte/dist/index.js";
import {
  Button,
  Card,
  Stack,
} from "/tests/fixtures/bridge-pure-svelte-lib.js";

class HeroSurface {
  constructor({ target, props = {} }) {
    const card = new Card({ target, props: { tone: "primary", title: "Hero" } });
    const stack = new Stack({ target: card.body, props: { gap: 8 } });
    const para = document.createElement("p");
    para.className = "ui-muted";
    para.textContent = props.headline ?? "";
    stack.el.appendChild(para);
    const cta = document.createElement("a");
    cta.className = "ui-btn ui-btn-primary";
    cta.href = props.ctaHref ?? "#";
    cta.textContent = props.ctaLabel ?? "";
    cta.setAttribute("data-testid", "hero-cta");
    stack.el.appendChild(cta);
    this.children = [card, stack];
  }
  $destroy() { this.children.forEach((c) => c.$destroy()); }
}

class PricingSurface {
  constructor({ target, props = {} }) {
    const card = new Card({ target, props: { tone: "primary", title: "Pricing" } });
    const stack = new Stack({ target: card.body, props: { gap: 8 } });
    const blurb = document.createElement("p");
    blurb.className = "ui-muted";
    blurb.textContent = props.blurb ?? "";
    stack.el.appendChild(blurb);
    const amount = document.createElement("p");
    amount.className = "ui-amount";
    amount.textContent = `$${props.price ?? 0}/mo`;
    stack.el.appendChild(amount);
    const button = new Button({
      target: stack.el,
      props: { variant: "primary", label: `Subscribe to ${props.plan ?? "Pro"}` },
    });
    this.children = [card, stack, button];
  }
  $destroy() { this.children.forEach((c) => c.$destroy()); }
}

class EmailCaptureSurface {
  constructor({ target, props = {} }) {
    const card = new Card({ target, props: { tone: "neutral", title: "Newsletter" } });
    const stack = new Stack({ target: card.body, props: { gap: 8 } });
    const input = document.createElement("input");
    input.type = "email";
    input.placeholder = "you@example.com";
    input.className = "ui-input";
    stack.el.appendChild(input);
    const button = new Button({
      target: stack.el,
      props: { variant: "default", label: props.buttonLabel ?? "Subscribe" },
    });
    this.children = [card, stack, button];
  }
  $destroy() { this.children.forEach((c) => c.$destroy()); }
}

const lightDom = { shadow: false };
export const hero = createWidget(HeroSurface, lightDom);
export const pricing = createWidget(PricingSurface, lightDom);
export const newsletter = createWidget(EmailCaptureSurface, lightDom);

export const __bridge_id = "svelte-widgets-bridge@1.0.0";
