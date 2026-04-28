import { createApp, h, type App, type Component } from "vue";
import { attachShadow, type AdapterOptions, type WidgetModule } from "mountly";

export function createWidget<P>(
  Component: Component<P>,
  options: AdapterOptions = {},
): WidgetModule {
  const apps = new WeakMap<Element, App>();

  function unmount(container: Element): void {
    const existing = apps.get(container);
    if (!existing) return;
    existing.unmount();
    apps.delete(container);
  }

  return {
    mount(container, props) {
      unmount(container);
      if (options.reserveSize) {
        (container as HTMLElement).style.cssText += `;${options.reserveSize}`;
      }
      const target = attachShadow(container, options);
      const state = { props: (props as P) };
      const app = createApp({
        render() {
          return h(Component as Component, state.props);
        },
      });
      app.mount(target);
      apps.set(container, app);
    },
    update(container, props) {
      if (!apps.has(container)) {
        this.mount(container, props);
        return;
      }
      // Vue adapter parity path: remount to apply new props deterministically.
      this.mount(container, props);
    },
    unmount,
  };
}
