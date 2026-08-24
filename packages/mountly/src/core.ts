/**
 * The mountly core: find islands in the DOM, load their widget module when the
 * user shows intent, mount it.
 *
 * Everything here is driven by `data-*` attributes so a server-rendered page
 * needs no JavaScript of its own. The imperative API exists for the cases HTML
 * can't express, and is deliberately three functions wide.
 *
 * ```html
 * <button data-mountly="/widgets/cart.js" data-preload="hover" data-target="#panel">Cart</button>
 * <div id="panel"></div>
 * <script type="module" src="https://unpkg.com/mountly/dist/auto.js"></script>
 * ```
 */

// One widget contract for the whole project — the same one the React, Vue and
// Svelte adapters implement. `adapter.ts` is types only, so this costs nothing.
import type { WidgetModule } from "./adapter.js";
import { importBySpecifier } from "./dynamic-import.js";
export type { WidgetModule };

export interface MountlyOptions {
  /** Where to look for islands. Default `document`. */
  root?: ParentNode;
  /** Alias map so `data-mountly="cart"` resolves to a URL. */
  urls?: Record<string, string>;
  /** Pick up islands added to the DOM later. Default `true`. */
  observe?: boolean;
  /**
   * Replace the import. The single escape hatch: retries, auth headers, a
   * bundler's own `import()`, a test double — all of it lives here instead of
   * as another attribute.
   */
  load?: (url: string) => Promise<unknown>;
}

type State = {
  url: string;
  /** Public bundle URL when the load/cache key is an alias. */
  moduleUrl?: string;
  /** Sibling stylesheet, resolved once at registration. */
  css: string | null;
  target: HTMLElement;
  props: Record<string, unknown>;
  mod?: WidgetModule;
  /**
   * Bumped whenever an island is torn down. An in-flight mount captures the
   * value it started with and stands down if it no longer matches, so
   * unmounting mid-load is not quietly undone when the module arrives.
   */
  run: number;
  /** In-flight mount, so a double click can't mount the widget twice. */
  pending?: Promise<void>;
  stop: Array<() => void>;
};

const states = new WeakMap<HTMLElement, State>();
/**
 * Lifecycle work still unwinding for a mount target. The target is the
 * contested resource: separate trigger elements may intentionally point at the
 * same panel, so keying this by trigger lets one island erase another.
 *
 * Kept outside State because `stop()` replaces the state while its widget may
 * still be working. A re-wired island must wait out that old work too.
 */
const settling = new WeakMap<HTMLElement, Promise<void>>();
const modules = new Map<string, Promise<WidgetModule>>();
const sheets = new Set<string>();

const fail = (message: string) => new Error("[mountly] " + message);

// --- module loading ---------------------------------------------------------

/** Sibling stylesheet: `/w/cart.js` -> `/w/cart.css`. Injected once per URL. */
function loadCss(href: string): void {
  if (sheets.has(href)) return;
  sheets.add(href);
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.append(link);
}

function loadModule(
  url: string,
  css: string | null,
  load: MountlyOptions["load"],
): Promise<WidgetModule> {
  let pending = modules.get(url);
  if (!pending) {
    if (css) loadCss(css);
    pending = Promise.resolve((load ?? importBySpecifier)(url)).then((mod) => {
      const widget = ((mod as { default?: unknown })?.default ?? mod) as WidgetModule;
      if (typeof widget?.mount !== "function") throw fail(`${url} has no mount(container, props)`);
      return widget;
    });
    // A failed import must not poison the cache — the next intent retries.
    pending.catch(() => modules.delete(url));
    modules.set(url, pending);
  }
  return pending;
}

// --- triggers ---------------------------------------------------------------

/** Wires an element so `run` fires on intent. Returns a teardown. */
export type Trigger = (el: HTMLElement, arg: string, run: () => void) => () => void;

/**
 * A trigger reads as `kind` or `kind:arg` — `hover:300`, `viewport:200px`,
 * `media:(min-width: 60rem)`. One attribute, so there is never a second
 * attribute holding the argument for the first one.
 *
 * Add your own by assigning to this object; there is no registry API because
 * an object already is one:
 *
 * ```ts
 * import { triggers } from "mountly";
 * import { eachSwipe } from "mountly/gestures";
 *
 * triggers.swipe = (el, direction, run) => eachSwipe(el, run, { direction });
 * // <div data-mountly="/w.js" data-on="swipe:left"></div>
 * ```
 */
