import { moduleCache, dataCache } from "./cache.js";
import { createModuleLoader, type CssAutoLoadOptions } from "./assets.js";
import type { TriggerType } from "./triggers.js";
import { createFeatureTimingTracker } from "./analytics.js";

export interface FeatureContext {
  element: HTMLElement;
  event?: Event;
  triggerType: TriggerType;
  [key: string]: unknown;
}

export interface FeatureModule {
  mount: (container: HTMLElement, props: Record<string, unknown>) => void;
  unmount?: (container: HTMLElement) => void;
  update?: (container: HTMLElement, props: Record<string, unknown>) => void;
  refresh?: (container: HTMLElement, props: Record<string, unknown>) => void;
  [key: string]: unknown;
}

export interface CreateOnDemandFeatureOptions {
  moduleId: string;
  moduleExport?: string;
  moduleUrl?: string;
  assetOptions?: CssAutoLoadOptions;
  loadModule?: () => Promise<unknown>;
  loadData?: (context: FeatureContext) => Promise<unknown>;
  getCacheKey?: (context: FeatureContext) => string;
  render?: (args: {
    mod: FeatureModule;
    data: unknown;
    context: FeatureContext;
    container: HTMLElement;
    props: Record<string, unknown>;
  }) => void;
}

export type FeatureState =
  | "idle"
  | "preloading"
  | "preloaded"
  | "activating"
  | "activated"
  | "mounted"
  | "aborted";

export interface OnDemandFeature {
  readonly id: string;
  preload: (context?: Partial<FeatureContext>) => Promise<void>;
  activate: (context?: Partial<FeatureContext>) => Promise<void>;
  mount: (
    container: HTMLElement,
    context?: Partial<FeatureContext>,
    props?: Record<string, unknown>,
  ) => Promise<{ unmount: () => void }>;
  update: (
    container: HTMLElement,
    props: Record<string, unknown>,
    context?: Partial<FeatureContext>,
  ) => Promise<void>;
  refresh: (
    container: HTMLElement,
    context?: Partial<FeatureContext>,
    props?: Record<string, unknown>,
  ) => Promise<void>;
  abort: () => void;
  getState: () => FeatureState;
  isAborted: () => boolean;
  getMounts: () => ReadonlyArray<HTMLElement>;
}

function resolveFeatureModule(
  moduleId: string,
  value: unknown,
  moduleExport?: string,
): FeatureModule {
  const exports = value as Record<string, unknown> | null;
  const candidate =
    moduleExport && exports && typeof exports === "object" && moduleExport in exports
      ? exports[moduleExport]
      : ((value as { default?: unknown })?.default ?? value);
  if (
    candidate &&
    typeof candidate === "object" &&
    typeof (candidate as { mount?: unknown }).mount === "function"
  ) {
    return candidate as FeatureModule;
  }
  const keys =
    value && typeof value === "object" ? Object.keys(value as Record<string, unknown>) : [];
  throw new Error(
    `[mountly:MNTX001] invalid widget module for "${moduleId}". ` +
      `Expected \`mount(container, props)\` on module${
        moduleExport ? `, module.${moduleExport},` : ""
      } or module.default. ` +
      `Received type=${typeof value}, keys=[${keys.join(", ")}].`,
  );
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

function defaultCacheKey(moduleId: string, context: FeatureContext): string {
  const { element: _e, event: _ev, ...rest } = context;
  void _e;
  void _ev;
  return `${moduleId}:${stableStringify(rest)}`;
}

const isAbortError = (e: unknown): boolean => e instanceof DOMException && e.name === "AbortError";

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

export function createOnDemandFeature(options: CreateOnDemandFeatureOptions): OnDemandFeature {
  const { moduleId, moduleUrl, moduleExport, assetOptions, loadData } = options;
  if (!options.loadModule && !moduleUrl) {
    throw new Error(
      `[mountly] createOnDemandFeature("${moduleId}"): provide either \`moduleUrl\` (recommended) or \`loadModule\`.`,
    );
  }
  const loadModule =
    options.loadModule || createModuleLoader(moduleUrl as string, assetOptions ?? { css: "none" });
  const render =
    options.render ||
    (({ mod, container, props }) => {
      const merged = moduleUrl ? { ...props, moduleUrl } : props;
      mod.mount(container, merged);
    });
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
              const mod = await loadModule();
              return resolveFeatureModule(moduleId, mod, moduleExport);
            } catch (err) {
              if (isAbortError(err)) throw err;
              throw wrapModuleLoadError(moduleId, err);
            }
          },
          { signal },
        )
        .then(
          (m) => m as FeatureModule,
          (err) => {
            modulePromise = null;
            throw err;
          },
        ) as Promise<FeatureModule>;
    }
    loadedModule = await modulePromise;
    return loadedModule!;
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
      { signal },
    );
  };

  const buildContext = (
    partial?: Partial<FeatureContext>,
    fallbackElement?: HTMLElement,
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

  const preload = async (contextInput?: Partial<FeatureContext>): Promise<void> => {
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

  const activate = async (contextInput?: Partial<FeatureContext>): Promise<void> => {
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
    props?: Record<string, unknown>,
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

    if (mounts.has(container)) {
      try {
        mod.unmount?.(container);
      } catch (err) {
        console.error(`[mountly] remount(${moduleId}) cleanup failed:`, err);
      }
    }

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
    // Expose feature-owned unmount on the container so safeUnmount() and
    // widget onClose handlers route through full teardown.
    (container as HTMLElement & { _unmount?: () => void })._unmount = unmount;

    return { unmount };
  };

  const update = async (
    container: HTMLElement,
    props: Record<string, unknown>,
    contextInput?: Partial<FeatureContext>,
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

  const refresh = async (
    container: HTMLElement,
    contextInput?: Partial<FeatureContext>,
    props?: Record<string, unknown>,
  ): Promise<void> => {
    if (!mounts.has(container)) return;
    const mod = loadedModule;
    if (mod?.refresh) {
      try {
        mod.refresh(container, props ?? {});
      } catch (err) {
        console.error(`[mountly] refresh(${moduleId}) failed:`, err);
      }
      return;
    }
    await update(container, props ?? {}, contextInput);
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
    refresh,
    abort,
    getState,
    isAborted,
    getMounts,
  };
}
