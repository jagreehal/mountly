type PendingPromise<T> = Promise<T> & { _status: "pending" };

interface CacheEntry<V> {
  value: V | PendingPromise<V>;
  createdAt: number;
  ttl: number | null;
  size: number;
}

export interface CacheOptions {
  maxEntries?: number;
  defaultTtl?: number | null;
  estimatedSize?: (value: unknown) => number;
  maxSizeBytes?: number | null;
}

export class DedupCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private maxEntries: number;
  private defaultTtl: number | null;
  private estimatedSize: (value: unknown) => number;
  private maxSizeBytes: number | null;
  private currentSizeBytes = 0;

  constructor(options: CacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 100;
    this.defaultTtl = options.defaultTtl ?? null;
    this.estimatedSize = options.estimatedSize ?? (() => 1);
    this.maxSizeBytes = options.maxSizeBytes ?? null;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (this.isExpired(entry)) {
      this.delete(key);
      return undefined;
    }

    if (typeof entry.value === "object" && entry.value !== null && "_status" in entry.value) {
      return undefined;
    }

    return entry.value as V;
  }

  async resolve(
    key: K,
    factory: () => Promise<V>,
    options?: { ttl?: number | null; signal?: AbortSignal }
  ): Promise<V> {
    const existing = this.cache.get(key);
    if (existing && !this.isExpired(existing)) {
      if (typeof existing.value === "object" && existing.value !== null && "_status" in existing.value) {
        return existing.value;
      }
      return existing.value as V;
    }

    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const promise = new Promise<V>((resolve, reject) => {
      const onAbort = () => {
        reject(new DOMException("Aborted", "AbortError"));
      };

      if (options?.signal) {
        options.signal.addEventListener("abort", onAbort, { once: true });
      }

      factory().then(
        (result) => {
          resolve(result);
        },
        (error) => {
          reject(error);
        }
      );
    }) as PendingPromise<V>;

    promise._status = "pending";

    const ttl = options?.ttl ?? this.defaultTtl;
    const entry: CacheEntry<V> = {
      value: promise,
      createdAt: Date.now(),
      ttl,
      size: 1,
    };

    this.cache.set(key, entry);

    try {
      const result = await promise;
      const size = this.estimatedSize(result);
      entry.value = result;
      entry.size = size;
      this.currentSizeBytes += size;
      this.enforceLimits();
      return result;
    } catch (error) {
      this.cache.delete(key);
      throw error;
    }
  }

  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.delete(key);
      return false;
    }
    if (typeof entry.value === "object" && entry.value !== null && "_status" in entry.value) {
      return false;
    }
    return true;
  }

  set(key: K, value: V, options?: { ttl?: number | null }): void {
    this.delete(key);
    const ttl = options?.ttl ?? this.defaultTtl;
    const size = this.estimatedSize(value);
    const entry: CacheEntry<V> = {
      value,
      createdAt: Date.now(),
      ttl,
      size,
    };
    this.cache.set(key, entry);
    this.currentSizeBytes += size;
    this.enforceLimits();
  }

  delete(key: K): void {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentSizeBytes -= entry.size;
      if (this.currentSizeBytes < 0) this.currentSizeBytes = 0;
    }
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.currentSizeBytes = 0;
  }

  invalidate(pattern: RegExp | ((key: K) => boolean)): void {
    const keysToDelete: K[] = [];
    for (const [key] of this.cache) {
      if (typeof pattern === "function" ? pattern(key) : pattern.test(String(key))) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.delete(key);
    }
  }

  getStats(): { entries: number; sizeBytes: number; maxEntries: number; maxSizeBytes: number | null } {
    return {
      entries: this.cache.size,
      sizeBytes: this.currentSizeBytes,
      maxEntries: this.maxEntries,
      maxSizeBytes: this.maxSizeBytes,
    };
  }

  private isExpired(entry: CacheEntry<V>): boolean {
    if (entry.ttl === null) return false;
    return Date.now() - entry.createdAt > entry.ttl;
  }

  private enforceLimits(): void {
    while (this.cache.size > this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.delete(oldestKey);
    }

    if (this.maxSizeBytes !== null && this.currentSizeBytes > this.maxSizeBytes) {
      const keys = Array.from(this.cache.keys());
      for (const key of keys) {
        if (this.currentSizeBytes <= this.maxSizeBytes) break;
        this.delete(key);
      }
    }
  }
}

export const moduleCache = new DedupCache<string, unknown>({
  maxEntries: 50,
  defaultTtl: null,
  estimatedSize: () => 1,
  maxSizeBytes: null,
});

export const dataCache = new DedupCache<string, unknown>({
  maxEntries: 100,
  defaultTtl: 5 * 60 * 1000,
  estimatedSize: (value) => {
    try {
      return JSON.stringify(value).length;
    } catch {
      return 1;
    }
  },
  maxSizeBytes: 10 * 1024 * 1024,
});
