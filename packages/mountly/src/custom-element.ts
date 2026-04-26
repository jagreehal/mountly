import type { OnDemandFeature, FeatureContext, AttachOptions } from "./feature.js";
import type { TriggerType } from "./triggers.js";

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

export function defineMountlyFeature(tagName = "mountly-feature"): void {
  if (customElements.get(tagName)) return;

  customElements.define(
    tagName,
    class MountlyFeatureElement extends HTMLElement {
      static observedAttributes = [
        "module-id",
        "trigger",
        "trigger-delay",
        "preload-on",
        "activate-on",
        "preload-media-query",
        "activate-media-query",
        "idle-timeout",
        "viewport-root-margin",
        "url-events",
        "data-url",
        "data-method",
        "props",
        "mount-selector",
      ];

      private feature: OnDemandFeature | null = null;
      private detach: (() => void) | null = null;

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
        if (name === "module-id" && newValue) {
          this.teardown();
          this.initialize();
          return;
        }
        if (name === "props" && this.feature) {
          // Live update for an already-mounted widget. If not mounted, this
          // is a no-op — the next mount reads the current attribute via the
          // props getter we handed to attach().
          const mountEl = this.getMountElement();
          void this.feature.update(mountEl, this.parseProps());
        }
      }

      private async initialize() {
        const moduleId = this.getAttribute("module-id");
        if (!moduleId) return;

        const factory = registry[moduleId];
        if (!factory) {
          const known = Object.keys(registry);
          const knownList =
            known.length > 0 ? known.map((k) => `"${k}"`).join(", ") : "(none)";
          console.warn(
            `[mountly] <mountly-feature module-id="${moduleId}"> has no registered factory. ` +
              `Call registerCustomElement("${moduleId}", () => yourFeature) before the element connects. ` +
              `Currently registered: ${knownList}.`,
          );
          return;
        }

        this.feature = await factory();

        const triggerType = this.getAttribute("trigger") ?? "click";

        const target = this.getTriggerElement();
        const mountTarget = this.getMountElement();

        const mappedPreloadOn: AttachOptions["preloadOn"] =
          triggerType === "hover"
            ? "hover"
            : triggerType === "viewport"
              ? "viewport"
              : triggerType === "idle"
                ? "idle"
                : false;

        const mappedActivateOn: AttachOptions["activateOn"] =
          triggerType === "focus"
            ? "focus"
            : triggerType === "hover"
              ? "hover"
              : triggerType === "viewport"
                ? "viewport"
                : triggerType === "url-change"
                  ? "url-change"
                  : triggerType === "idle"
                    ? "idle"
                    : triggerType === "media"
                      ? "media"
                      : "click";

        const preloadOn = this.parsePreloadOnAttr() ?? mappedPreloadOn;
        const activateOn = this.parseActivateOnAttr() ?? mappedActivateOn;
        const idleTimeout = this.parseNumberAttr("idle-timeout");
        const viewportRootMargin = this.getAttribute("viewport-root-margin") ?? undefined;
        const preloadOnMediaQuery = this.getAttribute("preload-media-query") ?? undefined;
        const activateOnMediaQuery = this.getAttribute("activate-media-query") ?? undefined;
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
      }

      private getTriggerElement(): HTMLElement {
        const selector = this.getAttribute("mount-selector");
        if (selector) {
          const el = this.querySelector(selector);
          if (el) return el as HTMLElement;
        }
        const firstChild = this.firstElementChild;
        if (firstChild) return firstChild as HTMLElement;
        return this;
      }

      private getMountElement(): HTMLElement {
        const selector = this.getAttribute("mount-selector");
        if (selector) {
          const el = this.querySelector(selector);
          if (el) return el as HTMLElement;
        }

        const existing = this.querySelector("[data-mountly-mount]");
        if (existing) return existing as HTMLElement;

        const mount = document.createElement("div");
        mount.setAttribute("data-mountly-mount", "");
        this.appendChild(mount);
        return mount;
      }

      private buildContext(): Partial<FeatureContext> {
        const dataUrl = this.getAttribute("data-url");
        const dataMethod = this.getAttribute("data-method") ?? "GET";

        return {
          element: this,
          triggerType: (this.getAttribute("trigger") ??
            "click") as TriggerType,
          ...(dataUrl ? { dataUrl, dataMethod } : {}),
        };
      }

      private parseProps(): Record<string, unknown> {
        const raw = this.getAttribute("props");
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

      private parsePreloadOnAttr(): AttachOptions["preloadOn"] | undefined {
        const raw = this.getAttribute("preload-on");
        if (!raw) return undefined;
        if (raw === "false" || raw === "none") return false;
        if (raw === "hover" || raw === "viewport" || raw === "idle" || raw === "media") {
          return raw;
        }
        return undefined;
      }

      private parseActivateOnAttr(): AttachOptions["activateOn"] | undefined {
        const raw = this.getAttribute("activate-on");
        if (!raw) return undefined;
        if (
          raw === "click" ||
          raw === "hover" ||
          raw === "focus" ||
          raw === "viewport" ||
          raw === "idle" ||
          raw === "media" ||
          raw === "url-change"
        ) {
          return raw;
        }
        return undefined;
      }

      private parseUrlEvents(): AttachOptions["activateOnUrlEvents"] {
        const raw = this.getAttribute("url-events");
        if (!raw) return undefined;
        const values = raw
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean) as NonNullable<AttachOptions["activateOnUrlEvents"]>;
        return values.length > 0 ? values : undefined;
      }

      private teardown() {
        if (this.detach) {
          this.detach();
          this.detach = null;
        }
      }
    }
  );
}
