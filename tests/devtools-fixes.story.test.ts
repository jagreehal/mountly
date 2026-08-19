// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { createDevtoolsPanel } from "../packages/mountly/src/devtools.js";
import * as analytics from "../packages/mountly/src/analytics.js";
import { createFeatureTimingTracker } from "../packages/mountly/src/analytics.js";

describe("devtools clear-log button (bug 4)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("calls clearAnalyticsLog when clear-log button is clicked", () => {
    const spy = vi.spyOn(analytics, "clearAnalyticsLog");
    const { destroy } = createDevtoolsPanel();

    const btn = document.querySelector('[data-action="clear-log"]') as HTMLElement;
    expect(btn).toBeTruthy();
    btn.click();

    expect(spy).toHaveBeenCalled();
    destroy();
  });
});

describe("devtools XSS sanitization (bug 6)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("escapes moduleId in feature list to prevent XSS", async () => {
    const malicious = "<img src=x onerror=alert(1)>";
    const tracker = createFeatureTimingTracker(malicious);
    tracker.recordPhase("preload_start");

    const { destroy } = createDevtoolsPanel();

    // The raw HTML string should not appear unescaped in the DOM
    const featuresHtml = document.querySelector("[data-mountly-devtools-features]")!.innerHTML;
    expect(featuresHtml).not.toContain("<img");
    expect(featuresHtml).toContain("&lt;img");

    destroy();
  });
});
