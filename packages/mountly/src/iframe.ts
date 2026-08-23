/**
 * Cross-origin widgets: the same on-intent lifecycle as every other mountly
 * feature, with a browser-enforced isolation boundary instead of a shared JS
 * context.
 *
 * The widget runs in its own document — its own `window`, its own styles, its
 * own globals — so one vertical cannot mutate another's state or leak CSS into
 * the host, whatever it does internally. That costs a second bootstrap, which
 * is the trade: strong isolation, slower mount. Reach for it when you do not
 * trust the shared context; use `moduleUrl` when you do.
 *
 * Sizing and the message channel come from `resize-iframe`, an optional peer.
 * The framed page loads `resize-iframe-child.js` and calls `mountAsFrame` from
 * `mountly/iframe/child`.
 */
import { iframeResize, type ResizeIframeHandle, type ResizeIframeOptions } from "resize-iframe";
import { FRAME_READY } from "./iframe-child.js";

import {
  createFrameChannel,
  type FrameChannel,
  type FrameEventMap,
  type FrameChannelOptions,
} from "./frame-channel.js";
import {
  createOnDemandFeature,
  type CreateOnDemandFeatureOptions,
  type FeatureModule,
  type OnDemandFeature,
} from "./feature.js";
import {
  clearPlaceholders,
  showPlaceholder,
  showPlaceholderFromUrl,
  type PlaceholderSource,
} from "./placeholder.js";

/** Handshake the framed page sends once it is listening for props. */
export { FRAME_READY };

export interface IframeChannelOptions<
  Events extends FrameEventMap,
> extends FrameChannelOptions<Events> {
  /**
   * Called once the framed page is listening, with the channel to that frame.
   * Wire listeners here and keep the channel to emit into the frame. Return a
   * cleanup function to run when the frame unmounts.
   *
   * Called once per mounted frame — each one is its own window, so each gets
   * its own channel.
   */
  connect: (channel: FrameChannel<Events>) => void | (() => void);
}

export interface IframeModuleOptions<Events extends FrameEventMap = FrameEventMap> extends Pick<
  ResizeIframeOptions,
  "direction" | "offsetSize" | "warningTimeout"
> {
  /** Accessible name. An iframe without one is a screen reader dead end, so it is required. */
  title: string;
  /** `sandbox` attribute. A widget needs at least `allow-scripts`. Omit for no sandbox. */
  sandbox?: string;
  /** `allow` attribute, e.g. `storage-access` for a cross-site embed that needs its cookies. */
  allow?: string;
  /**
   * Typed events across the boundary. Props flow host → frame on their own;
   * this is the way anything flows back, and the way the host pushes an event
   * rather than a re-render.
   */
  channel?: IframeChannelOptions<Events>;
  /**
   * How long to wait for the framed page to say it is listening, in ms.
   * Defaults to 10000. `0` disables the timeout.
   *
   * A cross-origin frame cannot be inspected, so this is the only reliable way
   * to notice that it never came up: a 404, a CSP that blocked the bundle, a
   * page that threw before `mountAsFrame`, or one that simply forgot to load
   * `resize-iframe-child.js` all look identical from out here — silent.
   */
  readyTimeout?: number;
  /**
   * Called when the frame fails to come up, so the host can render something
   * other than a blank space. Without it the failure is reported via
   * `console.error`.
   */
  onError?: (error: Error) => void;
  /**
   * Static shell shown in the container until the framed page reports ready.
   * Not hydration — host-authored text (default) or an element. Use
   * {@link showPlaceholder} with `{ html: true }` yourself for trusted markup.
   */
  placeholder?: PlaceholderSource;
  /**
   * CDN or same-origin URL of a static HTML skeleton fetched before the frame
   * reports ready. Treated as trusted host/CDN markup. Prefer this over
   * `placeholder` when the skeleton is versioned next to the vertical.
   */
  placeholderUrl?: string;
}

export interface IframeFeatureOptions<Events extends FrameEventMap = FrameEventMap>
  extends IframeModuleOptions<Events>, Pick<CreateOnDemandFeatureOptions, "moduleId"> {
  /** URL of the framed widget page. */
  src: string;
}

