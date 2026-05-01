import { test, expect } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});

const HOST = "http://localhost:5175";

test.describe("Monorepo: shared UI library + widgets package + third-party deps", () => {
  test("widgets bundle imports from a sibling library and from npm (clsx), all three render with shared styles", async ({ page }, testInfo) => {
    story.given("the monorepo-host fixture is loaded");
    await page.goto(`${HOST}/tests/fixtures/monorepo-host.html`);
    story.when("the bundle is ready");
    await page.waitForFunction(
      () => (window as any).__ready && (window as any).__ready(),
      null,
      { timeout: 15_000 },
    );
    story.then("the library marker is present");
    const result = await page.evaluate(() => (window as any).__result);
    expect(result.libraryMarker).toBe("monorepo-ui-lib@simulated");
    story.then("chips render correctly");
    expect(result.chipText).toEqual(["live", "healthy", "Enterprise"]);
    story.then("button classes include ui-btn");
    expect(result.firstButtonClasses).toContain("ui-btn");
    expect(result.firstButtonClasses).toMatch(/ui-btn-(default|primary)/);
    story.then("the same stylesheet is shared");
    expect(result.sameSheet).toBe(true);
    story.then("the shared CSS reaches the shadow root");
    expect(result.adoptedRuleCount).toBeGreaterThan(0);
    story.then("JS was fetched once");
    expect(result.bundleFetchCount).toBe(1);
    story.then("CSS was fetched once");
    expect(result.cssFetchCount).toBe(1);
    story.then("props are plumbed correctly");
    expect(result.counterStart).toBe("5");
    const screenshotPath = testInfo.outputPath("monorepo-host.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    story.screenshot({ path: screenshotPath, alt: "Monorepo host" });
  });
});
