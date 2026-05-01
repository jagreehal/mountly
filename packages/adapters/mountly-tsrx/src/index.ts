import {
  attachShadow,
  loadCssText,
  resolveCssUrl,
  type AdapterOptions,
  type WidgetModule,
} from "mountly";

export interface TsrxWidgetOptions extends AdapterOptions {
  moduleUrl?: string;
  cssUrl?: string;
}

export interface TsrxRenderer<P = unknown> {
  render(target: Element, props?: P): void | (() => void) | { destroy?: () => void; update?: (props?: P) => void };
}

export interface TsrxLifecycle<P = unknown> {
  mount(target: Element, props?: P): void;
  update?(target: Element, props?: P): void;
  unmount?(target: Element): void;
}

type TsrxComponent<P = unknown> = TsrxRenderer<P> | TsrxLifecycle<P>;

interface ActiveInstance<P = unknown> {
  target: Element;
  destroy?: () => void;
  update?: (props?: P) => void;
  lifecycle?: TsrxLifecycle<P>;
}

function isRenderer<P>(component: TsrxComponent<P>): component is TsrxRenderer<P> {
  return typeof (component as TsrxRenderer<P>).render === "function";
}

export function createWidget<P>(
  Component: TsrxComponent<P>,
  options: TsrxWidgetOptions = {},
): WidgetModule {
  const instances = new WeakMap<Element, ActiveInstance<P>>();
  const { moduleUrl, cssUrl } = options;

  function unmount(container: Element): void {
    const existing = instances.get(container);
    if (!existing) return;

    if (existing.destroy) {
      existing.destroy();
    } else if (existing.lifecycle?.unmount) {
      existing.lifecycle.unmount(existing.target);
    }

    instances.delete(container);
  }

  function mountWith(
    container: Element,
    props: Record<string, unknown> | undefined,
    fetched: string | undefined,
  ): void {
    if (options.reserveSize) {
      (container as HTMLElement).style.cssText += `;${options.reserveSize}`;
    }

    const target = attachShadow(
      container,
      fetched ? { ...options, styles: fetched } : options,
    );

    if (isRenderer(Component)) {
      const result = Component.render(target, props as P);
      if (typeof result === "function") {
        instances.set(container, { target, destroy: result });
        return;
      }
      if (result && typeof result === "object") {
        instances.set(container, {
          target,
          destroy: result.destroy,
          update: result.update,
        });
        return;
      }
      instances.set(container, { target });
      return;
    }

    Component.mount(target, props as P);
    instances.set(container, {
      target,
      lifecycle: Component,
      update: Component.update ? (nextProps?: P) => Component.update?.(target, nextProps) : undefined,
    });
  }

  function go(
    container: Element,
    props: Record<string, unknown> | undefined,
    isUpdate: boolean,
  ): void | Promise<void> {
    const existing = instances.get(container);
    if (isUpdate && existing?.update) {
      existing.update(props as P);
      return;
    }

    if (isUpdate) {
      unmount(container);
    }

    const cssUrlFromProps = (props as Record<string, unknown>)?.cssUrl as string | undefined;
    const moduleUrlFromProps = (props as Record<string, unknown>)?.moduleUrl as string | undefined;
    const cssUrlResolved = resolveCssUrl({
      cssUrlOption: cssUrl,
      moduleUrlOption: moduleUrl,
      cssUrlProp: cssUrlFromProps,
      moduleUrlProp: moduleUrlFromProps,
    });

    if (!cssUrlResolved) {
      mountWith(container, props, undefined);
      return;
    }

    return loadCssText(cssUrlResolved).then((css) => {
      mountWith(container, props, css || undefined);
    });
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
