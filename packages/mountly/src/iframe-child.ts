/**
 * The framed side of `mountly/iframe`. Loaded by the widget page, so the same
 * `createWidget(...)` output runs unchanged in light DOM, in a shadow root, or
 * in a cross-origin frame — the host picks the isolation level, not the author.
 *
 * ```html
 * <script src="https://unpkg.com/resize-iframe/resize-iframe-child.js"></script>
 * <script type="module">
 *   import { mountAsFrame } from "mountly/iframe/child";
 *   import widget from "./my-widget.js";
 *   mountAsFrame(widget);
 * </script>
 * ```
 */
import type { WidgetModule } from "./adapter.js";

/**
 * Handshake the framed page sends once it is listening for props. Declared
 * here, not in `mountly/iframe`, so this entry stays a leaf: a framed page
 * pulls in neither the feature runtime nor `resize-iframe`.
 */
export const FRAME_READY = "mountly:frame-ready";

/** The slice of `resize-iframe`'s `window.parentIframe` this entry needs. */
interface ParentIframe {
  onMessage: ((message: unknown) => void) | null;
  sendMessage(message: unknown, targetOrigin?: string): void;
}

export interface MountAsFrameOptions {
  /**
   * Where to mount. Defaults to a `[data-iframe-size]` div appended to `<body>`,
   * which is also what resize-iframe measures — so the frame tracks the widget
   * rather than the document's stray margins.
   */
  container?: HTMLElement;
  /** Props used when the page is opened directly rather than embedded. */
  standaloneProps?: Record<string, unknown>;
}

function createSizedContainer(): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-iframe-size", "");
  document.body.append(el);
  return el;
}

/**
 * Mount `widget` with the props the embedding host sends, and re-render on
 * every later update. Returns the container it mounted into.
 */
export function mountAsFrame(widget: WidgetModule, options: MountAsFrameOptions = {}): HTMLElement {
  const container = options.container ?? createSizedContainer();
  const parentIframe = (globalThis as { parentIframe?: ParentIframe }).parentIframe;

  // Opened directly rather than embedded, so there is no host to send props.
  // Mount anyway: the widget page stays developable on its own.
  if (!parentIframe) {
    void widget.mount(container, options.standaloneProps ?? {});
    return container;
  }

  if (!("onMessage" in parentIframe)) {
    throw new Error(
      "[mountly] resize-iframe-child.js is too old: mountAsFrame needs `parentIframe.onMessage`, " +
        "added in resize-iframe 0.2.0. Without it the host's props never arrive.",
    );
  }

  let mounted = false;
  parentIframe.onMessage = (message) => {
    const props = (message ?? {}) as Record<string, unknown>;
    if (!mounted) {
      mounted = true;
      void widget.mount(container, props);
      return;
    }
    if (widget.update) {
      void widget.update(container, props);
      return;
    }
    void Promise.resolve(widget.unmount(container)).then(() => widget.mount(container, props));
  };

  // The host holds the props until we say we are listening.
  parentIframe.sendMessage(FRAME_READY);
  return container;
}
