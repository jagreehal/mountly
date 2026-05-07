import type { WidgetModule } from "./adapter.js";

export interface WidgetFixture {
  container: HTMLElement;
  unmount: () => void | Promise<void>;
}

export async function mountWidgetFixture(
  widget: WidgetModule,
  props: unknown = {},
  container: HTMLElement = document.createElement("div"),
): Promise<WidgetFixture> {
  if (!container.isConnected) document.body.appendChild(container);
  await widget.mount(container, props);
  return {
    container,
    unmount: () => widget.unmount(container),
  };
}

export async function cycleWidgetFixture(
  widget: WidgetModule,
  props: unknown = {},
): Promise<{ firstText: string; afterUnmountText: string; secondText: string }> {
  const fixture = await mountWidgetFixture(widget, props);
  const getText = () =>
    fixture.container.shadowRoot?.textContent ?? fixture.container.textContent ?? "";
  const firstText = getText();
  await fixture.unmount();
  const afterUnmountText = getText();
  await widget.mount(fixture.container, props);
  const secondText = getText();
  await widget.unmount(fixture.container);
  fixture.container.remove();
  return { firstText, afterUnmountText, secondText };
}
