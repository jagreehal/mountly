import type {
  OnDemandFeature,
  FeatureContext,
  AttachOptions,
} from './feature.js';
import {
  createFeatureFromModule,
  type CreateFeatureFromModuleOptions,
} from './feature.js';
import type { TriggerType } from './triggers.js';

interface FeatureRegistry {
  [moduleId: string]: () => OnDemandFeature | Promise<OnDemandFeature>;
}

const registry: FeatureRegistry = {};

export function registerCustomElement(
  moduleId: string,
  factory: () => OnDemandFeature | Promise<OnDemandFeature>
): void {
  registry[moduleId] = factory;
}

export function unregisterCustomElement(moduleId: string): void {
  delete registry[moduleId];
}

export interface RegisterFeatureModuleOptions
  extends Omit<CreateFeatureFromModuleOptions, 'moduleId'> {}

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
  options: RegisterFeatureModuleOptions
): void {
  registerCustomElement(moduleId, () =>
    createFeatureFromModule({
      moduleId,
      ...options,
    })
  );
}

export function autoRegisterFeatures(modules: FeatureModuleManifest): void {
  if (Array.isArray(modules)) {
    for (const entry of modules) {
      if (typeof entry === 'string') {
        const moduleId = entry;
        registerFeatureModule(moduleId, { moduleUrl: entry });
        continue;
      }
      const [moduleId, value] = entry;
      if (typeof value === 'string') {
        registerFeatureModule(moduleId, { moduleUrl: value });
      } else {
        registerFeatureModule(moduleId, value);
      }
    }
    return;
  }

  for (const [moduleId, value] of Object.entries(modules)) {
    if (typeof value === 'string') {
      registerFeatureModule(moduleId, { moduleUrl: value });
    } else {
      registerFeatureModule(moduleId, value);
    }
  }
}

function kebabToCamel(value: string): string {
  return value.replace(/-([a-z0-9])/g, (_m, char: string) =>
    char.toUpperCase()
  );
}

function normalizeAliasPrefix(prefix: string | undefined): string | undefined {
  const normalized = prefix?.trim().toLowerCase().replace(/-+$/, '');
  return normalized || undefined;
}

function aliasTagForModule(
  moduleId: string,
  options: DefineMountlyFeatureOptions
): string {
  const prefix = normalizeAliasPrefix(options.prefix);
  return prefix ? `${prefix}-${moduleId}` : moduleId;
}

function moduleIdFromAliasTag(
  aliasTag: string,
  options: DefineMountlyFeatureOptions
): string | null {
  const prefix = normalizeAliasPrefix(options.prefix);
  if (!prefix) return aliasTag;
  const expectedStart = `${prefix}-`;
  return aliasTag.startsWith(expectedStart)
    ? aliasTag.slice(expectedStart.length)
    : null;
}

function isLikelyUrl(value: string): boolean {
  return (
    value.startsWith('/') ||
    value.startsWith('./') ||
    value.startsWith('../') ||
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.endsWith('.js')
  );
}

function normalizeDefineOptions(
  input: string | DefineMountlyFeatureOptions
): DefineMountlyFeatureOptions {
  if (typeof input !== 'string') return input;
  return isLikelyUrl(input) ? { source: input } : { tagName: input };
}

