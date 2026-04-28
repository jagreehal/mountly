export interface WidgetModule {
  mount(container: Element, props: unknown): void | Promise<void>;
  update?(container: Element, props: unknown): void | Promise<void>;
  unmount(container: Element): void | Promise<void>;
}

export interface AdapterOptions {
  styles?: string;
  styleMode?: "shared" | "isolated";
  reserveSize?: string;
  shadow?: boolean;
  shadowMode?: "open" | "closed";
}

export interface FrameworkAdapter<Component> {
  createWidget(component: Component, options?: AdapterOptions): WidgetModule;
}
