// @vitest-environment jsdom
import { story } from "executable-stories-vitest";
import { describe, expect, it, vi } from "vite-plus/test";
import { eachSwipe } from "../packages/mountly/src/gestures";

describe("eachSwipe stale start guard", () => {
  it("does not fire a swipe when mouseup occurs without a preceding mousedown", ({ task }) => {
    story.init(task);
    story.given("an element with eachSwipe attached and time frozen");

    vi.useFakeTimers({ now: 0 });
    const el = document.createElement("div");
    const handler = vi.fn();
    eachSwipe(el, handler, { threshold: 10 });

    story.when("mouseup fires without a preceding mousedown");
    el.dispatchEvent(new MouseEvent("mouseup", { clientX: 100, clientY: 0, bubbles: true }));

    story.then("the handler is not called");
    expect(handler).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("fires normally when mousedown precedes mouseup", ({ task }) => {
    story.init(task);
    story.given("an element with eachSwipe attached");

    const el = document.createElement("div");
    const handler = vi.fn();
    eachSwipe(el, handler, { threshold: 10 });

    story.when("mousedown then mouseup with enough delta");
    el.dispatchEvent(new MouseEvent("mousedown", { clientX: 0, clientY: 0, bubbles: true }));
    el.dispatchEvent(new MouseEvent("mouseup", { clientX: 100, clientY: 0, bubbles: true }));

    story.then("the handler fires with direction right");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].direction).toBe("right");
  });
});