interface Frame {
  el: HTMLIFrameElement;
  handle?: ResizeIframeHandle;
  props: Record<string, unknown>;
  ready: boolean;
  /** Feeds inbound messages to the channel; absent when no channel is configured. */
  receive?: (message: unknown) => boolean;
  /** Returned by `channel.connect`, run on unmount. */
  disconnect?: () => void;
  /** Cleared once the frame reports ready, or on unmount. */
  readyTimer?: ReturnType<typeof setTimeout>;
  /** Removes the pre-ready placeholder. */
  clearPlaceholder?: () => void;
  /** Aborts an in-flight placeholderUrl fetch. */
  placeholderAbort?: AbortController;
  /** Host events emitted before FRAME_READY, delivered once the child is listening. */
  pendingEvents: unknown[];
}

const prefetched = new Set<string>();

/**
 * Warm the document at preload time — hover, viewport, idle — so mount only
 * pays for the frame's own bootstrap. Fetching early is the one performance
 * lever an iframe leaves you: the bytes can be early, the JS context cannot be
 * shared.
 */
function prefetchDocument(href: string): void {
  if (typeof document === "undefined" || prefetched.has(href)) return;
  prefetched.add(href);
  const link = document.createElement("link");
  link.rel = "prefetch";
  link.as = "document";
  link.href = href;
  document.head.append(link);
}

function send(frame: Frame, targetOrigin: string, props: Record<string, unknown>): void {
  try {
    frame.handle?.sendMessage(props, targetOrigin);
  } catch (error) {
    const wrapped = new Error(
      "[mountly] iframe props must be structured-clonable — functions, DOM nodes and class " +
        "instances cannot cross the frame boundary. Pass plain data and use events for callbacks.",
    );
    (wrapped as Error & { cause?: unknown }).cause = error;
    throw wrapped;
  }
}

/** Sandboxing without allow-same-origin gives the child an opaque origin. */
function targetOriginFor(url: URL, sandbox: string | undefined): string {
  if (sandbox === undefined) return url.origin;
  const tokens = new Set(sandbox.trim().split(/\s+/).filter(Boolean));
  return tokens.has("allow-same-origin") ? url.origin : "*";
}

/**
 * A `FeatureModule` backed by a cross-origin iframe. Drop it into
 * `createOnDemandFeature({ loadModule })` when you need `loadData`, a custom
 * cache key, or your own render step; use {@link iframeFeature} otherwise.
 */
export function iframeModule<Events extends FrameEventMap = FrameEventMap>(
  src: string,
  options: IframeModuleOptions<Events>,
): FeatureModule {
  const url = new URL(src, typeof location === "undefined" ? "http://localhost" : location.href);
  const targetOrigin = targetOriginFor(url, options.sandbox);
  prefetchDocument(url.href);
  const frames = new WeakMap<HTMLElement, Frame>();

  return {
    mount(container, props) {
      clearPlaceholders(container);
      const placeholderAbort = options.placeholderUrl ? new AbortController() : undefined;
      let clearPlaceholder: (() => void) | undefined;
      if (options.placeholder !== undefined) {
        clearPlaceholder = showPlaceholder(container, options.placeholder);
      } else if (options.placeholderUrl) {
        clearPlaceholder = showPlaceholder(container, "Loading…");
        void showPlaceholderFromUrl(container, options.placeholderUrl, {
          signal: placeholderAbort?.signal,
        }).then((clearFetched) => {
          if (placeholderAbort?.signal.aborted) {
            clearFetched?.();
            return;
          }
          if (!clearFetched) return;
          clearPlaceholder?.();
          clearPlaceholder = clearFetched;
          const live = frames.get(container);
          if (live) live.clearPlaceholder = clearFetched;
        });
      }

      const el = document.createElement("iframe");
      el.title = options.title;
      el.style.cssText = "display:block;width:100%;border:0";
      if (options.sandbox !== undefined) el.setAttribute("sandbox", options.sandbox);
      if (options.allow !== undefined) el.setAttribute("allow", options.allow);
      container.append(el);

      const frame: Frame = {
        el,
        props,
        ready: false,
        clearPlaceholder,
        placeholderAbort,
        pendingEvents: [],
      };
      const [handle] = iframeResize(
        {
          direction: options.direction,
          offsetSize: options.offsetSize,
          warningTimeout: options.warningTimeout,
          // The child tells us when it is listening. Sizing cannot be the
          // signal: nothing is mounted in the frame yet, so it measures zero,
          // and a zero size is never reported — waiting on `ready` deadlocks.
          //
          // resize-iframe has already matched `event.source` against this
          // frame's `contentWindow`, so anything arriving here came from the
          // frame we created and nowhere else.
          onMessage: ({ message }) => {
            if (message === FRAME_READY) {
              if (frame.ready) return;
              frame.ready = true;
              clearTimeout(frame.readyTimer);
              frame.placeholderAbort?.abort();
              frame.clearPlaceholder?.();
              frame.clearPlaceholder = undefined;
              send(frame, targetOrigin, frame.props);
              for (const envelope of frame.pendingEvents.splice(0)) {
                frame.handle?.sendMessage(envelope, targetOrigin);
              }
              return;
            }
            frame.receive?.(message);
          },
        },
        el,
      );
      frame.handle = handle;

      if (options.channel) {
        const { connect, ...channelOptions } = options.channel;
        const { channel, receive } = createFrameChannel<Events>((envelope) => {
          if (frame.ready) frame.handle?.sendMessage(envelope, targetOrigin);
          else frame.pendingEvents.push(envelope);
        }, channelOptions);
        frame.receive = receive;
        frame.disconnect = connect(channel) ?? undefined;
      }

      frames.set(container, frame);

      const timeout = options.readyTimeout ?? 10_000;
      if (timeout > 0) {
        frame.readyTimer = setTimeout(() => {
          if (frame.ready) return;
          const error = new Error(
            `[mountly] iframe at ${url.href} did not report ready within ${timeout}ms. ` +
              "The page may have failed to load, been blocked by CSP, thrown before " +
              "mountAsFrame, or not be loading resize-iframe-child.js.",
          );
          if (options.onError) options.onError(error);
          else console.error(error);
        }, timeout);
      }

      // Navigate last, so the message listener is live before the child loads.
      el.src = url.href;
    },

    update(container, props) {
      const frame = frames.get(container);
      if (!frame) return;
      // Held either way: an update before the handshake is picked up by it.
      frame.props = props;
      if (frame.ready) send(frame, targetOrigin, props);
    },

    unmount(container) {
      const frame = frames.get(container);
      if (!frame) return;
      clearTimeout(frame.readyTimer); // or a torn-down frame still reports a timeout
      frame.placeholderAbort?.abort();
      frame.pendingEvents.length = 0;
      frame.clearPlaceholder?.();
      frame.disconnect?.();
      frame.handle?.disconnect(); // before removal, or the message listener leaks
      frame.el.remove();
      clearPlaceholders(container);
      frames.delete(container);
    },
  };
}

