import { test, expect } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});

const HOST = "http://localhost:5175";

test.describe("Multi-widget bundles", () => {
  test("createWidgetBundle: one Svelte bundle, three features, one fetch each for JS and CSS", async ({ page }) => {
    await page.goto(`${HOST}/tests/fixtures/multi-widget-svelte.html`);
    await page.waitForFunction(() => (window as any).__ready && (window as any).__ready(), null, { timeout: 8000 });
    const result = await page.evaluate(() => (window as any).__result);

    expect(result.allMounted).toBe(true);
    // Each shadow root adopted the same shared stylesheet.
    expect(result.adoptedRuleCounts).toEqual([
      result.adoptedRuleCounts[0],
      result.adoptedRuleCounts[0],
      result.adoptedRuleCounts[0],
    ]);
    expect(result.adoptedRuleCounts[0]).toBeGreaterThan(0);
    // mountly's sheetCache returns the same CSSStyleSheet instance for the
    // same CSS string — which proves no duplicated CSSOM allocations.
    expect(result.sameSheetInstance).toBe(true);
    // Per-widget rendering is independent.
    expect(result.counterText).toBe("7");
    expect(result.clockText).toBe("11:42");
    expect(result.statusText).toBe("All systems nominal");
    // Bundle JS fetched exactly once even though 3 features depend on it.
    expect(result.moduleFetchCount).toBe(1);
    // Companion CSS fetched exactly once.
    expect(result.cssFetchCount).toBe(1);
  });

  test("Light-DOM bundle: shadcn-flavoured React widgets share global Tailwind/tokens", async ({ page }) => {
    await page.goto(`${HOST}/tests/fixtures/shadcn-light-dom.html`);
    await page.waitForFunction(() => (window as any).__ready && (window as any).__ready(), null, { timeout: 8000 });
    const result = await page.evaluate(() => (window as any).__result);

    // Every widget renders into light DOM (no shadow root).
    expect(result.shadowRoots).toEqual([false, false, false]);
    // Both primary buttons get the same global Tailwind primary color.
    expect(result.buttonColors[0]).toBe("rgb(60, 80, 220)");
    expect(result.buttonColors[1]).toBe("rgb(60, 80, 220)");
    expect(result.domLooksRight).toBe(true);
    expect(result.moduleFetchCount).toBe(1);
  });

  test("React widget importing @tanstack/react-table works through the mountly pipeline", async ({ page }) => {
    await page.goto(`${HOST}/tests/fixtures/tanstack-table.html`);
    await page.waitForFunction(() => (window as any).__ready && (window as any).__ready(), null, { timeout: 15000 });
    const result = await page.evaluate(() => (window as any).__result);

    expect(result.hasShadowRoot).toBe(true);
    expect(result.headerLabels).toEqual(["ID", "Name", "Score"]);
    expect(result.rowCount).toBe(3);
    expect(result.firstRowDataAttr).toBe("1");
    expect(result.firstRowText).toContain("Alpha");
  });
});
