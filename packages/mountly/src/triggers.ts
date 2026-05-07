export type TriggerType =
  | 'hover'
  | 'click'
  | 'focus'
  | 'viewport'
  | 'idle'
  | 'media'
  | 'url-change'
  | 'swipe'
  | 'longpress'
  | 'keyboard'
  | 'programmatic';

export interface TriggerEvent {
  element: HTMLElement;
  event?: Event;
  type: TriggerType;
}

export interface BaseTriggerOptions {
  signal?: AbortSignal;
}

export type UrlChangeEventType =
  | 'popstate'
  | 'hashchange'
  | 'pushstate'
  | 'replacestate';

const aborted = (signal?: AbortSignal): Error => {
  void signal;
  return new DOMException('Aborted', 'AbortError');
};

const onAbort = (signal: AbortSignal | undefined, fn: () => void): void => {
  if (!signal) return;
  if (signal.aborted) {
    fn();
    return;
  }
  signal.addEventListener('abort', fn, { once: true });
};

// ---------------------------------------------------------------------------
// Repeatable: handler-based, returns a cleanup function.
// These are the building blocks. The promise variants wrap them.
// ---------------------------------------------------------------------------

export function eachClick(
  el: HTMLElement,
  handler: (ev: TriggerEvent) => void,
  opts: BaseTriggerOptions = {}
): () => void {
  const listener = (event: Event) =>
    handler({ element: el, event, type: 'click' });
  el.addEventListener('click', listener);
  const cleanup = () => el.removeEventListener('click', listener);
  onAbort(opts.signal, cleanup);
  return cleanup;
}

export interface HoverOptions extends BaseTriggerOptions {
  /** Delay (ms) the pointer must remain over the element before firing. */
  delay?: number;
}

export function eachHover(
  el: HTMLElement,
  handler: (ev: TriggerEvent) => void,
  opts: HoverOptions = {}
): () => void {
  const delay = opts.delay ?? 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancelTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const enter = (event: Event) => {
    if (timer !== null) return;
    if (delay > 0) {
      timer = setTimeout(() => {
        timer = null;
        handler({ element: el, event, type: 'hover' });
      }, delay);
    } else {
      handler({ element: el, event, type: 'hover' });
    }
  };
  el.addEventListener('mouseenter', enter);
  el.addEventListener('mouseleave', cancelTimer);
  const cleanup = () => {
    cancelTimer();
    el.removeEventListener('mouseenter', enter);
    el.removeEventListener('mouseleave', cancelTimer);
  };
  onAbort(opts.signal, cleanup);
  return cleanup;
}

export function eachFocus(
  el: HTMLElement,
  handler: (ev: TriggerEvent) => void,
  opts: BaseTriggerOptions = {}
): () => void {
  const listener = (event: Event) =>
    handler({ element: el, event, type: 'focus' });
  el.addEventListener('focus', listener);
  const cleanup = () => el.removeEventListener('focus', listener);
  onAbort(opts.signal, cleanup);
  return cleanup;
}

export interface ViewportOptions extends BaseTriggerOptions {
  rootMargin?: string;
  threshold?: number;
  /** Only fire once. Default false (fires every time it enters viewport). */
  once?: boolean;
}

export function eachViewport(
  el: HTMLElement,
  handler: (ev: TriggerEvent) => void,
  opts: ViewportOptions = {}
): () => void {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          handler({ element: el, type: 'viewport' });
          if (opts.once) cleanup();
        }
      }
    },
    {
      threshold: opts.threshold ?? 0.1,
      rootMargin: opts.rootMargin ?? '0px',
    }
  );
  observer.observe(el);
  const cleanup = () => observer.disconnect();
  onAbort(opts.signal, cleanup);
  return cleanup;
}

export interface MediaOptions extends BaseTriggerOptions {
  /** Fire immediately if the query already matches. Default true. */
  fireIfMatching?: boolean;
}

export function eachMedia(
  query: string,
  handler: (ev: TriggerEvent) => void,
  opts: MediaOptions = {}
): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => {};
  }
  const mql = window.matchMedia(query);
  const fakeTarget =
    (typeof document !== 'undefined' ? document.body : null) ??
    (null as unknown as HTMLElement);
  const onChange = (event: MediaQueryListEvent) => {
    if (event.matches) handler({ element: fakeTarget, type: 'media' });
  };
  if ((opts.fireIfMatching ?? true) && mql.matches) {
    handler({ element: fakeTarget, type: 'media' });
  }
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', onChange);
  } else {
    mql.addListener(onChange);
  }
  const cleanup = () => {
    if (typeof mql.removeEventListener === 'function') {
      mql.removeEventListener('change', onChange);
    } else {
      mql.removeListener(onChange);
    }
  };
  onAbort(opts.signal, cleanup);
  return cleanup;
}

// ---------------------------------------------------------------------------
// History patching: needed for pushstate/replacestate trigger events.
// Idempotent — patches the prototype once per page load.
// ---------------------------------------------------------------------------

const historySubscribers = new Set<
  (type: 'pushstate' | 'replacestate') => void
>();
let historyPatched = false;

function ensureHistoryPatched(): void {
  if (historyPatched) return;
  if (typeof window === 'undefined' || !window.history) return;
  const originalPush = window.history.pushState;
  const originalReplace = window.history.replaceState;
  window.history.pushState = function (...args) {
    const result = originalPush.apply(this, args);
    historySubscribers.forEach((cb) => cb('pushstate'));
    return result;
  };
  window.history.replaceState = function (...args) {
    const result = originalReplace.apply(this, args);
    historySubscribers.forEach((cb) => cb('replacestate'));
    return result;
  };
  historyPatched = true;
}

