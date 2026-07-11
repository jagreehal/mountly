import { createWidget } from "mountly-react";
import { ProductASettings } from "./Component.js";

const widget = createWidget(ProductASettings, {
  shadow: false,
  styles: `
    .product-a-panel {
      font-family: system-ui, sans-serif;
      padding: 16px;
      border-radius: 12px;
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      color: #0f172a;
      max-width: 420px;
    }
    .product-a-panel header { margin-bottom: 12px; }
    .product-a-panel h2 { margin: 8px 0 4px; font-size: 18px; }
    .product-a-panel .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #1d4ed8;
    }
    .product-a-panel .muted { margin: 0; color: #64748b; font-size: 13px; }
    .product-a-panel dl { display: grid; gap: 8px; margin: 0; }
    .product-a-panel dl div { display: grid; grid-template-columns: 88px 1fr; gap: 8px; font-size: 14px; }
    .product-a-panel dt { color: #64748b; margin: 0; }
    .product-a-panel dd { margin: 0; font-weight: 600; }
    .product-a-panel code { font-size: 12px; word-break: break-all; }
    .product-a-panel button.close {
      margin-top: 12px;
      background: #2563eb;
      color: #fff;
      border: 0;
      border-radius: 8px;
      padding: 8px 12px;
      cursor: pointer;
    }
  `,
});

export function mountProductASettings(
  container: HTMLElement,
  props: Record<string, unknown>,
): void {
  container.replaceChildren();
  void widget.mount(container, props);
}

export function updateProductASettings(
  container: HTMLElement,
  props: Record<string, unknown>,
): void {
  void widget.mount(container, props);
}

export function unmountProductASettings(container: HTMLElement): void {
  void widget.unmount(container);
}
