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
  createOnDemandFeature,
  type CreateOnDemandFeatureOptions,
  type FeatureModule,
  type OnDemandFeature,
} from "./feature.js";

/** Handshake the framed page sends once it is listening for props. */
export { FRAME_READY };

export interface IframeModuleOptions extends Pick<
  ResizeIframeOptions,
  "direction" | "offsetSize" | "warningTimeout"
> {
  /** Accessible name. An iframe without one is a screen reader dead end, so it is required. */
  title: string;
  /** `sandbox` attribute. A widget needs at least `allow-scripts`. Omit for no sandbox. */
  sandbox?: string;
  /** `allow` attribute, e.g. `storage-access` for a cross-site embed that needs its cookies. */
  allow?: string;
}

export interface IframeFeatureOptions
  extends IframeModuleOptions, Pick<CreateOnDemandFeatureOptions, "moduleId"> {
  /** URL of the framed widget page. */
  src: string;
}

interface Frame {
  el: HTMLIFrameElement;
  handle?: ResizeIframeHandle;
  props: Record<string, unknown>;
  ready: boolean;
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

function send(frame: Frame, origin: string, props: Record<string, unknown>): void {
  try {
    frame.handle?.sendMessage(props, origin);
  } catch (error) {
    const wrapped = new Error(
      "[mountly] iframe props must be structured-clonable — functions, DOM nodes and class " +
        "instances cannot cross the frame boundary. Pass plain data and use events for callbacks.",
    );
    (wrapped as Error & { cause?: unknown }).cause = error;
    throw wrapped;
  }
}

/**
 * A `FeatureModule` backed by a cross-origin iframe. Drop it into
 * `createOnDemandFeature({ loadModule })` when you need `loadData`, a custom
 * cache key, or your own render step; use {@link iframeFeature} otherwise.
 */
export function iframeModule(src: string, options: IframeModuleOptions): FeatureModule {
  const url = new URL(src, typeof location === "undefined" ? "http://localhost" : location.href);
  prefetchDocument(url.href);
  const frames = new WeakMap<HTMLElement, Frame>();

  return {
    mount(container, props) {
      const el = document.createElement("iframe");
      el.title = options.title;
      el.style.cssText = "display:block;width:100%;border:0";
      if (options.sandbox !== undefined) el.setAttribute("sandbox", options.sandbox);
      if (options.allow !== undefined) el.setAttribute("allow", options.allow);
      container.append(el);

      const frame: Frame = { el, props, ready: false };
      const [handle] = iframeResize(
        {
          direction: options.direction,
          offsetSize: options.offsetSize,
          warningTimeout: options.warningTimeout,
          // The child tells us when it is listening. Sizing cannot be the
          // signal: nothing is mounted in the frame yet, so it measures zero,
          // and a zero size is never reported — waiting on `ready` deadlocks.
          onMessage: ({ message }) => {
            if (message !== FRAME_READY) return;
            frame.ready = true;
            send(frame, url.origin, frame.props);
          },
        },
        el,
      );
      frame.handle = handle;
      frames.set(container, frame);

      // Navigate last, so the message listener is live before the child loads.
      el.src = url.href;
    },

    update(container, props) {
      const frame = frames.get(container);
      if (!frame) return;
      // Held either way: an update before the handshake is picked up by it.
      frame.props = props;
      if (frame.ready) send(frame, url.origin, props);
    },

    unmount(container) {
      const frame = frames.get(container);
      if (!frame) return;
      frame.handle?.disconnect(); // before removal, or the message listener leaks
      frame.el.remove();
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
export function iframeFeature({
  moduleId,
  src,
  ...options
}: IframeFeatureOptions): OnDemandFeature {
  return createOnDemandFeature({
    moduleId,
    loadModule: async () => iframeModule(src, options),
  });
}
