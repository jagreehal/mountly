import {
  createOnDemandFeature,
  safeUnmount,
  type FeatureContext,
} from "mountly";
import * as mod from "./mount.js";
import type { PaymentBreakdownData } from "./Component.js";

export interface PaymentBreakdownContext extends FeatureContext {
  paymentId: string;
  apiUrl?: string;
}

export const paymentBreakdown = createOnDemandFeature({
  moduleId: "payment-breakdown",

  loadModule: async () => ({
    mount: mod.mountPaymentBreakdown as (
      container: HTMLElement,
      props: Record<string, unknown>
    ) => void,
    unmount: mod.unmountPaymentBreakdown,
    update: ((container: HTMLElement, props: Record<string, unknown>) => {
      const paymentData = (props.data ?? null) as PaymentBreakdownData | null;
      if (!paymentData) return;
      mod.updatePaymentBreakdown(container, {
        data: paymentData,
        onClose: () => safeUnmount(container),
      });
    }) as (container: HTMLElement, props: Record<string, unknown>) => void,
  }),

  getCacheKey: (context) => {
    const ctx = context as PaymentBreakdownContext;
    return `payment-breakdown:${ctx.apiUrl ?? "/api/payments"}:${ctx.paymentId ?? ""}`;
  },

  loadData: async (context: FeatureContext) => {
    const ctx = context as PaymentBreakdownContext;
    // No paymentId → caller must pass `data` in props. Skip the fetch.
    if (!ctx.paymentId) return null;
    const apiUrl = ctx.apiUrl ?? "/api/payments";
    const response = await fetch(`${apiUrl}/${ctx.paymentId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch payment: ${response.statusText}`);
    }
    return response.json() as Promise<PaymentBreakdownData>;
  },

  render: ({ mod: featureMod, data, container, props }) => {
    // Prefer explicitly passed `data` prop; fall back to data from loadData.
    const paymentData = (props.data ?? data) as PaymentBreakdownData | null;
    if (!paymentData) {
      throw new Error(
        "[payment-breakdown] no data: pass `data` in props or configure loadData with a paymentId context"
      );
    }

    featureMod.mount(container, {
      data: paymentData,
      onClose: () => {
        safeUnmount(container);
      },
    });
  },
});

export { PaymentBreakdown, type PaymentBreakdownData } from "./Component.js";
export {
  mountPaymentBreakdown,
  unmountPaymentBreakdown,
  updatePaymentBreakdown,
} from "./mount.js";

// Natural minimum footprint — apply to the host's mount div to reserve
// layout space before the widget renders (prevents CLS).
export const paymentBreakdownDimensions = {
  minWidth: 320,
  minHeight: 240,
} as const;
