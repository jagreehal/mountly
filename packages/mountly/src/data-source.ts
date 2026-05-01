import { DedupCache } from "./cache.js";

export type DataSourceStatus = "idle" | "loading" | "success" | "error";

export interface DataSourceSnapshot<T> {
  status: DataSourceStatus;
  data: T | undefined;
  error: unknown;
  loading: boolean;
  stale: boolean;
  cacheHit: boolean;
  updatedAt: number | null;
}

export interface DataSourceLoadContext<K> {
  key: K;
  signal: AbortSignal;
}

export interface DataSourceReadOptions {
  force?: boolean;
  signal?: AbortSignal;
}

export interface CreateDataSourceOptions<K, T> {
  load: (context: DataSourceLoadContext<K>) => Promise<T>;
  cacheKey?: (key: K) => string;
  ttl?: number | null;
  staleTime?: number | null;
  retry?: number;
  retryDelay?: number | ((attempt: number, error: unknown) => number);
  staleWhileRevalidate?: boolean;
  cache?: DedupCache<string, T>;
}

export interface DataSource<K, T> {
  read: (key: K, options?: DataSourceReadOptions) => Promise<T>;
  preload: (key: K, options?: DataSourceReadOptions) => Promise<void>;
  getSnapshot: (key: K) => DataSourceSnapshot<T>;
  subscribe: (key: K, listener: (snapshot: DataSourceSnapshot<T>) => void) => () => void;
  invalidate: (key?: K) => void;
  clear: () => void;
  abort: (key?: K) => void;
}

interface Entry<T> {
  data: T | undefined;
  error: unknown;
  status: DataSourceStatus;
  updatedAt: number | null;
}

const idleEntry = <T>(): Entry<T> => ({
  data: undefined,
  error: null,
  status: "idle",
  updatedAt: null,
});

const defaultCacheKey = (key: unknown): string => {
  if (typeof key === "string") return key;
  try {
    return JSON.stringify(key);
  } catch {
    return String(key);
  }
};

const delay = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

function linkSignals(controller: AbortController, signal?: AbortSignal): void {
  if (!signal) return;
  if (signal.aborted) {
    controller.abort();
    return;
  }
  signal.addEventListener("abort", () => controller.abort(), { once: true });
}

export function createDataSource<K, T>(
  options: CreateDataSourceOptions<K, T>,
): DataSource<K, T> {
  const cache = options.cache ?? new DedupCache<string, T>({ defaultTtl: options.ttl ?? null });
  const cacheKey = options.cacheKey ?? defaultCacheKey;
  const ttl = options.ttl ?? null;
  const staleTime = options.staleTime ?? null;
  const retry = options.retry ?? 0;
  const retryDelay = options.retryDelay ?? 0;
  const staleWhileRevalidate = options.staleWhileRevalidate ?? true;

  const entries = new Map<string, Entry<T>>();
  const pending = new Map<string, Promise<T>>();
  const controllers = new Map<string, AbortController>();
  const listeners = new Map<string, Set<(snapshot: DataSourceSnapshot<T>) => void>>();

  const isExpired = (entry: Entry<T>): boolean =>
    ttl !== null && entry.updatedAt !== null && Date.now() - entry.updatedAt >= ttl;

  const isStale = (entry: Entry<T>): boolean =>
    staleTime !== null && entry.updatedAt !== null && Date.now() - entry.updatedAt >= staleTime;

  const getEntry = (id: string): Entry<T> => entries.get(id) ?? idleEntry<T>();

  const snapshot = (id: string, cacheHit = false): DataSourceSnapshot<T> => {
    const entry = getEntry(id);
    return {
      status: entry.status,
      data: entry.data,
      error: entry.error,
      loading: entry.status === "loading",
      stale: entry.data !== undefined && (isExpired(entry) || isStale(entry)),
      cacheHit,
      updatedAt: entry.updatedAt,
    };
  };

  const notify = (id: string, cacheHit = false): void => {
    const next = snapshot(id, cacheHit);
    listeners.get(id)?.forEach((listener) => listener(next));
  };

  const runLoad = async (key: K, id: string, externalSignal?: AbortSignal): Promise<T> => {
    const existing = pending.get(id);
    if (existing) return existing;

    const controller = new AbortController();
    linkSignals(controller, externalSignal);
    controllers.set(id, controller);

    const previous = getEntry(id);
    entries.set(id, {
      data: previous.data,
      error: null,
      status: "loading",
      updatedAt: previous.updatedAt,
    });
    notify(id);

    const promise = (async () => {
      let attempt = 0;
      for (;;) {
        try {
          const result = await options.load({ key, signal: controller.signal });
          cache.set(id, result, { ttl });
          entries.set(id, {
            data: result,
            error: null,
            status: "success",
            updatedAt: Date.now(),
          });
          notify(id);
          return result;
        } catch (error) {
          if (controller.signal.aborted || attempt >= retry) {
            entries.set(id, {
              data: previous.data,
              error,
              status: "error",
              updatedAt: previous.updatedAt,
            });
            notify(id);
            throw error;
          }
          attempt += 1;
          const wait =
            typeof retryDelay === "function"
              ? retryDelay(attempt, error)
              : retryDelay;
          if (wait > 0) await delay(wait, controller.signal);
        }
      }
    })().finally(() => {
      pending.delete(id);
      controllers.delete(id);
    });

    pending.set(id, promise);
    return promise;
  };

  const read = async (key: K, readOptions: DataSourceReadOptions = {}): Promise<T> => {
    const id = cacheKey(key);
    const entry = getEntry(id);
    const cached = cache.get(id);
    const hasCached = cached !== undefined && !isExpired(entry);
    const stale = isStale(entry);

    if (!readOptions.force && hasCached && !stale) {
      entries.set(id, {
        data: cached,
        error: null,
        status: "success",
        updatedAt: entry.updatedAt ?? Date.now(),
      });
      notify(id, true);
      return cached;
    }

    if (!readOptions.force && hasCached && stale && staleWhileRevalidate) {
      void runLoad(key, id, readOptions.signal).catch(() => undefined);
      notify(id, true);
      return cached;
    }

    return runLoad(key, id, readOptions.signal);
  };

  return {
    read,
    async preload(key, readOptions) {
      await read(key, readOptions);
    },
    getSnapshot(key) {
      return snapshot(cacheKey(key));
    },
    subscribe(key, listener) {
      const id = cacheKey(key);
      const set = listeners.get(id) ?? new Set();
      set.add(listener);
      listeners.set(id, set);
      listener(snapshot(id));
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(id);
      };
    },
    invalidate(key) {
      if (key === undefined) {
        cache.clear();
        entries.clear();
        listeners.forEach((_set, id) => notify(id));
        return;
      }
      const id = cacheKey(key);
      cache.delete(id);
      entries.delete(id);
      notify(id);
    },
    clear() {
      cache.clear();
      entries.clear();
      listeners.forEach((_set, id) => notify(id));
    },
    abort(key) {
      if (key === undefined) {
        controllers.forEach((controller) => controller.abort());
        return;
      }
      controllers.get(cacheKey(key))?.abort();
    },
  };
}
