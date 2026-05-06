export interface WidgetModule {
  mount(container: Element, props: unknown): void | Promise<void>;
  update?(container: Element, props: unknown): void | Promise<void>;
  unmount(container: Element): void | Promise<void>;
}

export interface AdapterOptions {
  styles?: string;
  styleMode?: "shared" | "isolated";
  reserveSize?: string;
  /**
   * Mount inside a shadow root for full style isolation.
   *
   * Default: `false` (light DOM). Set `shadow: true` to opt in to shadow DOM,
   * which scopes the widget's styles and prevents host CSS from reaching in.
   */
  shadow?: boolean;
  shadowMode?: "open" | "closed";
}

export interface FrameworkAdapter<Component> {
  createWidget(component: Component, options?: AdapterOptions): WidgetModule;
}
