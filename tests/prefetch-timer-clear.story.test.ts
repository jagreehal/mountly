// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createMouseTrailPrefetcher,
  recordInteraction,
  getInteractionHistory,
  resetInteractionHistory,
} from "../packages/mountly/src/prefetch.js";

describe("mouseTrailPrefetcher timer clear (bug 1)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clears delay timer when mouse moves out of proximity", () => {
    const preloadSpy = vi.fn(() => Promise.resolve());
    const feature = { id: "f1", preload: preloadSpy } as any;
    const el = document.createElement("div");
    document.body.appendChild(el);

    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      left: 100, right: 200, top: 100, bottom: 200,
      width: 100, height: 100, x: 100, y: 100, toJSON() {},
    });

    const cleanup = createMouseTrailPrefetcher({
      feature,
      element: el,
      proximityThreshold: 50,
      delay: 500,
    });

    // Mouse close to element (distance ~0, inside rect projection)
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 150, clientY: 150 }));

    // Mouse far away before delay fires
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 500, clientY: 500 }));

    // Advance past the delay
    vi.useFakeTimers();
    vi.advanceTimersByTime(600);
    vi.useRealTimers();

    expect(preloadSpy).not.toHaveBeenCalled();

    cleanup();
    el.remove();
  });
});

describe("interactionHistory cap (bug 2)", () => {
  afterEach(() => {
    resetInteractionHistory();
  });

  it("evicts oldest entry when map exceeds 500 entries", () => {
    for (let i = 0; i < 510; i++) {
      recordInteraction(`feature-${i}`);
    }

    const history = getInteractionHistory();
    expect(history.size).toBeLessThanOrEqual(500);
    // oldest entries should be evicted
    expect(history.has("feature-0")).toBe(false);
    expect(history.has("feature-9")).toBe(false);
    // newest entries should remain
    expect(history.has("feature-509")).toBe(true);
  });
});
