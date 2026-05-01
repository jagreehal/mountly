export {
  createOnDemandFeature,
  type OnDemandFeature,
  type FeatureContext,
  type FeatureModule,
  type FeatureState,
  type CreateOnDemandFeatureOptions,
} from "./feature.js";

export {
  DedupCache,
  moduleCache,
  dataCache,
  type CacheOptions,
} from "./cache.js";
export {
  createDataSource,
  type CreateDataSourceOptions,
  type DataSource,
  type DataSourceLoadContext,
  type DataSourceReadOptions,
  type DataSourceSnapshot,
  type DataSourceStatus,
} from "./data-source.js";
export {
  createUrlState,
  parseQuery,
  serializeQuery,
  type QueryState,
  type QueryValue,
  type UrlState,
  type UrlStateOptions,
} from "./url-state.js";
export {
  createEventBus,
  type EventBus,
  type EventBusOptions,
  type EventMap,
  type EventValidator,
} from "./bus.js";
export {
  mountWidgetFixture,
  cycleWidgetFixture,
  triggerFixture,
  type WidgetFixture,
} from "./test-utils.js";

export {
  createMountContainer,
  safeUnmount,
  getOrCreateContainer,
  type MountOptions,
} from "./mount.js";

export {
  setupTrigger,
  preloadOnHover,
  activateOnClick,
  type TriggerType,
  type TriggerContext,
  type TriggerOptions,
  type PreloadOnHoverOptions,
} from "./triggers.js";

export {
  registerCustomElement,
  unregisterCustomElement,
  defineMountlyFeature,
} from "./custom-element.js";

export type {
  WidgetModule,
  AdapterOptions,
  FrameworkAdapter,
} from "./adapter.js";

export { attachShadow } from "./shadow.js";
export {
  createModuleLoader,
  loadCssText,
  resolveCssUrl,
  __clearCssTextCache,
  type CssAutoLoadOptions,
} from "./assets.js";
export {
  createWidgetBundle,
  type CreateWidgetBundleOptions,
  type WidgetBundle,
} from "./bundle.js";
export {
  bootstrapMountlyHost,
  bootstrapMountlyHostFromScriptTag,
  type HostBootstrapOptions,
  type ScriptTagHostOptions,
} from "./host.js";
export {
  readIslandPayload,
  mountIslandFeature,
  mountAllIslands,
  unmountAllIslands,
  type IslandPayload,
  type IslandLoaders,
  type MountIslandOptions,
  type MountAllIslandsOptions,
  type MountedIsland,
} from "./island.js";
