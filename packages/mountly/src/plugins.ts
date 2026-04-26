import type { TriggerType, TriggerContext } from "./triggers.js";

export interface TriggerPlugin {
  name: string;
  type: TriggerType | string;
  setup: (
    element: HTMLElement,
    onTrigger: (ctx: TriggerContext) => void,
    options?: Record<string, unknown>
  ) => () => void;
}

const plugins = new Map<string, TriggerPlugin>();
type UrlChangeEventType =
  | "popstate"
  | "hashchange"
  | "pushstate"
  | "replacestate";

export interface UrlChangeTriggerOptions {
  events?: UrlChangeEventType[];
}

export interface MediaTriggerOptions {
  query: string;
}

const historySubscribers = new Set<(type: "pushstate" | "replacestate") => void>();
let historyPatchRefCount = 0;
let historyPatched = false;
let originalPushState:
  | ((data: unknown, unused: string, url?: string | URL | null) => void)
  | null = null;
let originalReplaceState:
  | ((data: unknown, unused: string, url?: string | URL | null) => void)
  | null = null;

function emitHistoryEvent(type: "pushstate" | "replacestate"): void {
  for (const subscriber of historySubscribers) {
    subscriber(type);
  }
}

function ensureHistoryPatched(): void {
  if (historyPatched || typeof window === "undefined") return;
  originalPushState = history.pushState.bind(history);
  originalReplaceState = history.replaceState.bind(history);
  history.pushState = ((...args: Parameters<History["pushState"]>) => {
    const result = originalPushState!(...args);
    emitHistoryEvent("pushstate");
    return result;
  }) as History["pushState"];
  history.replaceState = ((...args: Parameters<History["replaceState"]>) => {
    const result = originalReplaceState!(...args);
    emitHistoryEvent("replacestate");
    return result;
  }) as History["replaceState"];
  historyPatched = true;
}

function maybeRestoreHistory(): void {
  if (!historyPatched || historyPatchRefCount > 0) return;
  if (originalPushState) {
    history.pushState = originalPushState as History["pushState"];
  }
  if (originalReplaceState) {
    history.replaceState = originalReplaceState as History["replaceState"];
  }
  originalPushState = null;
  originalReplaceState = null;
  historyPatched = false;
}

export function registerTriggerPlugin(plugin: TriggerPlugin): void {
  plugins.set(plugin.name, plugin);
}

export function unregisterTriggerPlugin(name: string): void {
  plugins.delete(name);
}

export function getTriggerPlugin(name: string): TriggerPlugin | undefined {
  return plugins.get(name);
}

export function getAllTriggerPlugins(): TriggerPlugin[] {
  return Array.from(plugins.values());
}

export function createPluginTrigger(
  pluginName: string,
  element: HTMLElement,
  onTrigger: (ctx: TriggerContext) => void,
  options?: Record<string, unknown>
): () => void {
  const plugin = plugins.get(pluginName);
  if (!plugin) {
    throw new Error(`Trigger plugin "${pluginName}" not found`);
  }
  return plugin.setup(element, onTrigger, options);
}

export function createSwipeTrigger(
  element: HTMLElement,
  onTrigger: (ctx: TriggerContext) => void,
  options?: { threshold?: number; direction?: "left" | "right" | "up" | "down" }
): () => void {
  const { threshold = 50, direction } = options ?? {};

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
    const deltaT = Date.now() - startTime;

    if (deltaT > 500) return;

    let shouldTrigger = false;

    if (direction) {
      switch (direction) {
        case "left":
          shouldTrigger = deltaX < -threshold;
          break;
        case "right":
          shouldTrigger = deltaX > threshold;
          break;
        case "up":
          shouldTrigger = deltaY < -threshold;
          break;
        case "down":
          shouldTrigger = deltaY > threshold;
          break;
      }
    } else {
      shouldTrigger =
        Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold;
    }

    if (shouldTrigger) {
      onTrigger({
        element,
        event: e as unknown as Event,
        triggerType: "swipe" as TriggerType,
      });
    }
  };

  element.addEventListener("touchstart", onStart, { passive: true });
  element.addEventListener("touchend", onEnd, { passive: true });
  element.addEventListener("mousedown", onStart);
  element.addEventListener("mouseup", onEnd);

  return () => {
    element.removeEventListener("touchstart", onStart);
    element.removeEventListener("touchend", onEnd);
    element.removeEventListener("mousedown", onStart);
    element.removeEventListener("mouseup", onEnd);
  };
}

