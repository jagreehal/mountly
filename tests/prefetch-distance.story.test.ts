// @vitest-environment jsdom
import { story } from "executable-stories-vitest";
import { describe, expect, it, vi, beforeEach, afterEach } from "vite-plus/test";
import { createMouseTrailPrefetcher } from "../packages/mountly/src/prefetch";

function makeElement(rect: DOMRect): HTMLElement {
  const el = document.createElement("div");
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue(rect);
  return el;
}

function makeDOMRect(x: number, y: number, w: number, h: number): DOMRect {
  return {
    x,
    y,
    width: w,
    height: h,
    left: x,
    top: y,
    right: x + w,
    bottom: y + h,
    toJSON: () => {},
  } as DOMRect;
}

describe("mouseTrailPrefetcher distance", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses nearest-edge distance, not top-left corner distance", ({ task }) => {
    story.init(task);

    story.given("element at (100, 200) sized 200x100, threshold 30, delay 0");
    const rect = makeDOMRect(100, 200, 200, 100);
    const el = makeElement(rect);
    const feature = { preload: vi.fn().mockResolvedValue(undefined) } as any;

    const cleanup = createMouseTrailPrefetcher({
      feature,
      element: el,
      proximityThreshold: 30,
      delay: 0,
    });

    story.when("cursor at (200, 190) — 10px above the top edge, horizontally centered");
    story.then("correct nearest-edge distance = 10 (< 30), buggy corner distance ≈ 100.5 (> 30)");
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 200, clientY: 190 }));
    vi.runAllTimers();

    expect(feature.preload).toHaveBeenCalled();

    cleanup();
  });
});
