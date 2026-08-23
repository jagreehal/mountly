import type { OnDemandFeature, CreateOnDemandFeatureOptions } from "./feature.js";
import type { WidgetModule } from "./adapter.js";
import type { TriggerType } from "./triggers.js";
import { importBySpecifier } from "./dynamic-import.js";
import { mount, unmount, update, wire } from "./core.js";

type PreloadKind = "hover" | "viewport" | "idle" | "media";

const ACTIVATE_KINDS = new Set<string>([
  "click",
  "hover",
  "focus",
  "viewport",
  "idle",
  "media",
  "url-change",
]);
const PRELOAD_KINDS = new Set<string>(["hover", "viewport", "idle", "media"]);

/**
 * `<mountly-feature>` spells triggers out across several attributes for
 * historical reasons; the core takes one `kind:arg` string. This is the only
 * place the two vocabularies meet — the element owns no trigger code of its
 * own any more.
 */
function toCoreTrigger(kind: string, el: HTMLElement, mediaAttr: string): string {
  switch (kind) {
    case "media": {
      const query = el.getAttribute(mediaAttr);
      if (!query) {
        throw new Error(`[mountly] ${kind} trigger requires the ${mediaAttr} attribute.`);
      }
      return `media:${query}`;
    }
    case "viewport": {
      const margin = el.getAttribute("viewport-root-margin");
      return margin ? `viewport:${margin}` : "viewport";
    }
    case "idle": {
      const timeout = el.getAttribute("idle-timeout");
      return timeout ? `idle:${timeout}` : "idle";
    }
    case "url-change":
      return "url";
    default:
      return kind;
  }
}

/**
 * What a module id resolves to. A URL is the common case and needs nothing
 * beyond the core; a factory is the escape hatch for a ready-made
 * `OnDemandFeature` — what a manifest vertical registers.
 */
type RegistryEntry =
  | { url: string; exportName?: string }
  | { factory: () => OnDemandFeature | Promise<OnDemandFeature> };

const registry: Record<string, RegistryEntry> = {};

export function registerCustomElement(
  moduleId: string,
  factory: () => OnDemandFeature | Promise<OnDemandFeature>,
): void {
  registry[moduleId] = { factory };
}

export function unregisterCustomElement(moduleId: string): void {
  delete registry[moduleId];
}

/** An `OnDemandFeature` quacks differently from a widget module. */
function isFeature(value: unknown): value is OnDemandFeature {
  const candidate = value as OnDemandFeature | null;
  return (
    typeof candidate?.activate === "function" &&
    typeof candidate?.getState === "function" &&
    typeof candidate?.mount === "function"
  );
}

/**
 * Present a feature as a widget module so the core can drive it. The context is
 * rebuilt from the host element on every call rather than captured, which keeps
 * one wrapper valid for every instance of a tag.
 */
function widgetFromFeature(feature: OnDemandFeature, tagName: string): WidgetModule {
  const contextFor = (container: Element) => {
    const host = (container.closest(tagName) ?? container) as HTMLElement;
    const dataUrl = host.getAttribute("data-url");
    return {
      element: host,
      triggerType: (host.getAttribute("trigger") ?? "click") as TriggerType,
      ...(dataUrl ? { dataUrl, dataMethod: host.getAttribute("data-method") ?? "GET" } : {}),
    };
  };
  return {
    mount: (container, props) =>
      feature
        .mount(container as HTMLElement, contextFor(container), props as Record<string, unknown>)
        .then(() => {}),
    update: (container, props) =>
      feature.update(
        container as HTMLElement,
        props as Record<string, unknown>,
        contextFor(container),
      ),
    unmount: (container) => {
      (container as HTMLElement & { _unmount?: () => void })._unmount?.();
    },
  };
}