export const triggers: Record<string, Trigger> = {
  click: (el, _arg, run) => listen(el, "click", run),
  focus: (el, _arg, run) => listen(el, "focusin", run),
  hover(el, arg, run) {
    // Pointer must settle before we spend bandwidth; a cursor crossing the
    // element on its way elsewhere is not intent.
    const delay = Number(arg) || 100;
    let timer: ReturnType<typeof setTimeout>;
    const off = [
      listen(el, "pointerenter", () => (timer = setTimeout(run, delay))),
      listen(el, "pointerleave", () => clearTimeout(timer)),
    ];
    return () => {
      clearTimeout(timer);
      off.forEach((f) => f());
    };
  },
  viewport(el, arg, run) {
    const io = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && run(),
      { rootMargin: arg || "0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  },
  idle(_el, arg, run) {
    const timeout = Number(arg) || undefined;
    // Safari only shipped requestIdleCallback in 15.4; without the fallback an
    // idle island there would simply never mount.
    if (typeof requestIdleCallback !== "function") {
      const id = setTimeout(run, timeout ?? 0);
      return () => clearTimeout(id);
    }
    const id = requestIdleCallback(run, { timeout });
    return () => cancelIdleCallback(id);
  },
  media(_el, arg, run) {
    const mql = matchMedia(arg);
    if (mql.matches) run();
    return listen(mql as unknown as EventTarget, "change", () => mql.matches && run());
  },
  url(_el, _arg, run) {
    // popstate and hashchange miss the case that matters most — a client-side
    // router calling pushState — so the history methods are patched once.
    patchHistory();
    const off = [
      listen(window, "popstate", run),
      listen(window, "hashchange", run),
      listen(historyBus, "url", run),
    ];
    return () => off.forEach((f) => f());
  },
  never: () => () => {},
};

const historyBus = new EventTarget();
let historyPatched = false;

function patchHistory(): void {
  if (historyPatched) return;
  historyPatched = true;
  for (const name of ["pushState", "replaceState"] as const) {
    const original = history[name].bind(history);
    history[name] = (...args: Parameters<History["pushState"]>) => {
      original(...args);
      historyBus.dispatchEvent(new Event("url"));
    };
  }
}

function listen(target: EventTarget, type: string, fn: () => void): () => void {
  target.addEventListener(type, fn);
  return () => target.removeEventListener(type, fn);
}

/**
 * `data-on="click hover:300"` — any of them fires. Split on whitespace that
 * isn't inside parentheses, so a media query keeps its natural spacing:
 * `media:(min-width: 60rem) click`.
 */
function wireTriggers(el: HTMLElement, spec: string, run: () => void): Array<() => void> {
  // Resolved in full before anything is wired: a list with one bad name must
  // leave no listener behind, or the island mounts on a trigger the page never
  // finished declaring.
  const parsed = spec
    .split(/\s+(?![^()]*\))/)
    .filter(Boolean)
    .map((entry) => {
      const at = entry.indexOf(":");
      const kind = at < 0 ? entry : entry.slice(0, at);
      const build = triggers[kind];
      if (!build) throw fail(`unknown trigger "${kind}"`);
      return [build, at < 0 ? "" : entry.slice(at + 1)] as const;
    });
  return parsed.map(([build, arg]) => build(el, arg, run));
}

// --- islands ----------------------------------------------------------------

/**
 * Props come from `data-props`, or from a `<script type="application/json">`
 * child when the payload is big enough that attribute escaping hurts.
 */
function readProps(el: HTMLElement): Record<string, unknown> {
  const script = el.querySelector(":scope > script[type='application/json']");
  const raw = el.dataset.props ?? script?.textContent;
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw fail("data-props is not valid JSON");
  }
}

function setState(el: HTMLElement, state: string): void {
  el.dataset.mountlyState = state;
}

function emit(el: HTMLElement, type: string, detail: Record<string, unknown>): void {
  el.dispatchEvent(new CustomEvent("mountly:" + type, { detail, bubbles: true }));
}

