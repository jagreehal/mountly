export type TriggerType =
  | "hover"
  | "click"
  | "focus"
  | "viewport"
  | "idle"
  | "media"
  | "programmatic";

export interface TriggerContext {
  element: HTMLElement;
  event?: Event;
  triggerType: TriggerType;
}

export interface TriggerOptions {
  type: TriggerType;
  element: HTMLElement;
  threshold?: number;
  rootMargin?: string;
  delay?: number;
  idleTimeout?: number;
  mediaQuery?: string;
  once?: boolean;
  onCancel?: () => void;
}

export function setupTrigger(
  options: TriggerOptions,
  onTrigger: (ctx: TriggerContext) => void
): () => void {
  const { type, element, delay = 0, once = false, onCancel } = options;
  let triggered = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let observer: IntersectionObserver | null = null;
  let idleCallbackId: number | null = null;
  let mediaQueryList: MediaQueryList | null = null;
  let mediaListener: ((event: MediaQueryListEvent) => void) | null = null;

  const cancelTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
      if (onCancel) onCancel();
    }
  };

  const fire = (event?: Event) => {
    if (once && triggered) return;
    if (timer !== null) return; // already scheduled

    if (delay > 0) {
      timer = setTimeout(() => {
        timer = null;
        triggered = true;
        onTrigger({ element, event, triggerType: type });
      }, delay);
    } else {
      triggered = true;
      onTrigger({ element, event, triggerType: type });
    }
  };

  const cleanup = () => {
    cancelTimer();
    element.removeEventListener("mouseenter", fire as EventListener);
    element.removeEventListener("mouseleave", cancelTimer);
    element.removeEventListener("click", fire as EventListener);
    element.removeEventListener("focus", fire as EventListener);
    element.removeEventListener("blur", cancelTimer);
    observer?.disconnect();
    observer = null;
    if (idleCallbackId !== null) {
      if (typeof cancelIdleCallback === "function") {
        cancelIdleCallback(idleCallbackId);
      }
      idleCallbackId = null;
    }
    if (mediaQueryList && mediaListener) {
      if (typeof mediaQueryList.removeEventListener === "function") {
        mediaQueryList.removeEventListener("change", mediaListener);
      } else {
        mediaQueryList.removeListener(mediaListener);
      }
    }
    mediaQueryList = null;
    mediaListener = null;
  };

  switch (type) {
    case "hover": {
      element.addEventListener("mouseenter", fire as EventListener);
      element.addEventListener("mouseleave", cancelTimer);
      break;
    }
    case "click": {
      element.addEventListener("click", fire as EventListener);
      break;
    }
    case "focus": {
      element.addEventListener("focus", fire as EventListener);
      break;
    }
    case "viewport": {
      const threshold = options.threshold ?? 0.1;
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              fire();
              if (once) {
                observer?.disconnect();
                observer = null;
              }
            }
          }
        },
        { threshold, rootMargin: options.rootMargin ?? "0px" }
      );
      observer.observe(element);
      break;
    }
    case "idle": {
      const timeout = options.idleTimeout;
      if (typeof requestIdleCallback === "function") {
        idleCallbackId = requestIdleCallback(
          () => {
            idleCallbackId = null;
            triggered = true;
            onTrigger({ element, triggerType: type });
          },
          typeof timeout === "number" ? { timeout } : undefined,
        );
      } else {
        timer = setTimeout(() => {
          timer = null;
          triggered = true;
          onTrigger({ element, triggerType: type });
        }, typeof timeout === "number" ? timeout : 0);
      }
      break;
    }
    case "media": {
      const query = options.mediaQuery;
      if (!query || typeof window === "undefined" || !window.matchMedia) break;
      mediaQueryList = window.matchMedia(query);
      const onChange = (event: MediaQueryListEvent) => {
        if (event.matches) fire(event);
      };
      mediaListener = onChange;
      if (mediaQueryList.matches) {
        fire(new CustomEvent("media"));
      }
      if (typeof mediaQueryList.addEventListener === "function") {
        mediaQueryList.addEventListener("change", onChange);
      } else {
        mediaQueryList.addListener(onChange);
      }
      break;
    }
    case "programmatic": {
      fire(new CustomEvent("programmatic"));
      break;
    }
  }

  return cleanup;
}

export interface PreloadOnHoverOptions {
  delay?: number;
  abortOnLeave?: boolean;
  onAbort?: () => void;
}

export function preloadOnHover(
  element: HTMLElement,
  preload: () => Promise<void>,
  options?: number | PreloadOnHoverOptions
): () => void {
  const opts = typeof options === "number"
    ? { delay: options, abortOnLeave: true }
    : { delay: 100, abortOnLeave: true, ...options };

  return setupTrigger(
    {
      type: "hover",
      element,
      delay: opts.delay,
      once: true,
      onCancel: opts.abortOnLeave ? opts.onAbort : undefined,
    },
    () => preload()
  );
}

export function activateOnClick(
  element: HTMLElement,
  activate: () => Promise<void>
): () => void {
  return setupTrigger(
    { type: "click", element, once: true },
    () => activate()
  );
}