/** The core's `load` hook, resolving a module id through the registry. */
async function loadRegistered(moduleId: string, tagName: string): Promise<unknown> {
  const entry = registry[moduleId];
  if (!entry) {
    const known = Object.keys(registry);
    throw new Error(
      `[mountly] <${tagName} module-id="${moduleId}"> has no registered factory. ` +
        `Call registerCustomElement("${moduleId}", () => yourFeature) before the element connects. ` +
        `Currently registered: ${known.length > 0 ? known.map((k) => `"${k}"`).join(", ") : "(none)"}.`,
    );
  }
  if ("factory" in entry) return widgetFromFeature(await entry.factory(), tagName);

  const mod = (await importBySpecifier<Record<string, unknown>>(entry.url)) ?? {};
  const value =
    entry.exportName && entry.exportName in mod ? mod[entry.exportName] : (mod.default ?? mod);
  return isFeature(value) ? widgetFromFeature(value, tagName) : value;
}

function registryUrl(moduleId: string): string | undefined {
  const entry = registry[moduleId];
  return entry && "url" in entry ? entry.url : undefined;
}

export interface RegisterFeatureModuleOptions extends Omit<
  CreateOnDemandFeatureOptions,
  "moduleId"
> {
  /** Required: URL to the widget's JavaScript bundle. */
  moduleUrl: string;
}

export type FeatureModuleManifest =
  | Record<string, string | RegisterFeatureModuleOptions>
  | Array<string | [string, string] | [string, RegisterFeatureModuleOptions]>;

export interface DefineMountlyFeatureOptions {
  /**
   * Custom wrapper tag. Defaults to `<mountly-feature>`.
   */
  tagName?: string;
  /**
   * One shared bundle URL. Auto-registered aliases read named exports matching
   * their tag name, then fall back to the bundle's default export.
   */
  source?: string;
  /** Back-compat alias for `source`. */
  moduleUrl?: string;
  /**
   * Restrict registration to known modules. With `baseUrl`, each string
   * resolves to `${baseUrl}/${moduleId}/dist/index.js`. With `source`, each
   * string resolves to a named export from that shared bundle.
   */
  modules?: FeatureModuleManifest;
  /**
   * Define browser custom elements for module IDs. Defaults to true.
   */
  aliases?: boolean | Record<string, string>;
  /**
   * Namespace generated alias tags. `prefix: "acme"` maps
   * `<acme-counter-card>` to the `counter-card` module.
   */
  prefix?: string;
  /**
   * Scan current DOM for `<mountly-feature>` and alias tags. Defaults to true.
   */
  scan?: boolean;
  /** Back-compat alias for `scan`. */
  auto?: boolean;
  baseUrl?: string;
  resolveModuleUrl?: (moduleId: string) => string;
}

export function registerFeatureModule(
  moduleId: string,
  options: RegisterFeatureModuleOptions,
): void {
  const { moduleUrl, moduleExport, ...rest } = options;
  if (Object.keys(rest).length === 0) {
    registry[moduleId] = { url: moduleUrl, exportName: moduleExport };
    return;
  }
  // Data loading, cache keys and custom render belong to the feature layer.
  // Import it only when someone actually asks for one, so the common path
  // never pays for it.
  registerCustomElement(moduleId, async () => {
    const { createOnDemandFeature } = await import("./feature.js");
    return createOnDemandFeature({ moduleId, ...options });
  });
}

export function autoRegisterFeatures(modules: FeatureModuleManifest): void {
  if (Array.isArray(modules)) {
    for (const entry of modules) {
      if (typeof entry === "string") {
        const moduleId = entry;
        registerFeatureModule(moduleId, { moduleUrl: entry });
        continue;
      }
      const [moduleId, value] = entry;
      if (typeof value === "string") {
        registerFeatureModule(moduleId, { moduleUrl: value });
      } else {
        registerFeatureModule(moduleId, value);
      }
    }
    return;
  }

  for (const [moduleId, value] of Object.entries(modules)) {
    if (typeof value === "string") {
      registerFeatureModule(moduleId, { moduleUrl: value });
    } else {
      registerFeatureModule(moduleId, value);
    }
  }
}

function kebabToCamel(value: string): string {
  return value.replace(/-([a-z0-9])/g, (_m, char: string) => char.toUpperCase());
}

function normalizeAliasPrefix(prefix: string | undefined): string | undefined {
  const normalized = prefix?.trim().toLowerCase().replace(/-+$/, "");
  return normalized || undefined;
}

function aliasTagForModule(moduleId: string, options: DefineMountlyFeatureOptions): string {
  const prefix = normalizeAliasPrefix(options.prefix);
  return prefix ? `${prefix}-${moduleId}` : moduleId;
}

