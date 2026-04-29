// Simulates a built bundle that exports three Svelte 4 widgets sharing
// utility code. In a real project this is produced by Vite library mode
// with multiple component imports concatenated through a single entry.
import { createWidget } from "/packages/adapters/mountly-svelte/dist/index.js";

// Shared utility — each widget consumes it without needing its own copy.
function badge(text, tone) {
  const span = document.createElement("span");
  span.className = `badge badge-${tone}`;
  span.textContent = text;
  return span;
}

class CounterCard {
  constructor({ target, props }) {
    this.root = document.createElement("div");
    this.root.className = "card";
    this.root.appendChild(badge("counter", "primary"));
    this.value = props?.start ?? 0;
    this.num = document.createElement("strong");
    this.num.className = "num";
    this.num.textContent = String(this.value);
    this.root.appendChild(this.num);
    target.appendChild(this.root);
  }
  $destroy() { this.root?.remove(); }
}

class ClockCard {
  constructor({ target, props }) {
    this.root = document.createElement("div");
    this.root.className = "card";
    this.root.appendChild(badge("clock", "info"));
    const time = document.createElement("time");
    time.className = "num";
    time.textContent = props?.now ?? "12:00";
    this.root.appendChild(time);
    target.appendChild(this.root);
  }
  $destroy() { this.root?.remove(); }
}

class StatusCard {
  constructor({ target, props }) {
    this.root = document.createElement("div");
    this.root.className = "card";
    this.root.appendChild(badge("status", "success"));
    const msg = document.createElement("p");
    msg.className = "msg";
    msg.textContent = props?.message ?? "OK";
    this.root.appendChild(msg);
    target.appendChild(this.root);
  }
  $destroy() { this.root?.remove(); }
}

// Each export is a fully-formed WidgetModule. Sharing one bundle means
// shared bytes for the `badge` helper and any future utility additions.
export const counter = createWidget(CounterCard);
export const clock = createWidget(ClockCard);
export const status = createWidget(StatusCard);
