import { createEventBus, type EventBus, type EventMap } from "./bus.js";

export interface PaymentSelectedPayload {
  paymentId: string;
  amount: number;
  currency: string;
}

export interface CartUpdatedPayload {
  itemCount: number;
  total: number;
  currency: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isPaymentSelectedPayload(payload: unknown): payload is PaymentSelectedPayload {
  return (
    isObject(payload) &&
    typeof payload.paymentId === "string" &&
    payload.paymentId.length > 0 &&
    typeof payload.amount === "number" &&
    typeof payload.currency === "string" &&
    payload.currency.length > 0
  );
}

export function isCartUpdatedPayload(payload: unknown): payload is CartUpdatedPayload {
  return (
    isObject(payload) &&
    typeof payload.itemCount === "number" &&
    Number.isInteger(payload.itemCount) &&
    payload.itemCount >= 0 &&
    typeof payload.total === "number" &&
    typeof payload.currency === "string" &&
    payload.currency.length > 0
  );
}

export interface PlatformEvents extends EventMap {
  "payment:selected": PaymentSelectedPayload;
  "cart:updated": CartUpdatedPayload;
}

export const platformEventValidators = {
  "payment:selected": isPaymentSelectedPayload,
  "cart:updated": isCartUpdatedPayload,
} as const;

export interface CreatePlatformBusOptions {
  namespace?: string;
  target?: EventTarget;
}

export function createPlatformBus(
  options: CreatePlatformBusOptions = {},
): EventBus<PlatformEvents> {
  return createEventBus<PlatformEvents>({
    namespace: options.namespace ?? "mountly-platform",
    validators: platformEventValidators,
    target: options.target,
  });
}
