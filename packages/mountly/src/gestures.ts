import type { BaseTriggerOptions, TriggerEvent } from "./triggers.js";

const onAbort = (signal: AbortSignal | undefined, fn: () => void): void => {
  if (!signal) return;
  if (signal.aborted) {
    fn();
    return;
  }
  signal.addEventListener("abort", fn, { once: true });
};

const aborted = (): Error => new DOMException("Aborted", "AbortError");

export interface SwipeOptions extends BaseTriggerOptions {
  threshold?: number;
  direction?: "left" | "right" | "up" | "down";
  /** Max ms between start and end. Default 500. */
  maxDuration?: number;
}

export interface SwipeEvent extends TriggerEvent {
  type: "swipe";
  direction: "left" | "right" | "up" | "down";
  deltaX: number;
  deltaY: number;
}

export function eachSwipe(
  el: HTMLElement,
  handler: (ev: SwipeEvent) => void,
  opts: SwipeOptions = {},
): () => void {
  const threshold = opts.threshold ?? 50;
  const maxDuration = opts.maxDuration ?? 500;
  const filterDirection = opts.direction;

  let startX = 0;
  let startY = 0;
  let startTime = 0;

  const onStart = (e: TouchEvent | MouseEvent) => {
    const point = "touches" in e ? e.touches[0]! : e;
    startX = point.clientX;
    startY = point.clientY;
    startTime = Date.now();
  };

  const onEnd = (e: TouchEvent | MouseEvent) => {
    const point = "changedTouches" in e ? e.changedTouches[0]! : e;
    const deltaX = point.clientX - startX;
    const deltaY = point.clientY - startY;
    if (Date.now() - startTime > maxDuration) return;

    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    let direction: SwipeEvent["direction"] | null = null;
    if (absX > absY && absX > threshold) {
      direction = deltaX > 0 ? "right" : "left";
    } else if (absY > threshold) {
      direction = deltaY > 0 ? "down" : "up";
    }
    if (!direction) return;
    if (filterDirection && direction !== filterDirection) return;

    handler({
      element: el,
      event: e as unknown as Event,
      type: "swipe",
      direction,
      deltaX,
      deltaY,
    });
  };

  el.addEventListener("touchstart", onStart, { passive: true });
  el.addEventListener("touchend", onEnd, { passive: true });
  el.addEventListener("mousedown", onStart);
  el.addEventListener("mouseup", onEnd);

  const cleanup = () => {
    el.removeEventListener("touchstart", onStart);
    el.removeEventListener("touchend", onEnd);
    el.removeEventListener("mousedown", onStart);
    el.removeEventListener("mouseup", onEnd);
  };
  onAbort(opts.signal, cleanup);
  return cleanup;
}

export interface LongPressOptions extends BaseTriggerOptions {
  /** Hold duration in ms. Default 500. */
  duration?: number;
}

export function eachLongPress(
  el: HTMLElement,
  handler: (ev: TriggerEvent) => void,
  opts: LongPressOptions = {},
): () => void {
  const duration = opts.duration ?? 500;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const start = (e: TouchEvent | MouseEvent) => {
    timer = setTimeout(() => {
      handler({
        element: el,
        event: e as unknown as Event,
        type: "longpress",
      });
    }, duration);
  };
  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  el.addEventListener("touchstart", start, { passive: true });
  el.addEventListener("touchend", cancel);
  el.addEventListener("touchmove", cancel);
  el.addEventListener("mousedown", start);
  el.addEventListener("mouseup", cancel);
  el.addEventListener("mouseleave", cancel);

  const cleanup = () => {
    cancel();
    el.removeEventListener("touchstart", start);
    el.removeEventListener("touchend", cancel);
    el.removeEventListener("touchmove", cancel);
    el.removeEventListener("mousedown", start);
    el.removeEventListener("mouseup", cancel);
    el.removeEventListener("mouseleave", cancel);
  };
  onAbort(opts.signal, cleanup);
  return cleanup;
}

export type KeyModifier = "ctrl" | "shift" | "alt" | "meta";

export interface KeyboardOptions extends BaseTriggerOptions {
  key?: string;
  modifiers?: KeyModifier[];
}

export function eachKeyboard(
  el: HTMLElement,
  handler: (ev: TriggerEvent) => void,
  opts: KeyboardOptions = {},
): () => void {
  const key = opts.key ?? "Enter";
  const modifiers = opts.modifiers ?? [];

  const listener = (event: KeyboardEvent) => {
    if (event.key !== key) return;
    for (const mod of modifiers) {
      if (mod === "ctrl" && !event.ctrlKey) return;
      if (mod === "shift" && !event.shiftKey) return;
      if (mod === "alt" && !event.altKey) return;
      if (mod === "meta" && !event.metaKey) return;
    }
    handler({ element: el, event, type: "keyboard" });
  };

  el.addEventListener("keydown", listener);
  const cleanup = () => el.removeEventListener("keydown", listener);
  onAbort(opts.signal, cleanup);
  return cleanup;
}

// One-shot promise variants
export function onSwipe(el: HTMLElement, opts: SwipeOptions = {}): Promise<SwipeEvent> {
  return new Promise<SwipeEvent>((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(aborted());
      return;
    }
    const cleanup = eachSwipe(
      el,
      (ev) => {
        cleanup();
        resolve(ev);
      },
      opts,
    );
    onAbort(opts.signal, () => {
      cleanup();
      reject(aborted());
    });
  });
}

export function onLongPress(el: HTMLElement, opts: LongPressOptions = {}): Promise<TriggerEvent> {
  return new Promise<TriggerEvent>((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(aborted());
      return;
    }
    const cleanup = eachLongPress(
      el,
      (ev) => {
        cleanup();
        resolve(ev);
      },
      opts,
    );
    onAbort(opts.signal, () => {
      cleanup();
      reject(aborted());
    });
  });
}

export function onKeyboard(el: HTMLElement, opts: KeyboardOptions = {}): Promise<TriggerEvent> {
  return new Promise<TriggerEvent>((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(aborted());
      return;
    }
    const cleanup = eachKeyboard(
      el,
      (ev) => {
        cleanup();
        resolve(ev);
      },
      opts,
    );
    onAbort(opts.signal, () => {
      cleanup();
      reject(aborted());
    });
  });
}
