import type { FeatureContext, OnDemandFeature } from "./feature.js";
import {
  eachClick,
  eachFocus,
  eachHover,
  eachIdle,
  eachMedia,
  eachUrlChange,
  eachViewport,
  type BaseTriggerOptions,
  type TriggerEvent,
  type UrlChangeEventType,
} from "./triggers.js";

/**
 * A trigger source: any function that takes a handler and returns a cleanup.
 * Compose your own, or use the built-in helpers below.
 */
export type TriggerSource = (
  handler: (ev: TriggerEvent) => void,
  opts: BaseTriggerOptions,
) => () => void;

export interface AttachOptions {
  /** Element the user interacts with. Required. */
  trigger: HTMLElement;
  /** Container to render into. Defaults to `trigger`. */
  mount?: HTMLElement;
  /** Optional preload trigger source. Fires once. */
  preloadOn?: TriggerSource;
  /** Optional activate trigger source. Fires repeatedly (toggle). Defaults to click on `trigger`. */
  activateOn?: TriggerSource;
  /** Static context or a getter called at activation time. */
  context?: Partial<FeatureContext> | (() => Partial<FeatureContext>);
  /** Extra props forwarded to render. A getter is called at each mount. */
  props?: Record<string, unknown> | (() => Record<string, unknown>);
  /** If true (default), a second activate event unmounts the feature. */
  toggle?: boolean;
  onMount?: (api: { unmount: () => void }) => void;
  onUnmount?: () => void;
  onError?: (err: unknown) => void;
}

const describeArg = (value: unknown): string => {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  return typeof value;
};

/**
 * Wire a feature to one or two trigger sources. Returns a cleanup function.
 *
 * Example:
 *   import { attach, onTrigger } from "mountly/attach";
 *   import { eachClick, eachHover } from "mountly/triggers";
 *
 *   attach(feature, {
 *     trigger: button,
 *     mount: panel,
 *     preloadOn: onTrigger.hover(button),   // pre-built source
 *     activateOn: onTrigger.click(button),
 *   });
 */
export function attach(feature: OnDemandFeature, opts: AttachOptions): () => void {
  if (!(opts?.trigger instanceof Element)) {
    throw new Error(
      `[mountly] attach({ trigger }) for "${feature.id}" got ${describeArg(
        opts?.trigger,
      )} instead of an Element. Common cause: document.getElementById("...") returned null. ` +
        `Check the element exists in the DOM at the time attach() runs (e.g. defer until DOMContentLoaded).`,
    );
  }
  if (opts.mount !== undefined && !(opts.mount instanceof Element)) {
    throw new Error(
      `[mountly] attach({ mount }) for "${feature.id}" got ${describeArg(
        opts.mount,
      )} instead of an Element. Pass an HTMLElement to mount into, or omit to mount inside the trigger.`,
    );
  }

  const mountEl = opts.mount ?? opts.trigger;
  const toggle = opts.toggle ?? true;
  const onError = opts.onError;
  const onMount = opts.onMount;
  const onUnmount = opts.onUnmount;

  const resolveContext = (): Partial<FeatureContext> => {
    if (typeof opts.context === "function") return opts.context();
    return opts.context ?? {};
  };
  const resolveProps = (): Record<string, unknown> | undefined => {
    if (typeof opts.props === "function") return opts.props();
    return opts.props;
  };

  const cleanups: Array<() => void> = [];
  let active: { unmount: () => void } | null = null;
  let pending = false;

  if (opts.preloadOn) {
    let fired = false;
    let stop: () => void = () => {};
    stop = opts.preloadOn((ev) => {
      void ev;
      if (fired) return;
      fired = true;
      stop();
      feature.preload(resolveContext()).catch((e) => onError?.(e));
    }, {});
    cleanups.push(stop);
  }

  const onActivate = () => {
    if (pending) return;
    if (active) {
      if (toggle) {
        active.unmount();
        active = null;
        onUnmount?.();
      }
      return;
    }
    pending = true;
    feature
      .mount(mountEl, resolveContext(), resolveProps())
      .then((handle) => {
        const wrapped = {
          unmount: () => {
            handle.unmount();
            if (active === wrapped) {
              active = null;
              onUnmount?.();
            }
          },
        };
        active = wrapped;
        onMount?.(wrapped);
      })
      .catch((e) => onError?.(e))
      .finally(() => {
        pending = false;
      });
  };

  const activateSource = opts.activateOn ?? onTrigger.click(opts.trigger);
  cleanups.push(activateSource(onActivate, {}));

  return () => {
    for (const c of cleanups) c();
    if (active) active.unmount();
  };
}

/**
 * Pre-built trigger sources for common cases. Each is a thin curry over the
 * `each*` primitives in `mountly/triggers`. Compose with `attach({ activateOn })`.
 */
export const onTrigger = {
  click:
    (el: HTMLElement): TriggerSource =>
    (handler, opts) =>
      eachClick(el, handler, opts),
  hover:
    (el: HTMLElement, params?: { delay?: number }): TriggerSource =>
    (handler, opts) =>
      eachHover(el, handler, { ...opts, delay: params?.delay }),
  focus:
    (el: HTMLElement): TriggerSource =>
    (handler, opts) =>
      eachFocus(el, handler, opts),
  viewport:
    (el: HTMLElement, params?: { rootMargin?: string; threshold?: number }): TriggerSource =>
    (handler, opts) =>
      eachViewport(el, handler, {
        ...opts,
        rootMargin: params?.rootMargin,
        threshold: params?.threshold,
      }),
  idle:
    (params?: { timeout?: number }): TriggerSource =>
    (handler, opts) =>
      eachIdle(handler, { ...opts, timeout: params?.timeout }),
  media:
    (query: string): TriggerSource =>
    (handler, opts) =>
      eachMedia(query, handler, opts),
  urlChange:
    (params?: { events?: UrlChangeEventType[] }): TriggerSource =>
    (handler, opts) =>
      eachUrlChange(handler, { ...opts, events: params?.events }),
};
