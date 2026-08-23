/**
 * Host-owned history protocol for framed verticals.
 *
 * A framed feature never writes `window.history` itself. It emits
 * `history:navigate`; the host calls {@link FeatureRouter.navigate} (or its
 * own `pushState`/`replaceState`). The host fans URL changes back as
 * `history:sync` so the frame can update nested routes without remounting.
 */
import { eachUrlChange } from "./triggers.js";
import type { FeatureRouter, RouteProps } from "./router.js";

export const HISTORY_NAVIGATE = "history:navigate" as const;
export const HISTORY_SYNC = "history:sync" as const;

export interface HistoryNavigatePayload {
  /** Absolute path or full URL the host should navigate to. */
  url: string;
  /** Defaults to `"push"`. */
  history?: "push" | "replace";
}

export interface HistorySyncPayload {
  pathname: string;
  search: string;
  hash: string;
  /** Portion below a wildcard route match; `""` when unknown. */
  rest: string;
  query: Record<string, string>;
}

/** Standard history events a framed widget and its host can share. */
export interface FrameHistoryEvents {
  [HISTORY_NAVIGATE]: HistoryNavigatePayload;
  [HISTORY_SYNC]: HistorySyncPayload;
}

export interface HistoryHostChannel {
  on(
    name: typeof HISTORY_NAVIGATE,
    listener: (payload: HistoryNavigatePayload) => void,
  ): () => void;
  emit(name: typeof HISTORY_SYNC, payload: HistorySyncPayload): void;
}

export interface HistoryFrameChannel {
  emit(name: typeof HISTORY_NAVIGATE, payload: HistoryNavigatePayload): void;
  on(name: typeof HISTORY_SYNC, listener: (payload: HistorySyncPayload) => void): () => void;
}

export function isHistoryNavigatePayload(value: unknown): value is HistoryNavigatePayload {
  if (!value || typeof value !== "object") return false;
  const url = (value as HistoryNavigatePayload).url;
  if (typeof url !== "string" || url.length === 0) return false;
  const mode = (value as HistoryNavigatePayload).history;
  if (mode !== undefined && mode !== "push" && mode !== "replace") return false;
  return true;
}

export function isHistorySyncPayload(value: unknown): value is HistorySyncPayload {
  if (!value || typeof value !== "object") return false;
  const p = value as HistorySyncPayload;
  return (
    typeof p.pathname === "string" &&
    typeof p.search === "string" &&
    typeof p.hash === "string" &&
    typeof p.rest === "string" &&
    !!p.query &&
    typeof p.query === "object" &&
    !Array.isArray(p.query)
  );
}

export interface BindFrameHistoryOptions {
  /**
   * Host navigation. Prefer {@link FeatureRouter.navigate} so pushState goes
   * through the same path as back/forward.
   */
  navigate: (url: string) => void;
  /** Optional replace navigation. Defaults to `navigate` when omitted. */
  replace?: (url: string) => void;
  /**
   * Build the sync payload after each host URL change. Defaults to reading
   * `window.location` with empty `rest`.
   */
  getSyncPayload?: () => HistorySyncPayload;
  /**
   * Subscribe to host URL changes. Defaults to {@link eachUrlChange}.
   * Pass a no-op when the host syncs manually via {@link syncFrameHistory}.
   */
  onHostUrlChange?: (listener: () => void) => () => void;
  /** When false, do not emit an initial sync. Defaults to true. */
  syncOnBind?: boolean;
}

/** Snapshot of the current location as a {@link HistorySyncPayload}. */
export function readHistorySyncPayload(rest = ""): HistorySyncPayload {
  const { pathname, search, hash } = window.location;
  return {
    pathname,
    search,
    hash,
    rest,
    query: Object.fromEntries(new URLSearchParams(search)),
  };
}

/** Build a sync payload from {@link RouteProps} plus the current hash. */
export function historySyncFromRoute(route: RouteProps): HistorySyncPayload {
  return {
    pathname: route.pathname,
    search:
      Object.keys(route.query).length > 0
        ? `?${new URLSearchParams(route.query).toString()}`
        : window.location.search,
    hash: window.location.hash,
    rest: route.rest,
    query: route.query,
  };
}

/**
 * Listen for `history:navigate` from a frame and fan host URL changes back as
 * `history:sync`. Returns cleanup.
 */
export function bindFrameHistory(
  channel: HistoryHostChannel,
  options: BindFrameHistoryOptions,
): () => void {
  const replace = options.replace ?? options.navigate;
  const getSync = options.getSyncPayload ?? (() => readHistorySyncPayload());
  const onHostUrlChange =
    options.onHostUrlChange ?? ((listener) => eachUrlChange(listener));

  const offNavigate = channel.on(HISTORY_NAVIGATE, (payload) => {
    if (!isHistoryNavigatePayload(payload)) return;
    if (payload.history === "replace") replace(payload.url);
    else options.navigate(payload.url);
  });

  const pushSync = (): void => {
    channel.emit(HISTORY_SYNC, getSync());
  };

  const stopListening = onHostUrlChange(pushSync);
  if (options.syncOnBind !== false) pushSync();

  return () => {
    offNavigate();
    stopListening();
  };
}

/**
 * Wire a {@link FeatureRouter} as the sole history writer for a framed vertical.
 *
 * ```ts
 * channel: {
 *   connect: (channel) => bindFrameHistoryToRouter(channel, router),
 * }
 * ```
 */
export function bindFrameHistoryToRouter(
  channel: HistoryHostChannel,
  router: Pick<FeatureRouter, "navigate" | "replace">,
  options: Omit<BindFrameHistoryOptions, "navigate" | "replace"> & {
    replace?: (url: string) => void;
  } = {},
): () => void {
  return bindFrameHistory(channel, {
    ...options,
    navigate: (url) => router.navigate(url),
    replace: options.replace ?? ((url) => router.replace(url)),
  });
}

/** Emit the current URL into the frame without waiting for a navigation event. */
export function syncFrameHistory(
  channel: Pick<HistoryHostChannel, "emit">,
  payload?: HistorySyncPayload,
): void {
  channel.emit(HISTORY_SYNC, payload ?? readHistorySyncPayload());
}

/** Frame-side: ask the host to navigate. */
export function requestHostNavigation(
  channel: HistoryFrameChannel,
  payload: HistoryNavigatePayload,
): void {
  if (!isHistoryNavigatePayload(payload)) {
    throw new Error("[mountly] requestHostNavigation: url is required.");
  }
  channel.emit(HISTORY_NAVIGATE, payload);
}

export const frameHistoryValidators = {
  [HISTORY_NAVIGATE]: isHistoryNavigatePayload,
  [HISTORY_SYNC]: isHistorySyncPayload,
} as const;
