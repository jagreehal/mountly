// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createOverlay } from "../packages/mountly/src/positioning.ts";

describe("overlay updatePosition", () => {
  it("recomputes position styles when called on an open overlay", () => {
    const anchor = document.createElement("div");
    const overlay = document.createElement("div");
    document.body.append(anchor, overlay);

    // jsdom doesn't layout, so getBoundingClientRect returns zeros —
    // but we can verify the style properties are set (position: absolute, top/left in px).
    const handle = createOverlay({
      element: overlay,
      position: { anchor, overlay, placement: "bottom", offset: 8 },
    });

    handle.open();

    // Clear styles to prove updatePosition re-applies them
    overlay.style.top = "";
    overlay.style.left = "";
    overlay.style.position = "";

    handle.updatePosition();

    expect(overlay.style.position).toBe("absolute");
    expect(overlay.style.top).toMatch(/px$/);
    expect(overlay.style.left).toMatch(/px$/);

    handle.close();
    anchor.remove();
    overlay.remove();
  });

  it("creates a ResizeObserver on the anchor when position options are provided (bug 5)", () => {
    const observeSpy = vi.fn();
    const disconnectSpy = vi.fn();
    const originalRO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = vi.fn().mockImplementation(function () {
      return { observe: observeSpy, disconnect: disconnectSpy, unobserve: vi.fn() };
    }) as any;

    const anchor = document.createElement("div");
    const overlay = document.createElement("div");
    document.body.append(anchor, overlay);

    const handle = createOverlay({
      element: overlay,
      position: { anchor, overlay, placement: "bottom", offset: 8 },
    });

    handle.open();
    expect(observeSpy).toHaveBeenCalledWith(anchor);

    handle.close();
    expect(disconnectSpy).toHaveBeenCalled();

    globalThis.ResizeObserver = originalRO;
    anchor.remove();
    overlay.remove();
  });
});