/** Load and mount an island now, whatever its triggers say. Idempotent. */
export function mount(el: HTMLElement, options: MountlyOptions = {}): Promise<void> {
  if (!states.get(el)) wire(el, options);
  const state = states.get(el);
  if (!state || state.mod) return Promise.resolve();
  if (state.pending) return state.pending;
  setState(el, "loading");

  const run = state.run;
  const live = () => states.get(el) === state && state.run === run;

  const attempt = async () => {
    // Guarded, not unconditional: with nothing to wait for, the import must
    // still start in this tick rather than a microtask later.
    const prior = settling.get(state.target);
    if (prior) {
      await prior;
      if (!live()) return;
    }
    const mod = await loadModule(state.url, state.css, options.load);
    if (!live()) return;
    // The contract allows an async mount; wait for it so the state attribute
    // and the event describe what is actually on screen.
    await mod.mount(state.target, propsFor(state));
    if (!live()) {
      // Unmounted while the widget was mounting. It never got recorded, so
      // tear down what it just put on the page by hand.
      await mod.unmount?.(state.target);
      state.target.replaceChildren();
      return;
    }
    // Recorded only once the widget is really up: a mount that throws leaves
    // the island genuinely unmounted, and the next intent retries it.
    state.mod = mod;
    setState(el, "mounted");
    emit(el, "mount", { url: state.url });
  };

  const pending = attempt()
    // One handler for both halves — a widget whose mount() rejects must not
    // strand the island in "loading" with an unhandled rejection behind it.
    .catch((error: unknown) => {
      if (!live()) return;
      setState(el, "error");
      emit(el, "error", { url: state.url, error });
      console.error(error);
    })
    .finally(() => {
      // Only clear what this call owns; a superseded chain must not free the
      // slot a newer mount is using.
      if (state.run === run) state.pending = undefined;
    });
  // Serialize this mount with every other island using the same target.
  // Return the queued wrapper so `await mount()` also waits for queue cleanup;
  // a synchronous update immediately afterwards must remain synchronous.
  state.pending = hold(state.target, pending) ?? pending;
  return state.pending;
}

/** Tear an island down. It stays wired, so its trigger can mount it again. */
export function unmount(el: HTMLElement): void {
  const state = states.get(el);
  if (!state) return;
  // Bump first, so an in-flight mount sees the cancellation. Its teardown is
  // still to come, so the next mount is made to wait on it.
  state.run += 1;
  hold(state.target, state.pending);
  state.pending = undefined;
  if (!state.mod) {
    if (el.dataset.mountlyState === "loading") setState(el, "idle");
    return;
  }
  const mod = state.mod;
  const target = state.target;
  // Updates already queued for this target finish before widget teardown. The
  // target is also emptied immediately to keep unmount synchronous to callers;
  // the queued clear prevents a late update from making content reappear.
  queue(target, () => {
    let work: void | Promise<void> = undefined;
    try {
      work = mod.unmount?.(target);
    } catch (error) {
      console.error(error);
    }
    if (work && typeof work.then === "function") {
      return work.catch((error) => console.error(error)).finally(() => target.replaceChildren());
    }
    target.replaceChildren();
  });
  target.replaceChildren();
  state.mod = undefined;
  setState(el, "idle");
  emit(el, "unmount", { url: state.url });
}

/**
 * Add promise-like lifecycle work to a target's queue. Resolved entries remove
 * themselves, so synchronous operations stay synchronous and pay no microtask.
 */
function hold(target: HTMLElement, work: unknown): Promise<void> | undefined {
  if (!work) return undefined;
  const prior = settling.get(target);
  const pending = prior
    ? Promise.allSettled([prior, work]).then(() => {})
    : Promise.resolve(work).then(
        () => {},
        () => {},
      );
  settling.set(target, pending);
  void pending.finally(() => {
    if (settling.get(target) === pending) settling.delete(target);
  });
  return pending;
}

/** Run now when the target is free, otherwise append to its lifecycle queue. */
function queue(target: HTMLElement, run: () => unknown): void {
  const prior = settling.get(target);
  if (prior) {
    hold(target, prior.then(run));
    return;
  }
  hold(target, run());
}

/** Push new props into a mounted island. */
export function update(el: HTMLElement, props: Record<string, unknown>): void {
  const state = states.get(el);
  if (!state?.mod) return;
  state.props = props;
  const next = propsFor(state);
  const mod = state.mod;
  const run = state.run;
  const live = () => states.get(el) === state && state.run === run && state.mod === mod;
  queue(state.target, () => {
    if (!live()) return;
    try {
      // Called through the module so method-style widgets keep their `this`.
      const work = mod.update ? mod.update(state.target, next) : mod.mount(state.target, next);
      if (work && typeof work.then === "function") {
        return work.catch((error) => {
          if (!live()) return;
          setState(el, "error");
          emit(el, "error", { url: state.url, error });
          console.error(error);
        });
      }
    } catch (error) {
      if (!live()) return;
      setState(el, "error");
      emit(el, "error", { url: state.url, error });
      console.error(error);
    }
  });
}

/**
 * The widget's own props plus the CSS hints adapters use to adopt a stylesheet
 * into a shadow root. Same shape on mount and update, so a widget can't see
 * one and not the other.
 */
function propsFor(state: State): Record<string, unknown> {
  return {
    ...state.props,
    moduleUrl: state.moduleUrl ?? state.url,
    ...(state.css ? { cssUrl: state.css } : {}),
  };
}

function cssFor(el: HTMLElement, url: string): string | null {
  const css = el.dataset.css;
  if (css === "none") return null;
  if (css) return css;
  return /\.js($|\?)/.test(url) ? url.replace(/\.js($|\?)/, ".css$1") : null;
}

