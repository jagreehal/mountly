import { test, expect } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});

const HOST = "http://localhost:5175";

test.describe("Monorepo: shared UI library + widgets package + third-party deps", () => {
  test("widgets bundle imports from a sibling library and from npm (clsx), all three render with shared styles", async ({ page }) => {
    // Wait long enough for esm.sh dependency resolution on first hit.
    await page.goto(`${HOST}/tests/fixtures/monorepo-host.html`);
    await page.waitForFunction(
      () => (window as any).__ready && (window as any).__ready(),
      null,
      { timeout: 15_000 },
    );
    const result = await page.evaluate(() => (window as any).__result);

    // The "workspace" UI library import resolved.
    expect(result.libraryMarker).toBe("monorepo-ui-lib@simulated");
    // Each widget composed the library's <Chip> primitive with its own label.
    expect(result.chipText).toEqual(["live", "healthy", "Enterprise"]);
    // clsx (a real npm package) merged the library's base button class with
    // the variant. If transitive npm imports were broken we'd see no
    // `ui-btn-default` / `ui-btn-primary` suffixes.
    expect(result.firstButtonClasses).toContain("ui-btn");
    expect(result.firstButtonClasses).toMatch(/ui-btn-(default|primary)/);
    // Shared CSS reaches every widget's shadow root through one adopted sheet.
    expect(result.sameSheet).toBe(true);
    expect(result.adoptedRuleCount).toBeGreaterThan(0);
    // Bundle JS + CSS are each fetched exactly once across three features.
    expect(result.bundleFetchCount).toBe(1);
    expect(result.cssFetchCount).toBe(1);
    // Props plumbed through.
    expect(result.counterStart).toBe("5");
  });
});
