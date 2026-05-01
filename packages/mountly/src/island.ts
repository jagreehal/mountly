import {
  createOnDemandFeature,
  type FeatureModule,
  type OnDemandFeature,
} from "./feature.js";

export interface IslandPayload {
  schemaVersion?: 1;
  id: string;
  moduleId: string;
  targetSelector?: string;
  props?: Record<string, unknown>;
  trigger?: "click" | "hover" | "focus" | "viewport" | "idle" | "media" | "url-change" | "never";
  activateOnMediaQuery?: string;
  preloadOn?: "hover" | "viewport" | "idle" | "media" | false;
  preloadOnMediaQuery?: string;
  skipIfHydrated?: boolean;
  forceRemount?: boolean;
  hydratedAttr?: string;
  once?: boolean;
  waitForParent?: boolean;
  retry?: number;
  retryDelayMs?: number;
  requireSsrMarker?: boolean;
  ssrMarkerAttr?: string;
  version?: string;
  /**
   * Optional widget bundle URL. When set, mountly forwards it to the adapter
   * so framework-specific CSS auto-loading (shadow-DOM `adoptedStyleSheets`)
   * works without extra wiring. The adapter derives the sibling .css unless
   * `cssUrl` is also given.
   */
  moduleUrl?: string;
  /** Explicit stylesheet URL; overrides `moduleUrl`-derived path. */
  cssUrl?: string;
}

export interface IslandLoaders {
  [moduleId: string]: () => Promise<unknown>;
}

export interface MountAllIslandsOptions {
  selector?: string;
  forceRemount?: boolean;
  skipIfHydrated?: boolean;
  hydratedAttr?: string;
}

export interface MountIslandOptions {
  forceRemount?: boolean;
  skipIfHydrated?: boolean;
  hydratedAttr?: string;
  once?: boolean;
  waitForParent?: boolean;
  retry?: number;
  retryDelayMs?: number;
  unmountEvent?: string | false;
  refreshEvent?: string | false;
  warnOnHydrationMismatch?: boolean;
  perfMarks?: boolean;
  pauseOnHidden?: boolean;
  requireSsrMarker?: boolean;
  ssrMarkerAttr?: string;
}

export interface MountedIsland {
  element: HTMLElement;
  feature: OnDemandFeature;
  detach: () => void;
  unmount: () => void;
}

type IslandErrorCode =
  | "MNTI001"
  | "MNTI002"
  | "MNTI003"
  | "MNTI004"
  | "MNTI005";

const ISLAND_PAYLOAD_KEYS = new Set([
  "schemaVersion",
  "id",
  "moduleId",
  "targetSelector",
  "props",
  "trigger",
  "preloadOn",
  "skipIfHydrated",
  "forceRemount",
  "hydratedAttr",
  "once",
  "waitForParent",
  "retry",
  "retryDelayMs",
  "requireSsrMarker",
  "ssrMarkerAttr",
  "version",
  "moduleUrl",
  "cssUrl",
]);

function islandError(code: IslandErrorCode, message: string): Error {
  return new Error(`[mountly:${code}] ${message}`);
}

function emitMountlyError(
  element: Element,
  detail: { code: IslandErrorCode; message: string; id?: string; moduleId?: string; phase: string },
): void {
  element.dispatchEvent(new CustomEvent("mountly:error", { detail, bubbles: true }));
}

function emitMountlyWarning(
  element: Element,
  detail: { code: string; message: string; id?: string; moduleId?: string; phase: string },
): void {
  element.dispatchEvent(new CustomEvent("mountly:warning", { detail, bubbles: true }));
}

function emitIslandEvent(
  element: HTMLElement,
  type: "load-start" | "load-end" | "mount" | "error",
  detail: Record<string, unknown>,
): void {
  element.dispatchEvent(
    new CustomEvent(`mountly:island:${type}`, {
      detail,
      bubbles: true,
    }),
  );
}

function setIslandState(element: HTMLElement, state: "idle" | "loading" | "mounted" | "error"): void {
  element.setAttribute("data-mountly-state", state);
}

