import { test, expect } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});

const HOST = "http://localhost:5175";

test.describe("Multi-widget bundles", () => {
  test("createWidgetBundle: one Svelte bundle, three features, one fetch each for JS and CSS", async ({ page }, testInfo) => {
    story.given("the multi-widget-svelte fixture is loaded");
    await page.goto(`${HOST}/tests/fixtures/multi-widget-svelte.html`);
    story.when("the bundle is ready");
    await page.waitForFunction(() => (window as any).__ready && (window as any).__ready(), null, { timeout: 8000 });
    story.then("all widgets mount");
    const result = await page.evaluate(() => (window as any).__result);
    expect(result.allMounted).toBe(true);
    story.then("the same stylesheet is shared");
    expect(result.adoptedRuleCounts).toEqual([
      result.adoptedRuleCounts[0],
      result.adoptedRuleCounts[0],
      result.adoptedRuleCounts[0],
    ]);
    story.then("the shared sheet is the same instance");
    expect(result.sameSheetInstance).toBe(true);
    story.then("each widget renders independently");
    expect(result.counterText).toBe("7");
    expect(result.clockText).toBe("11:42");
    expect(result.statusText).toBe("All systems nominal");
    story.then("JS was fetched once");
    expect(result.moduleFetchCount).toBe(1);
    story.then("CSS was fetched once");
    expect(result.cssFetchCount).toBe(1);
    const screenshotPath = testInfo.outputPath("multi-widget-svelte.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    story.screenshot({ path: screenshotPath, alt: "Multi-widget Svelte bundle" });
  });

  test("Light-DOM bundle: shadcn-flavoured React widgets share global Tailwind/tokens", async ({ page }, testInfo) => {
    story.given("the shadcn-light-dom fixture is loaded");
    await page.goto(`${HOST}/tests/fixtures/shadcn-light-dom.html`);
    story.when("the bundle is ready");
    await page.waitForFunction(() => (window as any).__ready && (window as any).__ready(), null, { timeout: 8000 });
    story.then("all widgets render to light DOM");
    const result = await page.evaluate(() => (window as any).__result);
    expect(result.shadowRoots).toEqual([false, false, false]);
    story.then("buttons share the same color");
    expect(result.buttonColors[0]).toBe("rgb(60, 80, 220)");
    expect(result.buttonColors[1]).toBe("rgb(60, 80, 220)");
    story.then("the DOM looks right");
    expect(result.domLooksRight).toBe(true);
    story.then("JS was fetched once");
    expect(result.moduleFetchCount).toBe(1);
    const screenshotPath = testInfo.outputPath("shadcn-light-dom.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    story.screenshot({ path: screenshotPath, alt: "Shadcn light DOM" });
  });

  test("React widget importing @tanstack/react-table works through the mountly pipeline", async ({ page }, testInfo) => {
    story.given("the tanstack-table fixture is loaded");
    await page.goto(`${HOST}/tests/fixtures/tanstack-table.html`);
    story.when("the table is ready");
    await page.waitForFunction(() => (window as any).__ready && (window as any).__ready(), null, { timeout: 15000 });
    story.then("the widget has a shadow root");
    const result = await page.evaluate(() => (window as any).__result);
    expect(result.hasShadowRoot).toBe(true);
    story.then("the table has correct headers");
    expect(result.headerLabels).toEqual(["ID", "Name", "Score"]);
    story.then("the table has rows");
    expect(result.rowCount).toBe(3);
    story.then("the first row has data");
    expect(result.firstRowDataAttr).toBe("1");
    story.and("the first row text includes the expected name");
    expect(result.firstRowText).toContain("Alpha");
    const screenshotPath = testInfo.outputPath("tanstack-table.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    story.screenshot({ path: screenshotPath, alt: "TanStack table" });
  });
});
