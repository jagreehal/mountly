export type QueryValue = string | number | boolean | null | undefined;
export type QueryState = Record<string, QueryValue | QueryValue[]>;

export interface UrlStateOptions<S extends QueryState> {
  defaults?: Partial<S>;
  history?: "replace" | "push";
  url?: URL | string;
}

export interface UrlState<S extends QueryState> {
  read: () => Partial<S>;
  write: (patch: Partial<S>, options?: { history?: "replace" | "push" }) => void;
  subscribe: (listener: (state: Partial<S>) => void) => () => void;
  toString: (state?: Partial<S>) => string;
}

function normalizeUrl(input?: URL | string): URL {
  if (input instanceof URL) return new URL(input.href);
  if (typeof input === "string") return new URL(input, typeof location === "undefined" ? "http://localhost" : location.href);
  return new URL(location.href);
}

export function parseQuery<S extends QueryState = QueryState>(
  input: URLSearchParams | string,
): Partial<S> {
  const params = typeof input === "string" ? new URLSearchParams(input) : input;
  const state: QueryState = {};
  params.forEach((value, key) => {
    const existing = state[key];
    if (existing === undefined) {
      state[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      state[key] = [existing, value];
    }
  });
  return state as Partial<S>;
}

export function serializeQuery(state: QueryState): string {
  const params = new URLSearchParams();
  const keys = Object.keys(state).sort();
  for (const key of keys) {
    const value = state[key];
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item === null || item === undefined) continue;
      params.append(key, String(item));
    }
  }
  return params.toString();
}

function patchUrl(url: URL, patch: QueryState): URL {
  const next = new URL(url.href);
  for (const [key, value] of Object.entries(patch)) {
    next.searchParams.delete(key);
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      if (item === null || item === undefined) continue;
      next.searchParams.append(key, String(item));
    }
  }
  return next;
}

export function createUrlState<S extends QueryState = QueryState>(
  options: UrlStateOptions<S> = {},
): UrlState<S> {
  const listeners = new Set<(state: Partial<S>) => void>();
  const defaultHistory = options.history ?? "replace";
  let memoryUrl = options.url === undefined ? null : normalizeUrl(options.url);

  const currentUrl = (): URL => memoryUrl ? new URL(memoryUrl.href) : normalizeUrl();
  const read = (): Partial<S> => ({
    ...(options.defaults ?? {}),
    ...parseQuery<S>(currentUrl().searchParams),
  }) as Partial<S>;

  const notify = (): void => {
    const state = read();
    listeners.forEach((listener) => listener(state));
  };

  if (typeof window !== "undefined") {
    window.addEventListener("popstate", notify);
    window.addEventListener("hashchange", notify);
  }

  return {
    read,
    write(patch, writeOptions = {}) {
      const base = currentUrl();
      const next = patchUrl(base, patch as QueryState);
      if (memoryUrl) {
        memoryUrl = next;
      } else if (typeof history !== "undefined") {
        const mode = writeOptions.history ?? defaultHistory;
        history[mode === "push" ? "pushState" : "replaceState"](history.state, "", next);
      }
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(read());
      return () => listeners.delete(listener);
    },
    toString(state = read()) {
      return serializeQuery(state as QueryState);
    },
  };
}
