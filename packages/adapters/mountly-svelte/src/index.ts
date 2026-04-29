import {
  attachShadow,
  loadCssText,
  resolveCssUrl,
  type AdapterOptions,
  type WidgetModule,
} from "mountly";

// Svelte 4: legacy class component — `new Component({ target, props })`
// returns an instance with a `$destroy()` method.
interface SvelteLegacyInstance {
  $destroy?: () => void;
}
interface SvelteLegacyCtor<P> {
  new (options: { target: Element; props?: P }): SvelteLegacyInstance;
}

// Svelte 5: functional component — Svelte's `mount()` returns the runtime's
// "exports" record; `unmount()` is imported separately from `svelte`. Adapter
// users hand us the component module's default export (a function in v5,
// a class in v4) and we dispatch on shape.
type SvelteV5Component<P> = (target: Element, props?: P) => unknown;
type SvelteV5Mount = <P>(
  Component: SvelteV5Component<P>,
  options: { target: Element; props?: P },
) => Record<string, unknown>;
type SvelteV5Unmount = (handle: Record<string, unknown>) => void | Promise<void>;

type SvelteAnyComponent<P> = SvelteLegacyCtor<P> | SvelteV5Component<P>;

interface SvelteWidgetOptions extends AdapterOptions {
  /**
   * URL to the component's JavaScript bundle. Used to derive the CSS URL
   * if `cssUrl` is not provided (e.g., "/dist/index.js" -> "/dist/index.css").
   */
  moduleUrl?: string;
  /**
   * URL to the component's CSS file. If not provided, derived from
   * `moduleUrl` (replaces ".js" with ".css").
   */
  cssUrl?: string;
  /**
   * Svelte 5's `mount` and `unmount`, imported from "svelte" by the consumer
   * and passed in. Required for Svelte 5 components. Omit for Svelte 4 — the
   * adapter detects the legacy class API automatically.
   */
  mount?: SvelteV5Mount;
  unmount?: SvelteV5Unmount;
}

let cachedSvelteRuntime:
  | { mount: SvelteV5Mount; unmount: SvelteV5Unmount }
  | null = null;

async function getSvelteRuntime(): Promise<{
  mount: SvelteV5Mount;
  unmount: SvelteV5Unmount;
}> {
  if (cachedSvelteRuntime) return cachedSvelteRuntime;
  let runtime: typeof import("svelte");
  try {
    runtime = await import("svelte");
  } catch (error) {
    const wrapped = new Error(
      "[mountly-svelte] Could not import `svelte` runtime for a Svelte 5 component. " +
        "In plain HTML, map `svelte` in your import map; in bundled apps, ensure `svelte` is installed and resolvable.",
    );
    (wrapped as Error & { cause?: unknown }).cause = error;
    throw wrapped;
  }
  if (typeof runtime.mount !== "function" || typeof runtime.unmount !== "function") {
    throw new Error(
      "[mountly-svelte] Failed to load `mount`/`unmount` from `svelte`. " +
        "Make sure your app installs a Svelte 5 runtime.",
    );
  }
  cachedSvelteRuntime = {
    mount: runtime.mount as unknown as SvelteV5Mount,
    unmount: runtime.unmount as unknown as SvelteV5Unmount,
  };
  return cachedSvelteRuntime;
}

interface ActiveInstance {
  legacy?: SvelteLegacyInstance;
  v5?: { handle: Record<string, unknown>; unmount: SvelteV5Unmount };
}

// Svelte 5 components are plain functions; Svelte 4 components are classes.
// Classes have a non-empty prototype and were created with `class { … }`,
// which sets `prototype.constructor !== Function`. The cheap heuristic:
// a class's `.prototype` has more than `constructor` on it, while an arrow
// function has `prototype === undefined` and a normal function's prototype is
// just `{ constructor }`. Real Svelte 5 components are exported as functions
// without a meaningful prototype.
function isLegacyClass<P>(
  Component: SvelteAnyComponent<P>,
): Component is SvelteLegacyCtor<P> {
  if (typeof Component !== "function") return false;
  const proto = (Component as { prototype?: object }).prototype;
  if (!proto) return false;
  // Class prototypes are non-writable; function prototypes are writable.
  const desc = Object.getOwnPropertyDescriptor(Component, "prototype");
  return desc?.writable === false;
}

export function createWidget<P>(
  Component: SvelteAnyComponent<P>,
  options: SvelteWidgetOptions = {},
): WidgetModule {
  const instances = new WeakMap<Element, ActiveInstance>();
  const { mount: svelteMount, unmount: svelteUnmount, moduleUrl, cssUrl } = options;

  function unmount(container: Element): void {
    const existing = instances.get(container);
    if (!existing) return;
    if (existing.legacy?.$destroy) {
      existing.legacy.$destroy();
    } else if (existing.v5) {
      void existing.v5.unmount(existing.v5.handle);
    }
    instances.delete(container);
  }

  // Returns a promise iff async work was needed (Svelte 5 runtime import).
  // Sync return path keeps tests/hosts that don't await mount() working.
  function mountWith(
    container: Element,
    props: Record<string, unknown> | undefined,
    fetched: string | undefined,
  ): void | Promise<void> {
    if (options.reserveSize) {
      (container as HTMLElement).style.cssText += `;${options.reserveSize}`;
    }
    const target = attachShadow(
      container,
      fetched ? { ...options, styles: fetched } : options,
    );
    if (isLegacyClass(Component)) {
      const instance = new Component({ target, props: props as P });
      instances.set(container, { legacy: instance });
      return;
    }
    if (svelteMount && svelteUnmount) {
      const handle = svelteMount(Component as SvelteV5Component<P>, {
        target,
        props: props as P,
      });
      instances.set(container, { v5: { handle, unmount: svelteUnmount } });
      return;
    }
    return getSvelteRuntime().then((runtime) => {
      const handle = runtime.mount(Component as SvelteV5Component<P>, {
        target,
        props: props as P,
      });
      instances.set(container, { v5: { handle, unmount: runtime.unmount } });
    });
  }

  return {
    mount(container, props) {
      unmount(container);
      const cssUrlFromProps = (props as Record<string, unknown>)?.cssUrl as string | undefined;
      const moduleUrlFromProps = (props as Record<string, unknown>)?.moduleUrl as string | undefined;
      const cssUrlResolved = resolveCssUrl({
        cssUrlOption: cssUrl,
        moduleUrlOption: moduleUrl,
        cssUrlProp: cssUrlFromProps,
        moduleUrlProp: moduleUrlFromProps,
      });
      const propsRecord = props as Record<string, unknown> | undefined;
      // Fast path: no CSS to fetch — stay synchronous when possible so
      // hosts that don't await mount() and synchronously inspect the
      // shadow root keep working. Svelte 5 with auto-runtime still needs
      // to wait for the dynamic import; in that case mountWith returns a
      // promise we forward.
      if (!cssUrlResolved) {
        return mountWith(container, propsRecord, undefined);
      }
      return loadCssText(cssUrlResolved).then(
        (css) => mountWith(container, propsRecord, css || undefined),
      );
    },
    update(container, props) {
      // Svelte parity path: remount with next props.
      return this.mount(container, props);
    },
    unmount,
  };
}
