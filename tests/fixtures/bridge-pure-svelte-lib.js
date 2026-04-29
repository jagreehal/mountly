// Pure Svelte UI library. Knows nothing about mountly. The components
// follow Svelte 4's class-component shape (`new Component({ target, props })`)
// because the fixture cannot run a Svelte compiler — in a real package
// these would be `.svelte` files compiled by Vite. The same components
// would render in any Svelte app via `new SignupCard({ target, props })`.

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "style") Object.assign(node.style, v);
    else if (k.startsWith("on")) node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    if (typeof child === "string" || typeof child === "number") {
      node.appendChild(document.createTextNode(String(child)));
    } else if (child instanceof Node) {
      node.appendChild(child);
    }
  }
  return node;
}

export class Button {
  constructor({ target, props = {} }) {
    const variant = props.variant ?? "default";
    this.el = el("button", { class: `ui-btn ui-btn-${variant}` }, props.label ?? "");
    if (props.onClick) this.el.addEventListener("click", props.onClick);
    if (props.testid) this.el.setAttribute("data-testid", props.testid);
    target.appendChild(this.el);
  }
  $destroy() { this.el?.remove(); }
}

export class Card {
  constructor({ target, props = {} }) {
    const tone = props.tone ?? "neutral";
    this.body = el("div", { class: "ui-card-body" });
    const children = [
      props.title ? el("h3", { class: "ui-card-title" }, props.title) : null,
      this.body,
    ];
    this.el = el("section", { class: `ui-card ui-card-${tone}` }, children);
    target.appendChild(this.el);
  }
  $destroy() { this.el?.remove(); }
}

export class Stack {
  constructor({ target, props = {} }) {
    this.el = el("div", {
      class: "ui-stack",
      style: { display: "flex", flexDirection: "column", gap: `${props.gap ?? 8}px` },
    });
    target.appendChild(this.el);
  }
  $destroy() { this.el?.remove(); }
}

export const __ui_id = "pure-svelte-ui-lib@1.0.0";
