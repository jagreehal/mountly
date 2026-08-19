// @vitest-environment jsdom
import { story } from "executable-stories-vitest";
import { describe, expect, it, vi, beforeEach } from "vite-plus/test";
import { createPredictivePrefetcher } from "../packages/mountly/src/prefetch";
import type { OnDemandFeature } from "../packages/mountly/src/feature";

function makeFakeFeature(id: string, preloadFn: () => Promise<void>): OnDemandFeature {
  return {
    id,
    preload: preloadFn,
    activate: async () => ({ mount: vi.fn(), unmount: vi.fn() }),
    getStatus: () => "idle" as const,
  } as unknown as OnDemandFeature;
}

describe("prefetchStaggered await", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", (cb: () => void) => setTimeout(cb, 0));
  });

  it("stays active until all staggered items have been prefetched", async ({ task }) => {
    story.init(task);
    story.given("3 features with staggered prefetch (staggerDelay=50)");

    const order: string[] = [];
    const features = ["a", "b", "c"].map((id) =>
      makeFakeFeature(id, async () => {
        order.push(id);
      }),
    );

    const prefetcher = createPredictivePrefetcher({
      features: features.map((f) => ({ feature: f })),
      strategy: "staggered",
      staggerDelay: 50,
    });

    story.when("prefetcher starts");
    prefetcher.start();

    // Flush the requestIdleCallback shim
    await vi.advanceTimersByTimeAsync(0);

    story.then("after first item, prefetcher should still be active");
    expect(prefetcher.isActive()).toBe(true);

    // Advance through remaining stagger delays
    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(50);

    story.then("all items should have been prefetched in order");
    expect(order).toEqual(["a", "b", "c"]);

    story.then("prefetcher should be inactive after all items complete");
    expect(prefetcher.isActive()).toBe(false);
  });

  it("abort cancels pending staggered items", async ({ task }) => {
    story.init(task);
    story.given("3 features with staggered prefetch");

    const order: string[] = [];
    const features = ["a", "b", "c"].map((id) =>
      makeFakeFeature(id, async () => {
        order.push(id);
      }),
    );

    const prefetcher = createPredictivePrefetcher({
      features: features.map((f) => ({ feature: f })),
      strategy: "staggered",
      staggerDelay: 50,
    });

    prefetcher.start();
    await vi.advanceTimersByTimeAsync(0);

    story.when("abort is called after first item");
    prefetcher.abort();

    await vi.advanceTimersByTimeAsync(200);

    story.then("only the first item should have been prefetched");
    expect(order).toEqual(["a"]);
  });
});
