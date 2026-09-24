import type { ComponentType } from "react";
import React, { createContext, createElement, useContext } from "react";
import { createRoot, type Root } from "react-dom/client";
import { attachShadow } from "mountly/shadow";
import { loadCssText, resolveCssUrl } from "mountly/assets";
import type { AdapterOptions, WidgetModule } from "mountly/adapter";

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

const PortalContainerContext = createContext<HTMLElement | null>(null);

/**
 * Where portalled UI (dialogs, popovers, menus) should render. Inside a shadow
 * root this is a node in that root, so the adopted stylesheet still applies;
 * portalling to `document.body` would leave the popup unstyled. `null` outside
 * shadow mode, which Radix and most portal APIs read as "use document.body".
 *
 *   <PopoverPrimitive.Portal container={usePortalContainer()}>
 */
export function usePortalContainer(): HTMLElement | null {
  return useContext(PortalContainerContext);
}

export function createWidget<P>(
  Component: ComponentType<P>,
  options: ReactWidgetOptions = {},
): WidgetModule {
  const roots = new WeakMap<Element, Root>();
  const portals = new WeakMap<Element, HTMLElement | null>();
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
    const element = () =>
      createElement(
        PortalContainerContext.Provider,
        { value: portals.get(container) ?? null },
        createElement(Component as React.ComponentType, props as unknown as P & object),
      );
    const existing = roots.get(container);
    if (isUpdate && existing) {
      existing.render(element());
      return;
    }
    const target = attachShadow(container, fetched ? { ...options, styles: fetched } : options);
    if (!portals.has(container)) portals.set(container, portalFor(target));
    const root = createRoot(target);
    root.render(element());
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
    return loadCssText(cssUrlResolved).then((css) =>
      renderInto(container, props, css || undefined, isUpdate),
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

/**
 * A sibling of the React root inside the shadow root, so React never clears it
 * and portalled content shares the root's adopted stylesheet. Light DOM needs
 * none: `document.body` already sees the page's styles.
 */
function portalFor(target: HTMLElement): HTMLElement | null {
  const root = target.getRootNode();
  if (typeof ShadowRoot === "undefined" || !(root instanceof ShadowRoot)) return null;
  const portal = document.createElement("div");
  portal.setAttribute("data-mountly-portal", "");
  root.append(portal);
  return portal;
}
