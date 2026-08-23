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

import {
  createFrameChannel,
  type FrameChannel,
  type FrameEventMap,
  type FrameChannelOptions,
} from "./frame-channel.js";

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

export interface FrameChildChannelOptions<Events extends FrameEventMap>
  extends FrameChannelOptions<Events> {
  /**
   * Called with the channel to the host before the widget mounts, so a
   * listener is registered before the first event can arrive. Return a cleanup
   * function to run if the host tears the frame down.
   */
  connect: (channel: FrameChannel<Events>) => void | (() => void);
}

export interface MountAsFrameOptions<Events extends FrameEventMap = FrameEventMap> {
  /**
   * Where to mount. Defaults to a `[data-iframe-size]` div appended to `<body>`,
   * which is also what resize-iframe measures — so the frame tracks the widget
   * rather than the document's stray margins.
   */
  container?: HTMLElement;
  /** Props used when the page is opened directly rather than embedded. */
  standaloneProps?: Record<string, unknown>;
  /**
   * Typed events to and from the host. The host sends props on its own; this
   * is how the widget answers — a selection, a completed payment, a request to
   * navigate — without reaching for raw `postMessage`.
   */
  channel?: FrameChildChannelOptions<Events>;
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
export function mountAsFrame<Events extends FrameEventMap = FrameEventMap>(
  widget: WidgetModule,
  options: MountAsFrameOptions<Events> = {},
): HTMLElement {
  const container = options.container ?? createSizedContainer();
  const parentIframe = (globalThis as { parentIframe?: ParentIframe }).parentIframe;

  // Opened directly rather than embedded, so there is no host to send props.
  // Mount anyway: the widget page stays developable on its own. Emitting into
  // a channel with no host is a no-op rather than a crash, so the same widget
  // code runs on the standalone page.
  if (!parentIframe) {
    if (options.channel) {
      const { connect, ...channelOptions } = options.channel;
      connect(createFrameChannel<Events>(() => {}, channelOptions).channel);
    }
    void widget.mount(container, options.standaloneProps ?? {});
    return container;
  }

  if (!("onMessage" in parentIframe)) {
    throw new Error(
      "[mountly] resize-iframe-child.js is too old: mountAsFrame needs `parentIframe.onMessage`, " +
        "added in resize-iframe 0.2.0. Without it the host's props never arrive.",
    );
  }

  // Wired before FRAME_READY goes out, so no host event can outrun a listener.
  let receive: ((message: unknown) => boolean) | undefined;
  if (options.channel) {
    const { connect, ...channelOptions } = options.channel;
    const binding = createFrameChannel<Events>(
      (envelope) => parentIframe.sendMessage(envelope),
      channelOptions,
    );
    receive = binding.receive;
    connect(binding.channel);
  }

  let mounted = false;
  parentIframe.onMessage = (message) => {
    // Channel traffic and props share one transport; the envelope marker is
    // what tells them apart.
    if (receive?.(message)) return;
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

export { FRAME_CONTRACT_VERSION } from "./frame-channel.js";
export type { FrameChannel, FrameChannelOptions, FrameEventMap } from "./frame-channel.js";

export {
  OVERLAY_OPEN,
  OVERLAY_CLOSE,
  OVERLAY_CLOSED,
  openHostOverlay,
  closeHostOverlay,
  frameOverlayValidators,
  isOverlayOpenPayload,
  isOverlayClosePayload,
  type FrameOverlayEvents,
  type OverlayOpenPayload,
  type OverlayClosePayload,
  type OverlayFrameChannel,
} from "./frame-overlay.js";

export {
  HISTORY_NAVIGATE,
  HISTORY_SYNC,
  requestHostNavigation,
  frameHistoryValidators,
  isHistoryNavigatePayload,
  isHistorySyncPayload,
  type FrameHistoryEvents,
  type HistoryNavigatePayload,
  type HistorySyncPayload,
  type HistoryFrameChannel,
} from "./frame-history.js";
