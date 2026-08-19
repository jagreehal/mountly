// @vitest-environment jsdom
import { story } from "executable-stories-vitest";
import { describe, expect, it, vi, beforeEach, afterEach } from "vite-plus/test";
import { createDevtoolsPanel } from "../packages/mountly/src/devtools";

describe("Devtools visibility pause", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pauses the interval when the tab is hidden and resumes when visible", ({ task }) => {
    story.init(task);
    story.given("a devtools panel is created");

    const { destroy } = createDevtoolsPanel();

    const updateSpy = vi.spyOn(
      document.querySelector("[data-mountly-devtools-features]")!,
      "innerHTML",
      "set",
    );

    story.when("1 second passes while visible");
    vi.advanceTimersByTime(1000);
    const callsWhileVisible = updateSpy.mock.calls.length;
    expect(callsWhileVisible).toBeGreaterThan(0);

    story.when("tab becomes hidden");
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    updateSpy.mockClear();
    vi.advanceTimersByTime(3000);

    story.then("no updates should fire while hidden");
    expect(updateSpy.mock.calls.length).toBe(0);

    story.when("tab becomes visible again");
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    updateSpy.mockClear();
    vi.advanceTimersByTime(1000);

    story.then("updates should resume");
    expect(updateSpy.mock.calls.length).toBeGreaterThan(0);

    destroy();
  });
});
