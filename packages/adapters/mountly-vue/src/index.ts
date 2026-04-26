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
      const target = attachShadow(container, options);
      const app = createApp({
        render() {
          return h(Component as Component, props as P);
        },
      });
      app.mount(target);
      apps.set(container, app);
    },
    unmount,
  };
}