function mark(enabled: boolean, name: string): void {
  if (!enabled || typeof performance === "undefined" || typeof performance.mark !== "function") return;
  performance.mark(name);
}

export function createIslandPayload(payload: IslandPayload): IslandPayload {
  return { schemaVersion: 1, ...payload };
}

export function serializeIslandPayload(payload: IslandPayload): string {
  return JSON.stringify(createIslandPayload(payload));
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function normalizeModule(mod: unknown, moduleId: string): FeatureModule {
  const candidate = (mod as { default?: unknown })?.default ?? mod;
  if (isRecord(candidate) && typeof candidate.mount === "function") {
    return candidate as FeatureModule;
  }
  throw new Error(
    `[mountly] island module \"${moduleId}\" must resolve to a widget module with mount(container, props).`,
  );
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function applyReserveStyle(element: HTMLElement): void {
  const reserve = element.getAttribute("data-mountly-reserve");
  if (!reserve) return;
  element.style.cssText += `;${reserve}`;
  element.setAttribute("data-mountly-reserve-applied", "true");
}

export function readIslandPayload(element: Element): IslandPayload {
  const raw = element.getAttribute("data-mountly-island");
  const parsed = parseJson<IslandPayload>(raw);
  if (!parsed || typeof parsed.id !== "string" || typeof parsed.moduleId !== "string") {
    const err = islandError(
      "MNTI001",
      `invalid island payload on element; expected data-mountly-island JSON with { id, moduleId }`,
    );
    emitMountlyError(element, { code: "MNTI001", message: err.message, phase: "parse" });
    throw err;
  }
  if (parsed.schemaVersion !== undefined && parsed.schemaVersion !== 1) {
    const err = islandError(
      "MNTI002",
      `unsupported island schemaVersion \"${String(parsed.schemaVersion)}\"; expected 1`,
    );
    emitMountlyError(element, {
      code: "MNTI002",
      message: err.message,
      id: parsed.id,
      moduleId: parsed.moduleId,
      phase: "parse",
    });
    throw err;
  }
  if (parsed.targetSelector) {
    try {
      (element as HTMLElement).querySelector(parsed.targetSelector);
    } catch {
      const err = islandError("MNTI003", `invalid targetSelector "${parsed.targetSelector}"`);
      emitMountlyError(element, {
        code: "MNTI003",
        message: err.message,
        id: parsed.id,
        moduleId: parsed.moduleId,
        phase: "parse",
      });
      throw err;
    }
  }
  for (const key of Object.keys(parsed)) {
    if (!ISLAND_PAYLOAD_KEYS.has(key)) {
      const message = `[mountly] unknown island payload key "${key}"`;
      console.warn(message);
      emitMountlyWarning(element, {
        code: "MNTW001",
        message,
        id: parsed.id,
        moduleId: parsed.moduleId,
        phase: "parse",
      });
    }
  }
  if (parsed.trigger === "url-change" && parsed.preloadOn === "hover") {
    const message =
      `[mountly] preloadOn="hover" is usually ineffective with trigger="url-change"; consider preloadOn="idle" or false.`;
    console.warn(message);
    emitMountlyWarning(element, {
      code: "MNTW002",
      message,
      id: parsed.id,
      moduleId: parsed.moduleId,
      phase: "parse",
    });
  }
  return parsed;
}

function findParentIsland(element: HTMLElement): HTMLElement | null {
  let node = element.parentElement;
  while (node) {
    if (node.hasAttribute("data-mountly-island")) return node;
    node = node.parentElement;
  }
  return null;
}

export function mountIslandFeature(
  element: HTMLElement,
  loaders: IslandLoaders,
  options: MountIslandOptions = {},
): MountedIsland {
  const payload = readIslandPayload(element);
  applyReserveStyle(element);
  setIslandState(element, "idle");
  const trigger = element as HTMLElement;
  const mountTarget =
    (payload.targetSelector
      ? (element.querySelector(payload.targetSelector) as HTMLElement | null)
      : null) ??
    (element.querySelector("[data-mountly-target]") as HTMLElement | null) ??
    element;
  const loader = loaders[payload.moduleId];
  if (!loader) {
    const err = islandError("MNTI004", `no loader registered for moduleId "${payload.moduleId}"`);
    emitMountlyError(element, {
      code: "MNTI004",
      message: err.message,
      id: payload.id,
      moduleId: payload.moduleId,
      phase: "resolve-loader",
    });
    throw err;
  }

  const hydratedAttr = options.hydratedAttr ?? payload.hydratedAttr ?? "data-mountly-hydrated";
  const skipIfHydrated = options.skipIfHydrated ?? payload.skipIfHydrated ?? true;
  const forceRemount = options.forceRemount ?? payload.forceRemount ?? false;
  const once = options.once ?? payload.once ?? false;
  const waitForParent = options.waitForParent ?? payload.waitForParent ?? true;
  const retry = Math.max(0, options.retry ?? payload.retry ?? 0);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? payload.retryDelayMs ?? 0);
  const unmountEvent = options.unmountEvent === undefined ? "mountly:unmount" : options.unmountEvent;
  const refreshEvent = options.refreshEvent === undefined ? "mountly:refresh" : options.refreshEvent;
  const warnOnHydrationMismatch = options.warnOnHydrationMismatch ?? true;
  const perfMarks = options.perfMarks ?? false;
  const pauseOnHidden = options.pauseOnHidden ?? false;
  const requireSsrMarker = options.requireSsrMarker ?? payload.requireSsrMarker ?? false;
  const ssrMarkerAttr = options.ssrMarkerAttr ?? payload.ssrMarkerAttr ?? "ssr";
  if (requireSsrMarker && !element.hasAttribute(ssrMarkerAttr)) {
    return {
      element,
      feature: createOnDemandFeature({
        moduleId: payload.moduleId,
        loadModule: async () => normalizeModule(await loader(), payload.moduleId),
        render: () => {},
      }),
      detach: () => {},
      unmount: () => {},
    };
  }
  const alreadyHydrated = element.getAttribute(hydratedAttr) === "true";

  const feature = createOnDemandFeature({
    moduleId: payload.moduleId,
    loadModule: async () => {
      setIslandState(element, "loading");
      mark(perfMarks, `mountly:island:${payload.id}:load-start`);
      emitIslandEvent(element, "load-start", { id: payload.id, moduleId: payload.moduleId });
      let attempt = 0;
      while (true) {
        try {
          const normalized = normalizeModule(await loader(), payload.moduleId);
          mark(perfMarks, `mountly:island:${payload.id}:load-end`);
          emitIslandEvent(element, "load-end", { id: payload.id, moduleId: payload.moduleId, attempt });
          return normalized;
        } catch (error) {
          if (attempt >= retry) {
            setIslandState(element, "error");
            emitMountlyError(element, {
              code: "MNTI005",
              message: error instanceof Error ? error.message : String(error),
              id: payload.id,
              moduleId: payload.moduleId,
              phase: "load",
            });
            emitIslandEvent(element, "error", {
              id: payload.id,
              moduleId: payload.moduleId,
              phase: "load",
              attempt,
              message: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
          attempt += 1;
          if (retryDelayMs > 0) await wait(retryDelayMs);
        }
      }
    },
    render: ({ mod, container, props }) => {
      if (alreadyHydrated && skipIfHydrated && !forceRemount) return;
      if (
        warnOnHydrationMismatch &&
        alreadyHydrated &&
        !skipIfHydrated &&
        forceRemount &&
        !element.hasAttribute("data-mountly-hydration-warned")
      ) {
        element.setAttribute("data-mountly-hydration-warned", "true");
        console.warn(
          `[mountly] island "${payload.id}" force-remounting over SSR content; ensure server and client props match to avoid flicker.`,
        );
      }
      mark(perfMarks, `mountly:island:${payload.id}:mount-start`);
      // Auto-thread payload's CSS hints into mount props so adapters can
      // adopt the right stylesheet without the host writing custom render.
      const propsWithCss =
        payload.moduleUrl || payload.cssUrl
          ? {
              ...props,
              ...(payload.moduleUrl ? { moduleUrl: payload.moduleUrl } : {}),
              ...(payload.cssUrl ? { cssUrl: payload.cssUrl } : {}),
            }
          : props;
      mod.mount(container, propsWithCss);
      mark(perfMarks, `mountly:island:${payload.id}:mount-end`);
      element.setAttribute(hydratedAttr, "true");
      setIslandState(element, "mounted");
      emitIslandEvent(element, "mount", { id: payload.id, moduleId: payload.moduleId });
    },
  });

  const attachNow = () => {
    if (payload.trigger === "never") return () => {};
    return feature.attach({
      trigger,
      mount: mountTarget,
      preloadOn: payload.preloadOn ?? "hover",
      preloadOnMediaQuery: payload.preloadOnMediaQuery,
      activateOn: payload.trigger ?? "click",
      activateOnMediaQuery: payload.activateOnMediaQuery,
      props: payload.props ?? {},
      toggle: once ? false : true,
    });
  };

  let detach = () => {};
  const parentIsland = waitForParent ? findParentIsland(element) : null;
  if (
    parentIsland &&
    parentIsland.getAttribute(hydratedAttr) !== "true" &&
    parentIsland !== element
  ) {
    const onParentMounted = () => {
      detach = attachNow();
      parentIsland.removeEventListener("mountly:island:mount", onParentMounted as EventListener);
    };
    parentIsland.addEventListener("mountly:island:mount", onParentMounted as EventListener, {
      once: true,
    });
    detach = () =>
      parentIsland.removeEventListener("mountly:island:mount", onParentMounted as EventListener);
  } else {
    detach = attachNow();
  }

  const unmount = () => {
    feature.abort();
    feature.getMounts().forEach((m) => {
      try {
        if (m.shadowRoot) {
          const st = m.shadowRoot.querySelector("[data-mountly-root]") as HTMLElement | null;
          if (st) st.innerHTML = "";
          else m.shadowRoot.innerHTML = "";
        } else {
          m.innerHTML = "";
        }
      } catch {
        m.innerHTML = "";
      }
    });
  };

  const unmountListener = () => unmount();
  const refreshListener = () => {
    mark(perfMarks, `mountly:island:${payload.id}:refresh`);
    void feature.refresh(mountTarget, { element: trigger, triggerType: "programmatic" }, payload.props ?? {});
  };
  if (unmountEvent) {
    element.addEventListener(unmountEvent, unmountListener as EventListener);
  }
  if (refreshEvent) {
    element.addEventListener(refreshEvent, refreshListener as EventListener);
  }
  const visibilityListener = () => {
    if (!pauseOnHidden) return;
    if (document.visibilityState === "hidden") {
      element.dispatchEvent(new CustomEvent("mountly:island:pause", { bubbles: true, detail: { id: payload.id } }));
    } else {
      element.dispatchEvent(new CustomEvent("mountly:island:resume", { bubbles: true, detail: { id: payload.id } }));
    }
  };
  if (pauseOnHidden) {
    document.addEventListener("visibilitychange", visibilityListener);
  }

  const detachWithCleanup = () => {
    if (unmountEvent) {
      element.removeEventListener(unmountEvent, unmountListener as EventListener);
    }
    if (refreshEvent) {
      element.removeEventListener(refreshEvent, refreshListener as EventListener);
    }
    if (pauseOnHidden) {
      document.removeEventListener("visibilitychange", visibilityListener);
    }
    detach();
  };

  return { element, feature, detach: detachWithCleanup, unmount };
}

export function mountAllIslands(
  root: ParentNode,
  loaders: IslandLoaders,
  options: MountAllIslandsOptions = {},
): MountedIsland[] {
  const selector = options.selector ?? "[data-mountly-island]";
  const nodes = Array.from(root.querySelectorAll(selector));
  const mounted: MountedIsland[] = [];
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    const mountedIsland = mountIslandFeature(node, loaders, options);
    mounted.push(mountedIsland);
  }
  return mounted;
}

export function unmountAllIslands(islands: ReadonlyArray<MountedIsland>): void {
  for (const island of islands) {
    island.unmount();
    island.detach();
  }
}
