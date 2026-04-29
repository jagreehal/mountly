import type { ComponentType } from "react";
import React, { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  attachShadow,
  loadCssText,
  resolveCssUrl,
  type WidgetModule,
  type AdapterOptions,
} from "mountly";

interface ReactWidgetOptions extends AdapterOptions {
  /**
   * URL to the component's JavaScript bundle. Used to derive the CSS URL
   * if `cssUrl` is not provided (e.g., "/dist/index.js" -> "/dist/index.css").
   *
   * Pairs well with CSS Modules: the build emits a sibling stylesheet whose
   * unique class names are referenced by the component's JSX. The shadow
   * root supplies the scope React itself doesn't offer.
   */
  moduleUrl?: string;
  /**
   * URL to the component's CSS file. If not provided, derived from
   * `moduleUrl` (replaces ".js" with ".css").
   */
  cssUrl?: string;
}

export function createWidget<P>(
  Component: ComponentType<P>,
  options: ReactWidgetOptions = {},
): WidgetModule {
  const roots = new WeakMap<Element, Root>();
  const { moduleUrl, cssUrl } = options;

  function unmount(container: Element): void {
    const existing = roots.get(container);
    if (!existing) return;
    existing.unmount();
    roots.delete(container);
  }

  function renderInto(
    container: Element,
    props: Record<string, unknown> | undefined,
    fetched: string | undefined,
    isUpdate: boolean,
  ): void {
    if (options.reserveSize) {
      (container as HTMLElement).style.cssText += `;${options.reserveSize}`;
    }
    const existing = roots.get(container);
    if (isUpdate && existing) {
      existing.render(
        createElement(
          Component as React.ComponentType,
          props as unknown as P & object,
        ),
      );
      return;
    }
    const target = attachShadow(
      container,
      fetched ? { ...options, styles: fetched } : options,
    );
    const root = createRoot(target);
    root.render(
      createElement(
        Component as React.ComponentType,
        props as unknown as P & object,
      ),
    );
    roots.set(container, root);
  }

  function go(
    container: Element,
    props: Record<string, unknown> | undefined,
    isUpdate: boolean,
  ): void | Promise<void> {
    const cssUrlFromProps = (props as Record<string, unknown>)?.cssUrl as string | undefined;
    const moduleUrlFromProps = (props as Record<string, unknown>)?.moduleUrl as string | undefined;
    const cssUrlResolved = resolveCssUrl({
      cssUrlOption: cssUrl,
      moduleUrlOption: moduleUrl,
      cssUrlProp: cssUrlFromProps,
      moduleUrlProp: moduleUrlFromProps,
    });
    // Stay synchronous when no fetch is required so existing hosts that
    // don't await mount() keep working.
    if (!cssUrlResolved) {
      renderInto(container, props, undefined, isUpdate);
      return;
    }
    return loadCssText(cssUrlResolved).then(
      (css) => renderInto(container, props, css || undefined, isUpdate),
    );
  }

  return {
    mount(container, props) {
      unmount(container);
      return go(container, props as Record<string, unknown> | undefined, false);
    },
    update(container, props) {
      return go(container, props as Record<string, unknown> | undefined, true);
    },
    unmount,
  };
}