function moduleIdFromAliasTag(
  aliasTag: string,
  options: DefineMountlyFeatureOptions,
): string | null {
  const prefix = normalizeAliasPrefix(options.prefix);
  if (!prefix) return aliasTag;
  const expectedStart = `${prefix}-`;
  return aliasTag.startsWith(expectedStart) ? aliasTag.slice(expectedStart.length) : null;
}

function isLikelyUrl(value: string): boolean {
  return (
    value.startsWith("/") ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.endsWith(".js")
  );
}

function normalizeDefineOptions(
  input: string | DefineMountlyFeatureOptions,
): DefineMountlyFeatureOptions {
  if (typeof input !== "string") return input;
  return isLikelyUrl(input) ? { source: input } : { tagName: input };
}

function scanAndRegisterFromDom(tagName: string): void {
  const nodes = document.querySelectorAll<HTMLElement>(tagName);
  for (const node of nodes) {
    const moduleId = node.getAttribute("module-id");
    if (!moduleId || registry[moduleId]) continue;
    const moduleUrl =
      node.getAttribute("module-url") ||
      node.getAttribute("src") ||
      (() => {
        const raw = node.getAttribute("props");
        if (!raw) return null;
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          return typeof parsed.moduleUrl === "string" ? parsed.moduleUrl : null;
        } catch {
          return null;
        }
      })();
    if (moduleUrl) {
      registerFeatureModule(moduleId, { moduleUrl });
    }
  }
}

function resolveAutoModuleUrl(
  moduleId: string,
  options: DefineMountlyFeatureOptions,
): string | null {
  if (options.resolveModuleUrl) return options.resolveModuleUrl(moduleId);
  if (options.source || options.moduleUrl) return options.source ?? options.moduleUrl ?? null;
  if (options.baseUrl) return `${options.baseUrl.replace(/\/$/, "")}/${moduleId}/dist/index.js`;
  return null;
}

function resolveAutoModuleExport(
  moduleId: string,
  options: DefineMountlyFeatureOptions,
): string | undefined {
  if (options.source || options.moduleUrl) return kebabToCamel(moduleId);
  return undefined;
}

function registerAutoModule(moduleId: string, options: DefineMountlyFeatureOptions): void {
  if (registry[moduleId]) return;
  const moduleUrl = resolveAutoModuleUrl(moduleId, options);
  if (!moduleUrl) return;
  registerFeatureModule(moduleId, {
    moduleUrl,
    moduleExport: resolveAutoModuleExport(moduleId, options),
  });
}

function normalizeModuleIds(modules: FeatureModuleManifest): string[] {
  if (Array.isArray(modules)) {
    return modules.map((entry) => (typeof entry === "string" ? entry : entry[0]));
  }
  return Object.keys(modules);
}

function registerModuleList(
  modules: FeatureModuleManifest,
  options: DefineMountlyFeatureOptions,
): void {
  if (!Array.isArray(modules)) {
    autoRegisterFeatures(modules);
    return;
  }

  for (const entry of modules) {
    if (typeof entry !== "string") {
      const [moduleId, value] = entry;
      if (typeof value === "string") {
        registerFeatureModule(moduleId, { moduleUrl: value });
      } else {
        registerFeatureModule(moduleId, value);
      }
      continue;
    }

    const moduleUrl = resolveAutoModuleUrl(entry, options);
    if (moduleUrl) {
      registerFeatureModule(entry, {
        moduleUrl,
        moduleExport: resolveAutoModuleExport(entry, options),
      });
    }
  }
}

function scanAliasTags(
  options: DefineMountlyFeatureOptions,
  allowedModuleIds?: Set<string>,
): string[] {
  const tagName = options.tagName ?? "mountly-feature";
  const seen = new Set<string>();
  for (const node of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
    const aliasTag = node.localName;
    if (aliasTag === tagName || !aliasTag.includes("-")) continue;
    const moduleId = moduleIdFromAliasTag(aliasTag, options);
    if (!moduleId) continue;
    if (allowedModuleIds && !allowedModuleIds.has(moduleId)) continue;
    if (customElements.get(aliasTag)) continue;
    seen.add(moduleId);
    registerAutoModule(moduleId, options);
  }
  return [...seen];
}