/**
 * An on-demand feature whose widget runs in a cross-origin iframe. Same
 * triggers, lifecycle and custom-element wiring as a `moduleUrl` feature.
 *
 * ```ts
 * const billing = iframeFeature({
 *   moduleId: "billing",
 *   src: "https://billing.acme.com/widget",
 *   title: "Billing breakdown",
 *   sandbox: "allow-scripts",
 * });
 * registerCustomElement("billing", () => billing);
 * ```
 */
export function iframeFeature<Events extends FrameEventMap = FrameEventMap>({
  moduleId,
  src,
  ...options
}: IframeFeatureOptions<Events>): OnDemandFeature {
  return createOnDemandFeature({
    moduleId,
    loadModule: async () => iframeModule<Events>(src, options),
  });
}

export { FRAME_CONTRACT_VERSION } from "./frame-channel.js";
export type { FrameChannel, FrameChannelOptions, FrameEventMap } from "./frame-channel.js";

export {
  OVERLAY_OPEN,
  OVERLAY_CLOSE,
  OVERLAY_CLOSED,
  bindFrameOverlay,
  openHostOverlay,
  closeHostOverlay,
  frameOverlayValidators,
  isOverlayOpenPayload,
  isOverlayClosePayload,
  type FrameOverlayEvents,
  type OverlayOpenPayload,
  type OverlayClosePayload,
  type BindFrameOverlayOptions,
  type OverlayHostChannel,
  type OverlayFrameChannel,
} from "./frame-overlay.js";

export {
  HISTORY_NAVIGATE,
  HISTORY_SYNC,
  bindFrameHistory,
  bindFrameHistoryToRouter,
  syncFrameHistory,
  requestHostNavigation,
  readHistorySyncPayload,
  historySyncFromRoute,
  frameHistoryValidators,
  isHistoryNavigatePayload,
  isHistorySyncPayload,
  type FrameHistoryEvents,
  type HistoryNavigatePayload,
  type HistorySyncPayload,
  type BindFrameHistoryOptions,
  type HistoryHostChannel,
  type HistoryFrameChannel,
} from "./frame-history.js";

export {
  showPlaceholder,
  clearPlaceholders,
  showPlaceholderFromUrl,
  type PlaceholderSource,
} from "./placeholder.js";
