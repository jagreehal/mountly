import { createEventBus, type EventBus, type EventMap, type EventValidator } from "./bus.js";

// ---------------------------------------------------------------------------
// Generic typed platform bus — the recommended API
// ---------------------------------------------------------------------------

export interface CreateTypedPlatformBusOptions<TEvents extends EventMap> {
  namespace?: string;
  target?: EventTarget;
  validators?: Partial<{ [K in keyof TEvents]: EventValidator<TEvents[K]> }>;
}

export function createTypedPlatformBus<TEvents extends EventMap>(
  options: CreateTypedPlatformBusOptions<TEvents> = {},
): EventBus<TEvents> {
  return createEventBus<TEvents>({
    namespace: options.namespace ?? "mountly-platform",
    validators: options.validators,
    target: options.target,
  });
}

// ---------------------------------------------------------------------------
// Deprecated domain-specific contracts — kept for backward compatibility
// ---------------------------------------------------------------------------

/** @deprecated Define your own event payload types instead. */
export interface PaymentSelectedPayload {
  paymentId: string;
  amount: number;
  currency: string;
}

/** @deprecated Define your own event payload types instead. */
export interface CartUpdatedPayload {
  itemCount: number;
  total: number;
  currency: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** @deprecated Define your own validators instead. */
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

/** @deprecated Define your own validators instead. */
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

/** @deprecated Use `createTypedPlatformBus<YourEvents>()` instead. */
export interface PlatformEvents extends EventMap {
  "payment:selected": PaymentSelectedPayload;
  "cart:updated": CartUpdatedPayload;
}

/** @deprecated Use `createTypedPlatformBus<YourEvents>()` with your own validators. */
export const platformEventValidators = {
  "payment:selected": isPaymentSelectedPayload,
  "cart:updated": isCartUpdatedPayload,
} as const;

/** @deprecated Use `createTypedPlatformBus<YourEvents>()` instead. */
export interface CreatePlatformBusOptions {
  namespace?: string;
  target?: EventTarget;
}

/** @deprecated Use `createTypedPlatformBus<YourEvents>()` instead. */
export function createPlatformBus(
  options: CreatePlatformBusOptions = {},
): EventBus<PlatformEvents> {
  return createTypedPlatformBus<PlatformEvents>({
    namespace: options.namespace,
    validators: platformEventValidators,
    target: options.target,
  });
}
