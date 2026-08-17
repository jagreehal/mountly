import { createOnDemandFeature, type FeatureContext } from "mountly";
import { safeUnmount } from "mountly/mount";
import * as mod from "./mount.js";

export interface ProductASettingsData {
  tenantId: string;
  plan: string;
  seats: number;
  apiBase: string;
}

export interface ProductASettingsContext extends FeatureContext {
  tenantId?: string;
  apiUrl?: string;
}

export const productASettings = createOnDemandFeature({
  moduleId: "product-a-settings",

  loadModule: async () => ({
    mount: mod.mountProductASettings as (
      container: HTMLElement,
      props: Record<string, unknown>,
    ) => void,
    unmount: mod.unmountProductASettings,
    update: mod.updateProductASettings,
  }),

  getCacheKey: (context) => {
    const ctx = context as ProductASettingsContext;
    return `product-a-settings:${ctx.apiUrl ?? "/api/product-a"}:${ctx.tenantId ?? ""}`;
  },

  loadData: async (context: FeatureContext) => {
    const ctx = context as ProductASettingsContext;
    if (!ctx.tenantId) return null;
    const apiUrl = ctx.apiUrl ?? "/api/product-a";
    const response = await fetch(`${apiUrl}/settings?tenantId=${encodeURIComponent(ctx.tenantId)}`);
    if (!response.ok) {
      throw new Error(`Product A API error: ${response.statusText}`);
    }
    return response.json() as Promise<ProductASettingsData>;
  },

  render: ({ mod: featureMod, data, container, props }) => {
    featureMod.mount(container, {
      data: (props.data ?? data) as ProductASettingsData | null,
      loading: props.loading,
      error: props.error,
      onClose: () => safeUnmount(container),
    });
  },
});

export { ProductASettings } from "./Component.js";
export { mountProductASettings, unmountProductASettings, updateProductASettings } from "./mount.js";
