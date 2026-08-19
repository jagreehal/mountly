// @vitest-environment jsdom
import { story } from "executable-stories-vitest";
import { describe, expect, it, vi, beforeEach, afterEach } from "vite-plus/test";
import { createOverlay } from "../packages/mountly/src/positioning";

describe("Overlay handleOutsideClick race", () => {
  let element: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    element = document.createElement("div");
    document.body.appendChild(element);
  });

  afterEach(() => {
    vi.useRealTimers();
    element.remove();
  });

  it("does not close immediately when the opening click propagates in capture phase", ({ task }) => {
    story.init(task);
    story.given("an overlay that closes on outside click");

    const onClose = vi.fn();
    const overlay = createOverlay({
      element,
      closeOnOutsideClick: true,
      onClose,
    });

    story.when("open() is called inside a click handler and the same click propagates");

    const trigger = document.createElement("button");
    document.body.appendChild(trigger);

    trigger.addEventListener("click", () => {
      overlay.open();
    });

    // Simulate: click fires, handler calls open(), capture-phase outside-click fires in same tick
    trigger.click();

    story.then("the overlay should remain open (same-tick click is ignored)");
    expect(overlay.isOpen()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();

    story.then("a click after 10ms should close it");
    vi.advanceTimersByTime(10);
    document.body.click();
    expect(overlay.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);

    trigger.remove();
  });
});
