// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  createTypedPlatformBus,
  // Deprecated re-exports should still exist
  createPlatformBus,
} from "../packages/mountly/src/contracts.js";

interface CustomEvents extends Record<string, unknown> {
  "user:login": { userId: string };
  "user:logout": { reason: string };
}

describe("contracts – generic createTypedPlatformBus", () => {
  it("creates a typed bus from consumer-defined events", () => {
    const bus = createTypedPlatformBus<CustomEvents>({
      namespace: "test",
    });

    const received: unknown[] = [];
    bus.on("user:login", (payload) => {
      received.push(payload);
    });

    bus.emit("user:login", { userId: "abc" });
    expect(received).toEqual([{ userId: "abc" }]);
  });

  it("backward-compat: createPlatformBus still works", () => {
    const bus = createPlatformBus({ namespace: "compat-test" });
    const received: unknown[] = [];
    bus.on("payment:selected", (payload) => {
      received.push(payload);
    });
    bus.emit("payment:selected", {
      paymentId: "p1",
      amount: 100,
      currency: "USD",
    });
    expect(received).toEqual([{ paymentId: "p1", amount: 100, currency: "USD" }]);
  });
});
