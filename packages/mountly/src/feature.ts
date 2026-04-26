import { moduleCache, dataCache } from "./cache.js";
import {
  setupTrigger,
  type TriggerType,
  type TriggerOptions,
} from "./triggers.js";
import { createFeatureTimingTracker } from "./analytics.js";
import {
  createUrlChangeTrigger,
  type UrlChangeTriggerOptions,
} from "./plugins.js";

export interface FeatureContext {
  element: HTMLElement;
  event?: Event;
  triggerType: TriggerType;
  [key: string]: unknown;
}

export interface FeatureModule {
  mount: (container: HTMLElement, props: Record<string, unknown>) => void;
  unmount?: (container: HTMLElement) => void;
  /**
   * Optional: update an already-mounted container with new props, preserving
   * internal state (e.g. React reconciliation). If omitted, `feature.update`
   * falls back to remounting.
   */
  update?: (container: HTMLElement, props: Record<string, unknown>) => void;
  [key: string]: unknown;
}

export interface CreateOnDemandFeatureOptions {
  moduleId: string;
  loadModule: () => Promise<FeatureModule>;
  loadData?: (context: FeatureContext) => Promise<unknown>;
  /**
   * Build a stable cache key for `loadData` from a context. The default
   * excludes `element` and `event` (non-serializable) and uses sorted JSON
   * of the remaining fields. Override if you want coarser caching or your
   * context includes non-serializable values.
   */
  getCacheKey?: (context: FeatureContext) => string;
  render: (args: {
    mod: FeatureModule;
    data: unknown;
    context: FeatureContext;
    container: HTMLElement;
    props: Record<string, unknown>;
  }) => void;
}

export interface AttachOptions {
  /** Element the user interacts with (hover/click target). */
  trigger: HTMLElement;
  /** Container to render into. Defaults to `trigger`. */
  mount?: HTMLElement;
  /** Static context or a getter called at activation time. */
  context?: Partial<FeatureContext> | (() => Partial<FeatureContext>);
  /** Extra props forwarded to `render`. A getter is called at each mount. */
  props?: Record<string, unknown> | (() => Record<string, unknown>);
  /** When to start preloading. `false` to disable. Default `"hover"`. */
  preloadOn?: "hover" | "viewport" | "idle" | "media" | false;
  /** When to mount. Default `"click"`. */
  activateOn?:
    | "click"
    | "hover"
    | "focus"
    | "viewport"
    | "idle"
    | "media"
    | "url-change";
  /**
   * URL events to listen for when `activateOn` is `"url-change"`.
   * Defaults to all: `popstate`, `hashchange`, `pushstate`, `replacestate`.
   */
  activateOnUrlEvents?: UrlChangeTriggerOptions["events"];
  /** Media query string used when `preloadOn` is `"media"`. */
  preloadOnMediaQuery?: string;
  /** Media query string used when `activateOn` is `"media"`. */
  activateOnMediaQuery?: string;
  /** `requestIdleCallback` timeout used when `preloadOn`/`activateOn` is `"idle"`. */
  idleTimeout?: number;
  /** Optional viewport root margin used for viewport-based triggers. */
  viewportRootMargin?: string;
  /** If true (default), a second `activateOn` event unmounts the feature. */
  toggle?: boolean;
  onMount?: (api: { unmount: () => void }) => void;
  onUnmount?: () => void;
  onError?: (err: unknown) => void;
}

export interface OnDemandFeature {
  /** The `moduleId` this feature was created with. */
  readonly id: string;
  preload: (context?: Partial<FeatureContext>) => Promise<void>;
  activate: (context?: Partial<FeatureContext>) => Promise<void>;
  mount: (
    container: HTMLElement,
    context?: Partial<FeatureContext>,
    props?: Record<string, unknown>
  ) => Promise<{ unmount: () => void }>;
  /**
   * Update props for an already-mounted container, preserving internal state
   * when the widget's module exposes `update()`. If not mounted, this is a
   * no-op; if the module has no `update`, it remounts as a fallback.
   */
  update: (
    container: HTMLElement,
    props: Record<string, unknown>,
    context?: Partial<FeatureContext>
  ) => Promise<void>;
  /** Wire trigger + mount in one call. Returns a cleanup function. */
  attach: (options: AttachOptions) => () => void;
  abort: () => void;
  getState: () => FeatureState;
  isAborted: () => boolean;
  /** Currently active mount containers. */
  getMounts: () => ReadonlyArray<HTMLElement>;
}

