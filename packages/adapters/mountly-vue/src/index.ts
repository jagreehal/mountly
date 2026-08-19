import { createApp, h, reactive, type App, type Component } from "vue";
import { attachShadow } from "mountly/shadow";
import { loadCssText, resolveCssUrl } from "mountly/assets";
import type { AdapterOptions, WidgetModule } from "mountly/adapter";

interface VueWidgetOptions extends AdapterOptions {
  /**
   * URL to the component's JavaScript bundle. Used to derive the CSS URL
   * if `cssUrl` is not provided (e.g., "/dist/index.js" -> "/dist/index.css").
   */
  moduleUrl?: string;
  /**
   * URL to the component's CSS file. If not provided, derived from
   * `moduleUrl` (replaces ".js" with ".css").
   */
  cssUrl?: string;
}

export function createWidget<P>(
  Component: Component<P>,
  options: VueWidgetOptions = {},
): WidgetModule {
  const apps = new WeakMap<Element, App>();
  const propsStates = new WeakMap<Element, Record<string, unknown>>();
  const { moduleUrl, cssUrl } = options;

  function unmount(container: Element): void {
    const existing = apps.get(container);
    if (!existing) return;
    existing.unmount();
    apps.delete(container);
    propsStates.delete(container);
  }

  function mountWith(
    container: Element,
    props: Record<string, unknown> | undefined,
    fetched: string | undefined,
  ): void {
    if (options.reserveSize) {
      (container as HTMLElement).style.cssText += `;${options.reserveSize}`;
    }
    const target = attachShadow(container, fetched ? { ...options, styles: fetched } : options);
    const state = reactive({ ...(props ?? {}) }) as Record<string, unknown>;
    propsStates.set(container, state);
    const app = createApp({
      render() {
        return h(Component as Component, state);
      },
    });
    app.mount(target);
    apps.set(container, app);
  }

  return {
    mount(container, props) {
      unmount(container);
      const cssUrlFromProps = (props as Record<string, unknown>)?.cssUrl as string | undefined;
      const moduleUrlFromProps = (props as Record<string, unknown>)?.moduleUrl as
        | string
        | undefined;
      const cssUrlResolved = resolveCssUrl({
        cssUrlOption: cssUrl,
        moduleUrlOption: moduleUrl,
        cssUrlProp: cssUrlFromProps,
        moduleUrlProp: moduleUrlFromProps,
      });
      const propsRecord = props as Record<string, unknown> | undefined;
      if (!cssUrlResolved) {
        mountWith(container, propsRecord, undefined);
        return;
      }
      return loadCssText(cssUrlResolved).then((css) => {
        mountWith(container, propsRecord, css || undefined);
      });
    },
    update(container, props) {
      const state = propsStates.get(container);
      if (!state) {
        return this.mount(container, props);
      }
      const newProps = (props ?? {}) as Record<string, unknown>;
      for (const key of Object.keys(state)) {
        if (!(key in newProps)) {
          delete state[key];
        }
      }
      Object.assign(state, newProps);
    },
    unmount,
  };
}