export function createLongPressTrigger(
  element: HTMLElement,
  onTrigger: (ctx: TriggerContext) => void,
  options?: { duration?: number }
): () => void {
  const { duration = 500 } = options ?? {};

  let timer: ReturnType<typeof setTimeout> | null = null;

  const start = (e: TouchEvent | MouseEvent) => {
    timer = setTimeout(() => {
      onTrigger({
        element,
        event: e as unknown as Event,
        triggerType: "longpress" as TriggerType,
      });
    }, duration);
  };

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  element.addEventListener("touchstart", start, { passive: true });
  element.addEventListener("touchend", cancel);
  element.addEventListener("touchmove", cancel);
  element.addEventListener("mousedown", start);
  element.addEventListener("mouseup", cancel);
  element.addEventListener("mouseleave", cancel);

  return () => {
    cancel();
    element.removeEventListener("touchstart", start);
    element.removeEventListener("touchend", cancel);
    element.removeEventListener("touchmove", cancel);
    element.removeEventListener("mousedown", start);
    element.removeEventListener("mouseup", cancel);
    element.removeEventListener("mouseleave", cancel);
  };
}

export function createKeyboardTrigger(
  element: HTMLElement,
  onTrigger: (ctx: TriggerContext) => void,
  options?: { key?: string; modifiers?: string[] }
): () => void {
  const { key = "Enter", modifiers = [] } = options ?? {};

  const handler = (e: KeyboardEvent) => {
    if (e.key !== key) return;

    for (const mod of modifiers) {
      switch (mod) {
        case "ctrl":
          if (!e.ctrlKey) return;
          break;
        case "shift":
          if (!e.shiftKey) return;
          break;
        case "alt":
          if (!e.altKey) return;
          break;
        case "meta":
          if (!e.metaKey) return;
          break;
      }
    }

    onTrigger({
      element,
      event: e,
      triggerType: "keyboard" as TriggerType,
    });
  };

  element.addEventListener("keydown", handler);

  return () => {
    element.removeEventListener("keydown", handler);
  };
}

export function createUrlChangeTrigger(
  element: HTMLElement,
  onTrigger: (ctx: TriggerContext) => void,
  options?: UrlChangeTriggerOptions,
): () => void {
  const configured = options?.events;
  const events = configured && configured.length > 0
    ? configured
    : (["popstate", "hashchange"] as UrlChangeEventType[]);

  const listens = new Set<UrlChangeEventType>(events);

  const fire = (event: Event) => {
    onTrigger({
      element,
      event,
      triggerType: "url-change" as TriggerType,
    });
  };

  const onPopState = (event: PopStateEvent) => {
    if (!listens.has("popstate")) return;
    fire(event);
  };
  const onHashChange = (event: HashChangeEvent) => {
    if (!listens.has("hashchange")) return;
    fire(event);
  };
  const onHistory = (type: "pushstate" | "replacestate") => {
    if (!listens.has(type)) return;
    fire(new CustomEvent(type));
  };

  if (listens.has("popstate")) {
    window.addEventListener("popstate", onPopState);
  }
  if (listens.has("hashchange")) {
    window.addEventListener("hashchange", onHashChange);
  }
  const needsHistoryPatch = listens.has("pushstate") || listens.has("replacestate");
  if (needsHistoryPatch) {
    historyPatchRefCount++;
    ensureHistoryPatched();
    historySubscribers.add(onHistory);
  }

  return () => {
    window.removeEventListener("popstate", onPopState);
    window.removeEventListener("hashchange", onHashChange);
    if (needsHistoryPatch) {
      historySubscribers.delete(onHistory);
      historyPatchRefCount = Math.max(0, historyPatchRefCount - 1);
      maybeRestoreHistory();
    }
  };
}

export function createMediaTrigger(
  element: HTMLElement,
  onTrigger: (ctx: TriggerContext) => void,
  options: MediaTriggerOptions,
): () => void {
  const query = options?.query;
  if (!query || typeof window === "undefined" || !window.matchMedia) {
    return () => {};
  }

  const media = window.matchMedia(query);
  const handler = (event: MediaQueryListEvent) => {
    if (!event.matches) return;
    onTrigger({
      element,
      event,
      triggerType: "media" as TriggerType,
    });
  };

  if (media.matches) {
    onTrigger({
      element,
      event: new CustomEvent("media"),
      triggerType: "media" as TriggerType,
    });
  }

  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }

  media.addListener(handler);
  return () => media.removeListener(handler);
}

export function registerBuiltInPlugins(): void {
  registerTriggerPlugin({
    name: "swipe",
    type: "swipe",
    setup: (element, onTrigger, options) =>
      createSwipeTrigger(element, onTrigger, options),
  });

  registerTriggerPlugin({
    name: "longpress",
    type: "longpress",
    setup: (element, onTrigger, options) =>
      createLongPressTrigger(element, onTrigger, options),
  });

  registerTriggerPlugin({
    name: "keyboard",
    type: "keyboard",
    setup: (element, onTrigger, options) =>
      createKeyboardTrigger(element, onTrigger, options),
  });

  registerTriggerPlugin({
    name: "url-change",
    type: "url-change",
    setup: (element, onTrigger, options) =>
      createUrlChangeTrigger(element, onTrigger, options as UrlChangeTriggerOptions),
  });

  registerTriggerPlugin({
    name: "media",
    type: "media",
    setup: (element, onTrigger, options) =>
      createMediaTrigger(element, onTrigger, options as unknown as MediaTriggerOptions),
  });
}