function scanAndRegisterFromDom(tagName: string): void {
  const nodes = document.querySelectorAll<HTMLElement>(tagName);
  for (const node of nodes) {
    const moduleId = node.getAttribute('module-id');
    if (!moduleId || registry[moduleId]) continue;
    const moduleUrl =
      node.getAttribute('module-url') ||
      node.getAttribute('src') ||
      (() => {
        const raw = node.getAttribute('props');
        if (!raw) return null;
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          return typeof parsed.moduleUrl === 'string' ? parsed.moduleUrl : null;
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
  options: DefineMountlyFeatureOptions
): string | null {
  if (options.resolveModuleUrl) return options.resolveModuleUrl(moduleId);
  if (options.source || options.moduleUrl)
    return options.source ?? options.moduleUrl ?? null;
  if (options.baseUrl)
    return `${options.baseUrl.replace(/\/$/, '')}/${moduleId}/dist/index.js`;
  return null;
}

function resolveAutoModuleExport(
  moduleId: string,
  options: DefineMountlyFeatureOptions
): string | undefined {
  if (options.source || options.moduleUrl) return kebabToCamel(moduleId);
  return undefined;
}

function registerAutoModule(
  moduleId: string,
  options: DefineMountlyFeatureOptions
): void {
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
    return modules.map((entry) =>
      typeof entry === 'string' ? entry : entry[0]
    );
  }
  return Object.keys(modules);
}

function registerModuleList(
  modules: FeatureModuleManifest,
  options: DefineMountlyFeatureOptions
): void {
  if (!Array.isArray(modules)) {
    autoRegisterFeatures(modules);
    return;
  }

  for (const entry of modules) {
    if (typeof entry !== 'string') {
      const [moduleId, value] = entry;
      if (typeof value === 'string') {
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
  allowedModuleIds?: Set<string>
): string[] {
  const tagName = options.tagName ?? 'mountly-feature';
  const seen = new Set<string>();
  for (const node of Array.from(
    document.body.querySelectorAll<HTMLElement>('*')
  )) {
    const aliasTag = node.localName;
    if (aliasTag === tagName || !aliasTag.includes('-')) continue;
    const moduleId = moduleIdFromAliasTag(aliasTag, options);
    if (!moduleId) continue;
    if (allowedModuleIds && !allowedModuleIds.has(moduleId)) continue;
    if (customElements.get(aliasTag)) continue;
    seen.add(moduleId);
    registerAutoModule(moduleId, options);
  }
  return [...seen];
}

function defineAliasElement(
  tagName: string,
  aliasTag: string,
  moduleId: string
): void {
  if (!aliasTag.includes('-')) return;
  if (customElements.get(aliasTag)) return;

  customElements.define(
    aliasTag,
    class MountlyAliasElement extends HTMLElement {
      static observedAttributes = [
        'trigger',
        'preload-on',
        'activate-on',
        'preload-media-query',
        'activate-media-query',
        'idle-timeout',
        'viewport-root-margin',
        'url-events',
        'data-url',
        'data-method',
        'mount-selector',
        'props',
      ];

      connectedCallback() {
        this.renderFeature();
      }

      attributeChangedCallback(
        _name: string,
        oldValue: string | null,
        newValue: string | null
      ) {
        if (oldValue === newValue) return;
        if (!this.isConnected) return;
        this.renderFeature();
      }

      private renderFeature() {
        syncAliasNodeFeature(this, tagName, moduleId);
      }
    }
  );
}

function syncAliasNodeFeature(
  aliasNode: HTMLElement,
  tagName: string,
  moduleId: string
): void {
  const feature =
    aliasNode.querySelector<HTMLElement>(`:scope > ${tagName}`) ??
    document.createElement(tagName);
  if (feature.getAttribute('module-id') !== moduleId) {
    feature.setAttribute('module-id', moduleId);
  }
  for (const attr of aliasNode.getAttributeNames()) {
    if (attr === 'module-id') continue;
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
  aliases: DefineMountlyFeatureOptions['aliases']
): void {
  const aliasMap = new Map<string, string>();
  if (typeof aliases === 'object') {
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

export function defineMountlyFeature(
  input: string | DefineMountlyFeatureOptions = {}
): void {
  const options = normalizeDefineOptions(input);
  const tagName = options.tagName ?? 'mountly-feature';
  const scan = options.scan ?? options.auto ?? true;
  const aliases = options.aliases ?? true;

  if (options.modules) {
    registerModuleList(options.modules, options);
  }
  const explicitIds = options.modules
    ? normalizeModuleIds(options.modules)
    : [];
  const allowedModuleIds =
    explicitIds.length > 0 ? new Set(explicitIds) : undefined;
  const scannedAliases = scan ? scanAliasTags(options, allowedModuleIds) : [];
  if (scan) {
    scanAndRegisterFromDom(tagName);
  }
  if (aliases) {
    defineAliasElements(
      tagName,
      [
        ...new Set([
          ...explicitIds,
          ...Object.keys(registry),
          ...scannedAliases,
        ]),
      ],
      options,
      aliases
    );
  }

  if (customElements.get(tagName)) return;

  customElements.define(
    tagName,
    class MountlyFeatureElement extends HTMLElement {
      static observedAttributes = [
        'module-id',
        'trigger',
        'trigger-delay',
        'preload-on',
        'activate-on',
        'preload-media-query',
        'activate-media-query',
        'idle-timeout',
        'viewport-root-margin',
        'url-events',
        'data-url',
        'data-method',
        'props',
        'mount-selector',
      ];

      private feature: OnDemandFeature | null = null;
      private detach: (() => void) | null = null;
      private initializing = false;
      private pendingInitClick = false;
      private preInitClickListener: ((event: MouseEvent) => void) | null = null;

      connectedCallback() {
        this.initialize();
      }

      disconnectedCallback() {
        this.teardown();
      }

      attributeChangedCallback(
        name: string,
        oldValue: string | null,
        newValue: string | null
      ) {
        if (oldValue === newValue) return;
        if (!this.isConnected) return;
        if (name === 'module-id' && newValue) {
          this.teardown();
          this.initialize();
          return;
        }
        if (name === 'props' && this.feature) {
          // Live update for an already-mounted widget. If not mounted, this
          // is a no-op — the next mount reads the current attribute via the
          // props getter we handed to attach().
          const mountEl = this.getMountElement();
          void this.feature.update(mountEl, this.parseProps());
        }
      }

      private async initialize() {
        if (this.initializing || this.feature || this.detach) return;
        this.initializing = true;
        this.pendingInitClick = false;

        try {
          const moduleId = this.getAttribute('module-id');
          if (!moduleId) return;

          const factory = registry[moduleId];
          if (!factory) {
            const known = Object.keys(registry);
            const knownList =
              known.length > 0
                ? known.map((k) => `"${k}"`).join(', ')
                : '(none)';
            console.warn(
              `[mountly] <mountly-feature module-id="${moduleId}"> has no registered factory. ` +
                `Call registerCustomElement("${moduleId}", () => yourFeature) before the element connects. ` +
                `Currently registered: ${knownList}.`
            );
            return;
          }

          const triggerType = this.getAttribute('trigger') ?? 'click';
          if (triggerType === 'click' && !this.preInitClickListener) {
            this.preInitClickListener = () => {
              this.pendingInitClick = true;
            };
            this.addEventListener('click', this.preInitClickListener);
          }

          this.feature = await factory();

          const target = this.getTriggerElement();
          const mountTarget = this.getMountElement();

          const mappedPreloadOn: AttachOptions['preloadOn'] =
            triggerType === 'hover'
              ? 'hover'
              : triggerType === 'viewport'
              ? 'viewport'
              : triggerType === 'idle'
              ? 'idle'
              : false;

          const mappedActivateOn: AttachOptions['activateOn'] =
            triggerType === 'focus'
              ? 'focus'
              : triggerType === 'hover'
              ? 'hover'
              : triggerType === 'viewport'
              ? 'viewport'
              : triggerType === 'url-change'
              ? 'url-change'
              : triggerType === 'idle'
              ? 'idle'
              : triggerType === 'media'
              ? 'media'
              : 'click';

          const preloadOn = this.parsePreloadOnAttr() ?? mappedPreloadOn;
          const activateOn = this.parseActivateOnAttr() ?? mappedActivateOn;
          const idleTimeout = this.parseNumberAttr('idle-timeout');
          const viewportRootMargin =
            this.getAttribute('viewport-root-margin') ?? undefined;
          const preloadOnMediaQuery =
            this.getAttribute('preload-media-query') ?? undefined;
          const activateOnMediaQuery =
            this.getAttribute('activate-media-query') ?? undefined;
          const activateOnUrlEvents = this.parseUrlEvents();

          this.detach = this.feature.attach({
            trigger: target,
            mount: mountTarget,
            preloadOn,
            activateOn,
            preloadOnMediaQuery,
            activateOnMediaQuery,
            activateOnUrlEvents,
            idleTimeout,
            viewportRootMargin,
            props: () => this.parseProps(),
            context: () => this.buildContext(),
            onError: (err) =>
              console.error(`[mountly] feature "${moduleId}" failed:`, err),
          });

          if (this.preInitClickListener) {
            this.removeEventListener('click', this.preInitClickListener);
            this.preInitClickListener = null;
          }

          if (this.pendingInitClick) {
            this.pendingInitClick = false;
            queueMicrotask(() => {
              target.dispatchEvent(
                new MouseEvent('click', { bubbles: true, cancelable: true })
              );
            });
          }
        } finally {
          if (this.preInitClickListener) {
            this.removeEventListener('click', this.preInitClickListener);
            this.preInitClickListener = null;
          }
          this.initializing = false;
        }
      }

      private getTriggerElement(): HTMLElement {
        const selector = this.getAttribute('mount-selector');
        if (selector) {
          const el = this.querySelector(selector);
          if (el) return el as HTMLElement;
        }
        const firstChild = this.firstElementChild;
        if (firstChild) return firstChild as HTMLElement;
        return this;
      }

      private getMountElement(): HTMLElement {
        const selector = this.getAttribute('mount-selector');
        if (selector) {
          const el = this.querySelector(selector);
          if (el) return el as HTMLElement;
        }

        const existing = this.querySelector('[data-mountly-mount]');
        if (existing) return existing as HTMLElement;

        const mount = document.createElement('div');
        mount.setAttribute('data-mountly-mount', '');
        this.appendChild(mount);
        return mount;
      }

      private buildContext(): Partial<FeatureContext> {
        const dataUrl = this.getAttribute('data-url');
        const dataMethod = this.getAttribute('data-method') ?? 'GET';

        return {
          element: this,
          triggerType: (this.getAttribute('trigger') ?? 'click') as TriggerType,
          ...(dataUrl ? { dataUrl, dataMethod } : {}),
        };
      }

      private parseProps(): Record<string, unknown> {
        const raw = this.getAttribute('props');
        if (!raw) return {};
        try {
          return JSON.parse(raw);
        } catch {
          console.warn(`[mountly] invalid JSON in props attribute`);
          return {};
        }
      }

      private parseNumberAttr(name: string): number | undefined {
        const raw = this.getAttribute(name);
        if (!raw) return undefined;
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : undefined;
      }

      private parsePreloadOnAttr(): AttachOptions['preloadOn'] | undefined {
        const raw = this.getAttribute('preload-on');
        if (!raw) return undefined;
        if (raw === 'false' || raw === 'none') return false;
        if (
          raw === 'hover' ||
          raw === 'viewport' ||
          raw === 'idle' ||
          raw === 'media'
        ) {
          return raw;
        }
        return undefined;
      }

      private parseActivateOnAttr(): AttachOptions['activateOn'] | undefined {
        const raw = this.getAttribute('activate-on');
        if (!raw) return undefined;
        if (
          raw === 'click' ||
          raw === 'hover' ||
          raw === 'focus' ||
          raw === 'viewport' ||
          raw === 'idle' ||
          raw === 'media' ||
          raw === 'url-change'
        ) {
          return raw;
        }
        return undefined;
      }

      private parseUrlEvents(): AttachOptions['activateOnUrlEvents'] {
        const raw = this.getAttribute('url-events');
        if (!raw) return undefined;
        const values = raw
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean) as NonNullable<AttachOptions['activateOnUrlEvents']>;
        return values.length > 0 ? values : undefined;
      }

      private teardown() {
        if (this.preInitClickListener) {
          this.removeEventListener('click', this.preInitClickListener);
          this.preInitClickListener = null;
        }
        this.pendingInitClick = false;
        if (this.detach) {
          this.detach();
          this.detach = null;
        }
        this.initializing = false;
        this.feature = null;
      }
    }
  );
}
