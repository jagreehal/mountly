// Same widget as zero-config-svelte-widget.js, in light DOM: the markup stays
// reachable to the page, and the core's sibling-CSS link styles it.
import { createWidget } from "/packages/adapters/mountly-svelte/dist/index.js";

class HelloComponent {
  constructor({ target, props }) {
    this.el = document.createElement("span");
    this.el.className = "styled-widget";
    this.el.textContent = String(props?.msg ?? "");
    target.appendChild(this.el);
  }
  $destroy() {
    this.el?.remove();
  }
}

export default createWidget(HelloComponent, { shadow: false });
