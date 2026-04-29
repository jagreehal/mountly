import {
  createOnDemandFeature,
  type CreateOnDemandFeatureOptions,
  type FeatureModule,
  type OnDemandFeature,
} from "./feature.js";
import { createModuleLoader, type CssAutoLoadOptions } from "./assets.js";

interface BundleFeatureOptions
  extends Omit<CreateOnDemandFeatureOptions, "moduleUrl" | "loadModule" | "assetOptions"> {
  /**
   * Name of the export inside the bundle module that contains this widget.
   * Defaults to `default`. The export must satisfy `FeatureModule`
   * (an object with `mount(container, props)`), or be the widget's
   * `WidgetModule` directly.
   */
  export?: string;
}

export interface CreateWidgetBundleOptions {
  /**
   * URL to the bundle's JavaScript entry point. The bundle must export each
   * widget by a stable name. Loaded once and shared by every feature created
   * from this bundle.
   */
  moduleUrl: string;
  /**
   * Forwarded to `createModuleLoader`. Default `{ css: "none" }` — same as
   * `createOnDemandFeature`'s shortcut. Set `{ css: "auto" }` for light-DOM
   * widgets that want the bundle's sibling `.css` injected as a global
   * `<link>`.
   */
  assetOptions?: CssAutoLoadOptions;
}

export interface WidgetBundle {
  /** Build an `OnDemandFeature` for one named export of this bundle. */
  feature(options: BundleFeatureOptions): OnDemandFeature;
}

/**
 * Group multiple widgets that ship in one JS bundle.
 *
 * Best DX when widgets share code (a design system, utility components,
 * shadcn primitives). The bundle is fetched once for the page; each
 * `feature()` returns a normal `OnDemandFeature` that picks one named
 * export from the loaded module and uses the same `moduleUrl` so adapters
 * can adopt the shared CSS into the shadow root without extra wiring.
 *
 * @example
 * ```ts
 * const dashboard = createWidgetBundle({
 *   moduleUrl: "/widgets/dashboard/dist/index.js",
 * });
 *
 * const counter = dashboard.feature({ moduleId: "counter", export: "counter" });
 * const clock   = dashboard.feature({ moduleId: "clock",   export: "clock"   });
 *
 * counter.attach({ trigger: btn1, activateOn: "click" });
 * clock.attach({ trigger: btn2, activateOn: "click" });
 * ```
 */
export function createWidgetBundle(
  options: CreateWidgetBundleOptions,
): WidgetBundle {
  const { moduleUrl, assetOptions } = options;
  const loader = createModuleLoader(moduleUrl, assetOptions ?? { css: "none" });
  // One in-flight promise shared across every feature created from this
  // bundle. Browsers also dedupe `import("/url")` at the module-graph level,
  // but caching the promise here also dedupes the CSS preload step.
  let pending: Promise<unknown> | null = null;
  const loadOnce = () => {
    if (!pending) pending = loader();
    return pending;
  };

  return {
    feature(featureOptions) {
      const exportName = featureOptions.export ?? "default";
      return createOnDemandFeature({
        ...featureOptions,
        loadModule: async () => {
          const mod = await loadOnce();
          const picked = pickExport(mod, exportName, featureOptions.moduleId);
          return picked;
        },
        // Give the adapter the bundle's URL so it can derive the sibling .css.
        // We don't pass moduleUrl as a top-level option (which would synthesise
        // a different loadModule) — instead we override the render to thread
        // moduleUrl into props the same way the moduleUrl shortcut does.
        render:
          featureOptions.render ??
          (({ mod, container, props }) => {
            mod.mount(container, { ...props, moduleUrl });
          }),
      });
    },
  };
}

function pickExport(
  mod: unknown,
  name: string,
  moduleId: string,
): FeatureModule {
  const record = mod as Record<string, unknown> | null | undefined;
  if (!record || typeof record !== "object") {
    throw new Error(
      `[mountly] bundle did not resolve to a module object for "${moduleId}".`,
    );
  }
  const value = record[name];
  if (value === undefined) {
    throw new Error(
      `[mountly] bundle has no export "${name}" for feature "${moduleId}". ` +
        `Available: ${Object.keys(record).join(", ") || "(none)"}.`,
    );
  }
  // Accept either a default-wrapped module or the widget object directly.
  const candidate = (value as { default?: unknown }).default ?? value;
  if (
    candidate &&
    typeof candidate === "object" &&
    typeof (candidate as { mount?: unknown }).mount === "function"
  ) {
    return candidate as FeatureModule;
  }
  throw new Error(
    `[mountly] bundle export "${name}" for "${moduleId}" is not a widget module ` +
      `(missing mount(container, props)).`,
  );
}
