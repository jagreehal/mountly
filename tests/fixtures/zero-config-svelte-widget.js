// Simulates a user's pre-built Svelte widget bundle. The host references this
// file's URL via `moduleUrl` and the mountly-svelte adapter auto-fetches the
// sibling .css file.
import { createWidget } from "/packages/adapters/mountly-svelte/dist/index.js";

class HelloComponent {
  constructor({ target, props }) {
    this.el = document.createElement("span");
    this.el.className = "styled-widget";
    this.el.textContent = String(props?.msg ?? "");
    target.appendChild(this.el);
  }
  $destroy() { this.el?.remove(); }
}

export default createWidget(HelloComponent);