function defineAliasElement(tagName: string, aliasTag: string, moduleId: string): void {
  if (typeof customElements === "undefined") return;
  if (!aliasTag.includes("-")) return;
  if (customElements.get(aliasTag)) return;

  customElements.define(
    aliasTag,
    class MountlyAliasElement extends HTMLElement {
      static observedAttributes = [
        "trigger",
        "preload-on",
        "activate-on",
        "preload-media-query",
        "activate-media-query",
        "idle-timeout",
        "viewport-root-margin",
        "data-url",
        "data-method",
        "mount-selector",
        "props",
      ];

      connectedCallback() {
        this.renderFeature();
      }

      attributeChangedCallback(_name: string, oldValue: string | null, newValue: string | null) {
        if (oldValue === newValue) return;
        if (!this.isConnected) return;
        this.renderFeature();
      }

      private renderFeature() {
        syncAliasNodeFeature(this, tagName, moduleId);
      }
    },
  );
}

function syncAliasNodeFeature(aliasNode: HTMLElement, tagName: string, moduleId: string): void {
  const feature =
    aliasNode.querySelector<HTMLElement>(`:scope > ${tagName}`) ?? document.createElement(tagName);
  if (feature.getAttribute("module-id") !== moduleId) {
    feature.setAttribute("module-id", moduleId);
  }
  for (const attr of aliasNode.getAttributeNames()) {
    if (attr === "module-id") continue;
    const value = aliasNode.getAttribute(attr);
    if (value !== null && feature.getAttribute(attr) !== value) {
      feature.setAttribute(attr, value);
    }
  }
  if (!feature.parentElement) {
    aliasNode.replaceChildren(feature);
  }
}

function defineAliasElements(
  tagName: string,
  moduleIds: string[],
  options: DefineMountlyFeatureOptions,
  aliases: DefineMountlyFeatureOptions["aliases"],
): void {
  const aliasMap = new Map<string, string>();
  if (typeof aliases === "object") {
    for (const [aliasTag, moduleId] of Object.entries(aliases)) {
      aliasMap.set(aliasTag, moduleId);
    }
  }

  for (const [aliasTag, moduleId] of aliasMap.entries()) {
    defineAliasElement(tagName, aliasTag, moduleId);
  }

  for (const moduleId of moduleIds) {
    aliasMap.set(aliasTagForModule(moduleId, options), moduleId);
    defineAliasElement(tagName, aliasTagForModule(moduleId, options), moduleId);
  }

  // Ensure already-rendered alias tags are hydrated immediately so callers
  // can interact with nested <mountly-feature> nodes without waiting on the
  // custom-element upgrade reaction queue.
  for (const [aliasTag, moduleId] of aliasMap.entries()) {
    const nodes = document.querySelectorAll<HTMLElement>(aliasTag);
    for (const node of nodes) {
      syncAliasNodeFeature(node, tagName, moduleId);
    }
  }
}

