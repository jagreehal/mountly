import type { ComponentType } from "react";
import React, { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { attachShadow, type WidgetModule, type AdapterOptions } from "mountly";

export function createWidget<P>(
  Component: ComponentType<P>,
  options: AdapterOptions = {},
): WidgetModule {
  const roots = new WeakMap<Element, Root>();

  function unmount(container: Element): void {
    const existing = roots.get(container);
    if (!existing) return;
    existing.unmount();
    roots.delete(container);
  }

  return {
    mount(container, props) {
      unmount(container);
      if (options.reserveSize) {
        (container as HTMLElement).style.cssText += `;${options.reserveSize}`;
      }
      const target = attachShadow(container, options);
      const root = createRoot(target);
      // Props arrive as Record<string,unknown> from the WidgetModule boundary.
      // Cast only at this lossy seam: Component erased so createElement's
      // overloads resolve, props narrowed to P & object (satisfies Attributes).
      root.render(createElement(Component as React.ComponentType, props as unknown as P & object));
      roots.set(container, root);
    },
    update(container, props) {
      const existing = roots.get(container);
      if (!existing) {
        this.mount(container, props);
        return;
      }
      existing.render(createElement(Component as React.ComponentType, props as unknown as P & object));
    },
    unmount,
  };
}
