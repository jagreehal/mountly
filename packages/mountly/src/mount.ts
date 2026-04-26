export interface MountOptions {
  replaceContent?: boolean;
  beforeMount?(container: HTMLElement): void;
  afterMount?(container: HTMLElement): void;
}

export function createMountContainer(
  anchor: HTMLElement,
  options?: MountOptions
): HTMLElement {
  const container = document.createElement("div");
  container.setAttribute("data-mountly", "true");

  if (options?.beforeMount) {
    options.beforeMount(container);
  }

  if (options?.replaceContent) {
    anchor.replaceWith(container);
  } else {
    anchor.appendChild(container);
  }

  return container;
}

export function safeUnmount(container: HTMLElement): void {
  if (!container) return;
  const root = container as HTMLElement & { _unmount?: () => void };
  if (root._unmount) {
    root._unmount();
    delete root._unmount;
  }
  container.innerHTML = "";
  container.remove();
}

export function getOrCreateContainer(
  anchor: HTMLElement,
  id: string
): HTMLElement {
  const existing = anchor.querySelector(
    `[data-mountly-id="${id}"]`
  ) as HTMLElement | null;

  if (existing) return existing;

  const container = document.createElement("div");
  container.setAttribute("data-mountly-id", id);
  container.setAttribute("data-mountly", "true");
  anchor.appendChild(container);
  return container;
}