export function defineMountlyFeature(input: string | DefineMountlyFeatureOptions = {}): void {
  if (typeof customElements === "undefined") return;
  const options = normalizeDefineOptions(input);
  const tagName = options.tagName ?? "mountly-feature";
  const scan = options.scan ?? options.auto ?? true;
  const aliases = options.aliases ?? true;

  if (options.modules) {
    registerModuleList(options.modules, options);
  }
  const explicitIds = options.modules ? normalizeModuleIds(options.modules) : [];
  const allowedModuleIds = explicitIds.length > 0 ? new Set(explicitIds) : undefined;
  const scannedAliases = scan ? scanAliasTags(options, allowedModuleIds) : [];
  if (scan) {
    scanAndRegisterFromDom(tagName);
  }
  if (aliases) {
    defineAliasElements(
      tagName,
      [...new Set([...explicitIds, ...Object.keys(registry), ...scannedAliases])],
      options,
      aliases,
    );
  }

  if (customElements.get(tagName)) return;

  customElements.define(
    tagName,
    /**
     * A shim, not a second implementation. It translates its attributes into
     * the core's `data-*` vocabulary and hands the element to `wire()`; every
     * trigger, cache and lifecycle decision after that is the core's.
     */
    class MountlyFeatureElement extends HTMLElement {
      static observedAttributes = [
        "module-id",
        "trigger",
        "preload-on",
        "activate-on",
        "preload-media-query",
        "activate-media-query",
        "idle-timeout",
        "viewport-root-margin",
        "data-url",
        "data-method",
        "props",
        "mount-selector",
      ];

      #stop: (() => void) | null = null;

      connectedCallback() {
        this.#start();
      }

      disconnectedCallback() {
        this.#teardown();
      }

      attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
        if (oldValue === newValue || !this.isConnected) return;
        const props = name === "props" ? parseProps(newValue) : null;
        if (props && this.dataset.mountlyState === "mounted") {
          this.dataset.props = newValue ?? "";
          update(this, props);
          return;
        }
        // Invalid JSON falls through to a re-register, so bad props fail the
        // same way at any point in the element's life: error state and event,
        // never a silent mount with `{}`.
        this.#teardown();
        this.#start();
      }

      #teardown() {
        this.#stop?.();
        this.#stop = null;
      }

      #start() {
        const moduleId = this.getAttribute("module-id");
        if (!moduleId) return;
        if (!registry[moduleId]) {
          const known = Object.keys(registry);
          console.warn(
            `[mountly] <${tagName} module-id="${moduleId}"> has no registered factory. ` +
              `Call registerCustomElement("${moduleId}", () => yourFeature) before the element connects. ` +
              `Currently registered: ${known.length > 0 ? known.map((k) => `"${k}"`).join(", ") : "(none)"}.`,
          );
          return;
        }

        const trigger = this.getAttribute("trigger") ?? "click";
        const activateAttr = this.getAttribute("activate-on");
        const activate =
          activateAttr && ACTIVATE_KINDS.has(activateAttr)
            ? activateAttr
            : ACTIVATE_KINDS.has(trigger)
              ? trigger
              : "click";

        // Preload is opt-in. It used to default to the activation trigger for
        // hover/viewport/idle, which preloads on the very event that mounts —
        // a no-op with a rule attached.
        const preloadAttr = this.getAttribute("preload-on");
        const preload = preloadAttr && PRELOAD_KINDS.has(preloadAttr) ? preloadAttr : null;

        this.dataset.mountly = moduleId;
        this.dataset.on = toCoreTrigger(activate, this, "activate-media-query");
        if (preload) {
          this.dataset.preload = toCoreTrigger(preload as PreloadKind, this, "preload-media-query");
        } else {
          delete this.dataset.preload;
        }

        const propsAttr = this.getAttribute("props");
        if (propsAttr) this.dataset.props = propsAttr;
        else delete this.dataset.props;

        // The registry knows the bundle URL, so the sibling stylesheet can
        // still be derived even though `data-mountly` holds a module id.
        const url = registryUrl(moduleId);
        if (url) this.dataset.moduleUrl = url;
        else delete this.dataset.moduleUrl;
        if (url && /\.js($|\?)/.test(url)) this.dataset.css = url.replace(/\.js($|\?)/, ".css$1");
        // A factory-backed module has no URL — clear the sheet a previous
        // URL-backed module id left behind.
        else delete this.dataset.css;

        this.dataset.target = this.#mountSelector();
        this.#stop = wire(this, { load: (id) => loadRegistered(id, tagName) });
      }

      /** Mount into `mount-selector` if it resolves, else a slot we own. */
      #mountSelector(): string {
        const selector = this.getAttribute("mount-selector");
        if (selector && this.querySelector(selector)) return selector;
        if (!this.querySelector(":scope > [data-mountly-mount]")) {
          const slot = document.createElement("div");
          slot.setAttribute("data-mountly-mount", "");
          this.appendChild(slot);
        }
        return "[data-mountly-mount]";
      }
    },
  );
}

/** Parsed props, or `null` when the attribute isn't valid JSON. */
function parseProps(raw: string | null): Record<string, unknown> | null {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Mount a `<mountly-feature>` now, ignoring its trigger. */
export function mountFeatureElement(el: HTMLElement): Promise<void> {
  return mount(el);
}

/** Tear a `<mountly-feature>` down without detaching its triggers. */
export function unmountFeatureElement(el: HTMLElement): void {
  unmount(el);
}