function register(el: HTMLElement, options: MountlyOptions): State | null {
  const spec = el.dataset.mountly;
  if (!spec) return null;
  const url = options.urls?.[spec] ?? spec;
  const selector = el.dataset.target;
  // Scoped first so repeated islands on a page each find their own slot; the
  // document fallback is what makes a separate trigger/panel pair work.
  const target = selector
    ? (el.querySelector<HTMLElement>(selector) ?? document.querySelector<HTMLElement>(selector))
    : el;
  if (!target) throw fail(`data-target="${selector}" matched nothing`);

  // Props are read once and kept: unmounting clears the target, which would
  // take a `<script type="application/json">` child with it.
  const state: State = {
    url,
    moduleUrl: el.dataset.moduleUrl,
    css: cssFor(el, url),
    target,
    props: readProps(el),
    run: 0,
    stop: [],
  };
  states.set(el, state);

  const activate = () => {
    if (state.mod) {
      if (el.hasAttribute("data-toggle")) unmount(el);
      return;
    }
    void mount(el, options);
  };
  state.stop.push(...wireTriggers(el, el.dataset.on ?? "click", activate));
  if (el.dataset.preload) {
    // `media:` fires synchronously when the query already matches, so the
    // teardown list has to exist before wiring rather than be its result.
    const preload: Array<() => void> = [];
    let preloaded = false;
    preload.push(
      ...wireTriggers(el, el.dataset.preload, () => {
        if (preloaded) return;
        preloaded = true;
        preload.forEach((f) => f());
        loadModule(url, state.css, options.load).catch(() => {});
      }),
    );
    state.stop.push(...preload);
  }
  if (!el.dataset.mountlyState) setState(el, "idle");
  return state;
}

/**
 * Wire one element's triggers without scanning for others. `mountly()` is the
 * usual way in; this is for a host that already knows its islands — a custom
 * element wrapping itself, or a framework that renders one at a time.
 * Returns a teardown.
 */
export function wire(el: HTMLElement, options: MountlyOptions = {}): () => void {
  let owned = states.get(el);
  if (!states.has(el)) {
    try {
      owned = register(el, options) ?? undefined;
    } catch (error) {
      // Half a registration is worse than none — drop whatever got wired
      // before the throw.
      stop(el);
      // Bad markup is reported the same way a failed load is: a state the CSS
      // can see and an event the page can hear, never a throw into whatever
      // called us.
      setState(el, "error");
      emit(el, "error", { error });
      console.error(error);
    }
  }
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    // A stale callback must not tear down a state created by a later wire().
    if (owned && states.get(el) === owned) stop(el);
  };
}

/** Detach an island's triggers and tear down whatever it mounted. */
function stop(el: HTMLElement): void {
  const state = states.get(el);
  if (!state) return;
  state.stop.forEach((f) => f());
  unmount(el);
  states.delete(el);
}

/**
 * Drop the module and stylesheet caches. The caches are global and keyed by
 * URL — correct in a browser, but it means one spec's widget leaks into the
 * next. Call this between tests.
 */
export function reset(): void {
  modules.clear();
  sheets.clear();
}

// --- bootstrap --------------------------------------------------------------

const ISLAND = "[data-mountly]";

function scan(root: ParentNode, options: MountlyOptions): void {
  for (const el of root.querySelectorAll<HTMLElement>(ISLAND)) scanOne(el, options);
}

function scanOne(el: HTMLElement, options: MountlyOptions): void {
  if (states.has(el)) return;
  // `data-mountly-state="mounted"` in the server's HTML is the whole SSR
  // handshake: this island is already live, leave it alone. (Replaces
  // skipIfHydrated / forceRemount / hydratedAttr / requireSsrMarker /
  // ssrMarkerAttr / warnOnHydrationMismatch.) An explicit `mount(el)` still
  // overrides it — that path is a deliberate act, not discovery.
  if (el.dataset.mountlyState === "mounted") return;
  wire(el, options);
}

/**
 * Wire every island under `root`, and keep watching for ones added later —
 * by a parent widget, htmx, Turbo, or a server-rendered fragment swap.
 * Returns a teardown.
 */
export function mountly(options: MountlyOptions = {}): () => void {
  const root = options.root ?? document;
  scan(root, options);
  if (options.observe === false) return () => stopAll(root);

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches(ISLAND)) scanOne(node as HTMLElement, options);
        scan(node, options);
      }
    }
  });
  observer.observe(root === document ? document.documentElement : (root as Node), {
    childList: true,
    subtree: true,
  });
  return () => {
    observer.disconnect();
    stopAll(root);
  };
}

function stopAll(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>(ISLAND)) stop(el);
}