export type FeatureState =
  | "idle"
  | "preloading"
  | "preloaded"
  | "activating"
  | "activated"
  | "mounted"
  | "aborted";

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k]))
      .join(",") +
    "}"
  );
}

function defaultCacheKey(
  moduleId: string,
  context: FeatureContext
): string {
  const { element: _e, event: _ev, ...rest } = context;
  void _e;
  void _ev;
  return `${moduleId}:${stableStringify(rest)}`;
}

const isAbortError = (e: unknown): boolean =>
  e instanceof DOMException && e.name === "AbortError";

function describeArg(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  return typeof value;
}

// Common dynamic-import failure modes the browser throws when an import map
// is missing or wrong. Catching the message text is brittle long-term but
// the alternative is silent confusion for first-time users.
const isModuleResolutionError = (e: unknown): boolean => {
  if (!(e instanceof Error)) return false;
  const msg = e.message;
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Failed to resolve module specifier") ||
    msg.includes("bare specifier") ||
    msg.includes("Cannot find module") ||
    msg.includes("does not provide an export")
  );
};

function wrapModuleLoadError(moduleId: string, err: unknown): Error {
  if (!isModuleResolutionError(err)) return err as Error;
  const original = err as Error;
  const wrapped = new Error(
    `[mountly] loadModule for "${moduleId}" failed to resolve. ` +
      `If you're in plain HTML, check that your <script type="importmap"> maps the bare specifier — ` +
      `e.g. { "imports": { "${moduleId}": "/path/to/${moduleId}/dist/index.js" } } — and that installRuntime() runs before any module imports. ` +
      `Original: ${original.message}`,
  );
  (wrapped as Error & { cause?: unknown }).cause = original;
  return wrapped;
}

