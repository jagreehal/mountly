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

export {
  onAnalyticsEvent,
  getAnalyticsLog,
  clearAnalyticsLog,
  emitAnalyticsEvent,
  createFeatureTimingTracker,
  getModuleTimings,
  getAllModuleTimings,
  type TimingEvent,
  type AnalyticsCallback,
  type FeatureTimingTracker,
} from "./analytics.js";

export {
  createPredictivePrefetcher,
  createScrollPrefetcher,
  createMouseTrailPrefetcher,
  recordInteraction,
  getInteractionHistory,
  resetInteractionHistory,
  type PrefetchHeuristicOptions,
  type ScrollBasedPrefetchOptions,
  type MouseTrailPrefetchOptions,
} from "./prefetch.js";

export {
  registerTriggerPlugin,
  unregisterTriggerPlugin,
  getTriggerPlugin,
  getAllTriggerPlugins,
  createPluginTrigger,
  createSwipeTrigger,
  createLongPressTrigger,
  createKeyboardTrigger,
  createUrlChangeTrigger,
  createMediaTrigger,
  registerBuiltInPlugins,
  type TriggerPlugin,
  type UrlChangeTriggerOptions,
  type MediaTriggerOptions,
} from "./plugins.js";

export {
  createDevtoolsPanel,
  type DevtoolsPanelOptions,
} from "./devtools.js";

export {
  computePosition,
  applyPosition,
  createOverlay,
  getOverlayStack,
  closeAllOverlays,
  type Placement,
  type PositionOptions,
  type PositionResult,
  type OverlayOptions,
  type OverlayHandle,
} from "./positioning.js";

export type {
  WidgetModule,
  AdapterOptions,
  FrameworkAdapter,
} from "./adapter.js";

export { attachShadow } from "./shadow.js";

export { installRuntime, type RuntimeUrls } from "./runtime.js";
