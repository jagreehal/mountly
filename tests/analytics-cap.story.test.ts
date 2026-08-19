import { story } from "executable-stories-vitest";
import { describe, expect, it, beforeEach } from "vite-plus/test";
import {
  emitAnalyticsEvent,
  getAnalyticsLog,
  clearAnalyticsLog,
  configureAnalytics,
  createFeatureTimingTracker,
  getModuleTimings,
  type TimingEvent,
} from "../packages/mountly/src/analytics";

function makeEvent(i: number): TimingEvent {
  return { moduleId: `mod-${i}`, phase: "mount_start", timestamp: i };
}

describe("Analytics cap", () => {
  beforeEach(() => {
    clearAnalyticsLog();
    configureAnalytics({ maxEvents: 1000 });
  });

  it("caps eventLog at maxEvents, dropping oldest", ({ task }) => {
    story.init(task);
    story.given("maxEvents is set to 1000 (default)");

    for (let i = 0; i < 1100; i++) {
      emitAnalyticsEvent(makeEvent(i));
    }

    story.then("eventLog length should be capped at 1000");
    const log = getAnalyticsLog();
    expect(log).toHaveLength(1000);

    story.then("oldest events should have been dropped (FIFO)");
    expect(log[0].moduleId).toBe("mod-100");
    expect(log[999].moduleId).toBe("mod-1099");
  });

  it("caps moduleTimings per module", ({ task }) => {
    story.init(task);
    story.given("a tracker for module 'heavy' with maxEvents 50");
    configureAnalytics({ maxEvents: 50 });
    clearAnalyticsLog();

    const tracker = createFeatureTimingTracker("heavy");
    for (let i = 0; i < 80; i++) {
      tracker.recordPhase("mount_start");
    }

    story.then("module timings should be capped at 50");
    const timings = getModuleTimings("heavy");
    expect(timings).toHaveLength(50);
  });

  it("allows custom maxEvents via configureAnalytics", ({ task }) => {
    story.init(task);
    configureAnalytics({ maxEvents: 5 });
    clearAnalyticsLog();

    for (let i = 0; i < 10; i++) {
      emitAnalyticsEvent(makeEvent(i));
    }

    expect(getAnalyticsLog()).toHaveLength(5);
  });
});