export function createOnDemandFeature(
  options: CreateOnDemandFeatureOptions
): OnDemandFeature {
  const { moduleId, loadModule, loadData, render } = options;
  const getCacheKey = options.getCacheKey
    ? options.getCacheKey
    : (ctx: FeatureContext) => defaultCacheKey(moduleId, ctx);

  let state: FeatureState = "idle";
  let loadedModule: FeatureModule | null = null;
  let modulePromise: Promise<FeatureModule> | null = null;
  let abortController: AbortController | null = null;
  const mounts = new Map<HTMLElement, FeatureContext>();

  const tracker = createFeatureTimingTracker(moduleId);

  const setState = (next: FeatureState) => {
    state = next;
  };

  const getAbortSignal = (): AbortSignal => {
    if (!abortController || abortController.signal.aborted) {
      abortController = new AbortController();
    }
    return abortController.signal;
  };

  const ensureModule = async (): Promise<FeatureModule> => {
    if (loadedModule) return loadedModule;
    if (!modulePromise) {
      const signal = getAbortSignal();
      modulePromise = moduleCache
        .resolve(
          moduleId,
          async () => {
            if (signal.aborted) {
              throw new DOMException("Aborted", "AbortError");
            }
            try {
              return await loadModule();
            } catch (err) {
              if (isAbortError(err)) throw err;
              throw wrapModuleLoadError(moduleId, err);
            }
          },
          { signal }
        )
        .then(
          (m) => m as FeatureModule,
          (err) => {
            modulePromise = null;
            throw err;
          }
        );
    }
    loadedModule = await modulePromise;
    return loadedModule;
  };

  const ensureData = async (context: FeatureContext): Promise<unknown> => {
    if (!loadData) return null;
    const key = getCacheKey(context);
    const signal = getAbortSignal();
    return dataCache.resolve(
      key,
      async () => {
        if (signal.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        return loadData(context);
      },
      { signal }
    );
  };

  const buildContext = (
    partial?: Partial<FeatureContext>,
    fallbackElement?: HTMLElement
  ): FeatureContext => {
    return {
      element:
        partial?.element ??
        fallbackElement ??
        (typeof document !== "undefined" ? document.body : (null as never)),
      triggerType: (partial?.triggerType ?? "programmatic") as TriggerType,
      ...partial,
    } as FeatureContext;
  };

  const recoverFromAborted = () => {
    if (state === "aborted") {
      abortController = null;
      setState("idle");
    }
  };

  const preload = async (
    contextInput?: Partial<FeatureContext>
  ): Promise<void> => {
    if (
      state === "preloading" ||
      state === "preloaded" ||
      state === "activated" ||
      state === "mounted"
    ) {
      return;
    }
    recoverFromAborted();
    tracker.recordPhase("preload_start");
    setState("preloading");
    try {
      await ensureModule();
      if (contextInput) {
        await ensureData(buildContext(contextInput));
      }
      // Only advance to "preloaded" if no other path moved us forward.
      // (Cast through `string` because the early-return narrows TS's view.)
      if ((state as string) === "preloading") setState("preloaded");
      tracker.recordPhase("preload_end");
    } catch (error) {
      if (isAbortError(error)) {
        if ((state as string) === "preloading") setState("aborted");
        tracker.recordPhase("preload_end", { error: "Aborted" });
        return;
      }
      if ((state as string) === "preloading") setState("idle");
      tracker.recordPhase("preload_end", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  const activate = async (
    contextInput?: Partial<FeatureContext>
  ): Promise<void> => {
    recoverFromAborted();
    const context = buildContext(contextInput);
    const wasMounted = state === "mounted";
    if (!wasMounted) setState("activating");
    tracker.recordPhase("activate_start");
    try {
      await ensureModule();
      await ensureData(context);
      if (!wasMounted) setState("activated");
      tracker.recordPhase("activate_end");
    } catch (error) {
      if (isAbortError(error)) {
        if (!wasMounted) setState("aborted");
        tracker.recordPhase("activate_end", { error: "Aborted" });
        return;
      }
      if (!wasMounted) setState("idle");
      tracker.recordPhase("activate_end", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  const mount = async (
    container: HTMLElement,
    contextInput?: Partial<FeatureContext>,
    props?: Record<string, unknown>
  ): Promise<{ unmount: () => void }> => {
    recoverFromAborted();
    const context = buildContext(contextInput, container);
    tracker.recordPhase("mount_start");

    try {
      await ensureModule();
      await ensureData(context);
    } catch (error) {
      tracker.recordPhase("mount_end", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    const mod = loadedModule!;
    const data = loadData ? dataCache.get(getCacheKey(context)) : null;

    render({
      mod,
      data,
      context,
      container,
      props: props ?? {},
    });

    mounts.set(container, context);
    setState("mounted");
    tracker.recordPhase("mount_end");

    let unmounted = false;
    // Expose the feature-owned unmount on the container so helpers like
    // `safeUnmount()` (and widget onClose handlers) route through the
    // feature's full teardown: widget unmount → focus restore → state transition.
    (container as HTMLElement & { _unmount?: () => void })._unmount = () => {
      unmount();
    };
    const unmount = () => {
      if (unmounted) return;
      unmounted = true;
      try {
        loadedModule?.unmount?.(container);
      } catch (err) {
        console.error(`[mountly] unmount(${moduleId}) failed:`, err);
      }
      mounts.delete(container);
      if (mounts.size === 0) {
        setState(loadedModule ? "activated" : "idle");
      }
      tracker.recordPhase("unmount");
    };

    return { unmount };
  };

  const update = async (
    container: HTMLElement,
    props: Record<string, unknown>,
    contextInput?: Partial<FeatureContext>
  ): Promise<void> => {
    if (!mounts.has(container)) return;
    const mod = loadedModule;
    if (mod?.update) {
      try {
        mod.update(container, props);
      } catch (err) {
        console.error(`[mountly] update(${moduleId}) failed:`, err);
      }
      return;
    }
    // Fallback: remount in place. Preserves container, loses widget-internal state.
    const context = buildContext(contextInput, container);
    const data = loadData ? dataCache.get(getCacheKey(context)) : null;
    render({
      mod: mod!,
      data,
      context,
      container,
      props,
    });
  };

  const attach = (opts: AttachOptions): (() => void) => {
    if (!(opts?.trigger instanceof Element)) {
      throw new Error(
        `[mountly] attach({ trigger }) for "${moduleId}" got ${describeArg(opts?.trigger)} ` +
          `instead of an Element. Common cause: document.getElementById("...") returned null. ` +
          `Check the element exists in the DOM at the time attach() runs (e.g. defer until DOMContentLoaded).`,
      );
    }
    if (opts.mount !== undefined && !(opts.mount instanceof Element)) {
      throw new Error(
        `[mountly] attach({ mount }) for "${moduleId}" got ${describeArg(opts.mount)} ` +
          `instead of an Element. Pass an HTMLElement to mount into, or omit the option to mount inside the trigger.`,
      );
    }

    const {
      trigger,
      mount: mountEl = trigger,
      context,
      props,
      preloadOn = "hover",
      activateOn = "click",
      activateOnUrlEvents,
      preloadOnMediaQuery,
      activateOnMediaQuery,
      idleTimeout,
      viewportRootMargin,
      toggle = true,
      onMount,
      onUnmount,
      onError,
    } = opts;

    const cleanups: Array<() => void> = [];
    let active: { unmount: () => void } | null = null;
    let pending = false;

    const resolveContext = (): Partial<FeatureContext> => {
      if (typeof context === "function") return context();
      return context ?? {};
    };

    const resolveProps = (): Record<string, unknown> | undefined => {
      if (typeof props === "function") return props();
      return props;
    };

    if (preloadOn) {
      if (preloadOn === "media" && !preloadOnMediaQuery) {
        throw new Error(
          `[mountly] attach({ preloadOn: "media" }) for "${moduleId}" requires preloadOnMediaQuery.`,
        );
      }
      const preloadType: TriggerOptions["type"] =
        preloadOn === "hover"
          ? "hover"
          : preloadOn === "viewport"
            ? "viewport"
            : preloadOn === "idle"
              ? "idle"
              : "media";
      cleanups.push(
        setupTrigger(
          {
            type: preloadType,
            element: trigger,
            delay: preloadOn === "hover" ? 100 : 0,
            idleTimeout: preloadOn === "idle" ? idleTimeout : undefined,
            rootMargin: preloadOn === "viewport" ? viewportRootMargin : undefined,
            mediaQuery: preloadOn === "media" ? preloadOnMediaQuery : undefined,
            once: true,
          },
          () => {
            preload(resolveContext()).catch((e) => onError?.(e));
          }
        )
      );
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
      mount(mountEl, resolveContext(), resolveProps())
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

    if (activateOn === "url-change") {
      cleanups.push(
        createUrlChangeTrigger(trigger, onActivate, {
          events:
            activateOnUrlEvents ?? [
              "popstate",
              "hashchange",
              "pushstate",
              "replacestate",
            ],
        }),
      );
    } else {
      if (activateOn === "media" && !activateOnMediaQuery) {
        throw new Error(
          `[mountly] attach({ activateOn: "media" }) for "${moduleId}" requires activateOnMediaQuery.`,
        );
      }
      cleanups.push(
        setupTrigger(
          {
            type: activateOn,
            element: trigger,
            idleTimeout: activateOn === "idle" ? idleTimeout : undefined,
            rootMargin: activateOn === "viewport" ? viewportRootMargin : undefined,
            mediaQuery: activateOn === "media" ? activateOnMediaQuery : undefined,
            once: false,
          },
          onActivate,
        ),
      );
    }

    return () => {
      for (const c of cleanups) c();
      if (active) active.unmount();
    };
  };

  const abort = (): void => {
    if (abortController) abortController.abort();
    abortController = null;
    if (state === "preloading" || state === "activating") {
      setState("aborted");
      tracker.recordPhase("preload_end", { error: "Aborted" });
    }
    modulePromise = null;
  };

  const getState = (): FeatureState => state;
  const isAborted = (): boolean => state === "aborted";
  const getMounts = (): ReadonlyArray<HTMLElement> => Array.from(mounts.keys());

  return {
    id: moduleId,
    preload,
    activate,
    mount,
    update,
    attach,
    abort,
    getState,
    isAborted,
    getMounts,
  };
}
