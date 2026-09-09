/**
 * Host-owned top-level routing across independently deployed features.
 *
 * The browser URL stays the single description of application state even
 * though different parts of the page are built, owned and deployed by
 * different teams. The host maps URL segments to features; each feature routes
 * internally below its own segment.
 *
 * ```ts
 * const router = createFeatureRouter({
 *   container: document.querySelector("#outlet")!,
 *   routes: [
 *     { path: "/products/*", feature: products },
 *     { path: "/settings/*", feature: settings },
 *   ],
 * });
 * router.start();
 * ```
 *
 * A framed feature never touches the host's history. It emits a navigation
 * event on its `mountly/iframe` channel and the host calls
 * {@link FeatureRouter.navigate} — so the host stays the only writer, and a
 * feature cannot navigate the shell somewhere the shell did not agree to.
 *
 * Prefer the standard protocol helpers:
 *
 * ```ts
 * import { bindFrameHistoryToRouter } from "mountly/iframe";
 * // in channel.connect:
 * return bindFrameHistoryToRouter(channel, router);
 * ```
 *
 * Or from the frame:
 *
 * ```ts
 * import { requestHostNavigation } from "mountly/iframe/child";
 * requestHostNavigation(channel, { url: "/billing/2" });
 * ```
 */
import type { OnDemandFeature } from "./feature.js";
import { eachUrlChange, type UrlChangeEventType } from "./triggers.js";

export interface FeatureRoute {
  /**
   * `/settings` matches that path exactly. `/products/*` matches the segment
   * and everything below it, and the remainder is passed to the feature as the
   * `route.rest` prop.
   *
   * Exact match and trailing wildcard only. Reach for the native `URLPattern`
   * if named params are ever needed, rather than growing these 20 lines into a
   * routing library.
   */
  path: string;
  feature: OnDemandFeature;
}

export interface RouteProps {
  /** Full matched pathname. */
  pathname: string;
  /** Portion below a wildcard match; `""` for an exact match. */
  rest: string;
  /** Query string parsed into a plain object. */
  query: Record<string, string>;
}

export interface FeatureRouterOptions {
  /** Element the matched feature mounts into. */
  container: HTMLElement;
  routes: FeatureRoute[];
  /** Mounted when nothing matches. Without one, the container is left empty. */
  fallback?: OnDemandFeature;
  /**
   * Which URL changes to react to. Defaults to all of them, which is what a
   * shell wants — `pushstate` included, since that is how in-page navigation
   * happens.
   */
  events?: UrlChangeEventType[];
  /** Reported when a feature fails to mount. Defaults to `console.error`. */
  onError?: (error: unknown, route: FeatureRoute | undefined) => void;
}

export interface FeatureRouter {
  /** Match the current URL and begin reacting to changes. Returns `stop`. */
  start: () => () => void;
  /** `pushState` to `url`, then match. The one supported way to navigate. */
  navigate: (url: string) => void;
  /**
   * `replaceState` to `url`, then match. Prefer {@link navigate} unless a
   * framed vertical explicitly asked for replace semantics.
   */
  replace: (url: string) => void;
  /** Re-match the current URL without navigating. */
  refresh: () => void;
  /** Unmount whatever is mounted and stop listening. */
  stop: () => void;
}

function matchRoute(
  routes: FeatureRoute[],
  pathname: string,
): { route: FeatureRoute; rest: string } | undefined {
  for (const route of routes) {
    if (route.path.endsWith("/*")) {
      const prefix = route.path.slice(0, -2);
      if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
        return { route, rest: pathname.slice(prefix.length).replace(/^\//, "") };
      }
      continue;
    }
    if (pathname === route.path) return { route, rest: "" };
  }
  return undefined;
}

function readQuery(search: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(search));
}

export function createFeatureRouter({
  container,
  routes,
  fallback,
  events,
  onError = (error) => console.error("[mountly] route mount failed:", error),
}: FeatureRouterOptions): FeatureRouter {
  let mounted: { feature: OnDemandFeature; unmount: () => void } | undefined;
  let stopListening: (() => void) | undefined;
  // Navigations can outrun an in-flight mount; only the newest may commit.
  let generation = 0;

  async function apply(): Promise<void> {
    const current = ++generation;
    const { pathname, search } = window.location;
    const matched = matchRoute(routes, pathname);
    const feature = matched?.route.feature ?? fallback;
    const props: RouteProps = {
      pathname,
      rest: matched?.rest ?? "",
      query: readQuery(search),
    };

    if (!feature) {
      mounted?.unmount();
      mounted = undefined;
      return;
    }

    // Same feature still matched — navigation happened *inside* it. Update
    // rather than remount: for a framed feature a remount is a second full
    // bootstrap, which is exactly the cost this architecture is trying to
    // avoid paying twice.
    if (mounted?.feature === feature) {
      try {
        await feature.update(container, { route: props });
      } catch (error) {
        onError(error, matched?.route);
      }
      return;
    }

    mounted?.unmount();
    mounted = undefined;

    try {
      const handle = await feature.mount(container, undefined, { route: props });
      if (current !== generation) {
        // A newer navigation landed while this was mounting; discard this one.
        handle.unmount();
        return;
      }
      mounted = { feature, unmount: handle.unmount };
    } catch (error) {
      onError(error, matched?.route);
    }
  }

  return {
    start() {
      stopListening ??= eachUrlChange(() => void apply(), { events });
      void apply();
      return () => this.stop();
    },
    navigate(url) {
      // pushState is patched by `triggers` to emit, so this reaches `apply`
      // through the same path as a back/forward — one code path, not two.
      window.history.pushState({}, "", url);
    },
    /**
     * `replaceState` to `url`, then match. Use when a framed vertical asks for
     * replace semantics via `history:navigate` with `history: "replace"`.
     */
    replace(url: string) {
      window.history.replaceState({}, "", url);
    },
    refresh() {
      void apply();
    },
    stop() {
      // Invalidate any apply() currently awaiting a feature mount. Its handle
      // will take the stale branch and immediately unmount when it resolves.
      generation++;
      stopListening?.();
      stopListening = undefined;
      mounted?.unmount();
      mounted = undefined;
    },
  };
}

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
  type FrameHistoryEvents,
  type HistoryNavigatePayload,
  type HistorySyncPayload,
  type BindFrameHistoryOptions,
} from "./frame-history.js";