export interface UrlChangeOptions extends BaseTriggerOptions {
  events?: UrlChangeEventType[];
}

export function eachUrlChange(
  handler: (ev: TriggerEvent) => void,
  opts: UrlChangeOptions = {}
): () => void {
  if (typeof window === 'undefined') return () => {};
  const events = opts.events ?? [
    'popstate',
    'hashchange',
    'pushstate',
    'replacestate',
  ];
  const fakeTarget =
    (typeof document !== 'undefined' ? document.body : null) ??
    (null as unknown as HTMLElement);

  const cleanups: Array<() => void> = [];

  if (events.includes('popstate')) {
    const fn = (event: Event) =>
      handler({ element: fakeTarget, event, type: 'url-change' });
    window.addEventListener('popstate', fn);
    cleanups.push(() => window.removeEventListener('popstate', fn));
  }
  if (events.includes('hashchange')) {
    const fn = (event: Event) =>
      handler({ element: fakeTarget, event, type: 'url-change' });
    window.addEventListener('hashchange', fn);
    cleanups.push(() => window.removeEventListener('hashchange', fn));
  }
  if (events.includes('pushstate') || events.includes('replacestate')) {
    ensureHistoryPatched();
    const cb = (type: 'pushstate' | 'replacestate') => {
      if (events.includes(type)) {
        handler({ element: fakeTarget, type: 'url-change' });
      }
    };
    historySubscribers.add(cb);
    cleanups.push(() => historySubscribers.delete(cb));
  }

  const cleanup = () => {
    for (const c of cleanups) c();
  };
  onAbort(opts.signal, cleanup);
  return cleanup;
}

export interface IdleOptions extends BaseTriggerOptions {
  timeout?: number;
}

export function eachIdle(
  handler: (ev: TriggerEvent) => void,
  opts: IdleOptions = {}
): () => void {
  // Idle is intrinsically one-shot per call. Repeated firing isn't a thing.
  const fakeTarget =
    (typeof document !== 'undefined' ? document.body : null) ??
    (null as unknown as HTMLElement);
  let cancelled = false;

  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(
      () => {
        if (!cancelled) handler({ element: fakeTarget, type: 'idle' });
      },
      typeof opts.timeout === 'number' ? { timeout: opts.timeout } : undefined
    );
    const cleanup = () => {
      cancelled = true;
      if (typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(id);
      }
    };
    onAbort(opts.signal, cleanup);
    return cleanup;
  }
  const id = setTimeout(
    () => {
      if (!cancelled) handler({ element: fakeTarget, type: 'idle' });
    },
    typeof opts.timeout === 'number' ? opts.timeout : 0
  );
  const cleanup = () => {
    cancelled = true;
    clearTimeout(id);
  };
  onAbort(opts.signal, cleanup);
  return cleanup;
}

// ---------------------------------------------------------------------------
// One-shot promise variants. Resolve on first occurrence; reject on abort.
// ---------------------------------------------------------------------------

function oncePromise<O extends BaseTriggerOptions>(
  setup: (
    handler: (ev: TriggerEvent) => void,
    opts: O
  ) => () => void
): (opts: O) => Promise<TriggerEvent> {
  return (opts: O) =>
    new Promise<TriggerEvent>((resolve, reject) => {
      if (opts.signal?.aborted) {
        reject(aborted(opts.signal));
        return;
      }
      const cleanup = setup((ev) => {
        cleanup();
        resolve(ev);
      }, opts);
      onAbort(opts.signal, () => {
        cleanup();
        reject(aborted(opts.signal));
      });
    });
}

export function onClick(
  el: HTMLElement,
  opts: BaseTriggerOptions = {}
): Promise<TriggerEvent> {
  return oncePromise<BaseTriggerOptions>((handler, o) =>
    eachClick(el, handler, o)
  )(opts);
}

export function onHover(
  el: HTMLElement,
  opts: HoverOptions = {}
): Promise<TriggerEvent> {
  return oncePromise<HoverOptions>((handler, o) => eachHover(el, handler, o))(
    opts
  );
}

export function onFocus(
  el: HTMLElement,
  opts: BaseTriggerOptions = {}
): Promise<TriggerEvent> {
  return oncePromise<BaseTriggerOptions>((handler, o) =>
    eachFocus(el, handler, o)
  )(opts);
}

export function onViewport(
  el: HTMLElement,
  opts: Omit<ViewportOptions, 'once'> = {}
): Promise<TriggerEvent> {
  return oncePromise<ViewportOptions>((handler, o) =>
    eachViewport(el, handler, { ...o, once: true })
  )(opts);
}

export function onMedia(
  query: string,
  opts: MediaOptions = {}
): Promise<TriggerEvent> {
  return oncePromise<MediaOptions>((handler, o) =>
    eachMedia(query, handler, o)
  )(opts);
}

export function onUrlChange(
  opts: UrlChangeOptions = {}
): Promise<TriggerEvent> {
  return oncePromise<UrlChangeOptions>((handler, o) =>
    eachUrlChange(handler, o)
  )(opts);
}

export function onIdle(opts: IdleOptions = {}): Promise<TriggerEvent> {
  return oncePromise<IdleOptions>((handler, o) => eachIdle(handler, o))(opts);
}
