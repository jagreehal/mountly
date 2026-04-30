import { test, expect, type Page } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});

const HOST = "http://localhost:5175";

async function readResult(page: Page) {
  await page.waitForFunction(
    () => (window as any).__ready && (window as any).__ready(),
    null,
    { timeout: 15_000 },
  );
  return page.evaluate(() => (window as any).__result);
}

// Same shape proved per framework: pure UI library used both directly
// (the "Next.js / Nuxt / Svelte app" path) and via a tiny mountly bridge.
// The library has no mountly imports; the bridge is where mountly meets
// the framework.
test.describe("Bridge pattern: framework-agnostic UI library + mountly", () => {
  test("React: pure UI library renders both directly via createRoot AND through the mountly bridge (with Radix Slot asChild)", async ({ page }, testInfo) => {
    story.given("the bridge-host fixture is loaded");
    await page.goto(`${HOST}/tests/fixtures/bridge-host.html`);
    story.when("the bundle is ready");
    const result = await readResult(page);
    story.then("the bridge id is correct");
    expect(result.bridgeId).toBe("widgets-bridge@1.0.0");
    story.then("direct rendering works");
    expect(result.directRendered).toBe(true);
    story.then("the direct button has correct text");
    expect(result.directButtonText).toBe("Used directly, no mountly");
    story.then("styles are applied directly");
    expect(result.directButtonColor).toBe("rgb(60, 80, 220)");
    story.then("shadow roots are as expected");
    expect(result.shadowRoots).toEqual([false, false, false]);
    story.then("hero CTA has correct tag");
    expect(result.heroCtaTag).toBe("a");
    story.then("hero CTA has correct href");
    expect(result.heroCtaHref).toBe("/start");
    story.then("hero CTA has button class");
    expect(result.heroCtaHasButtonClass).toBe(true);
    story.then("hero CTA has correct color");
    expect(result.heroCtaColor).toBe("rgb(60, 80, 220)");
    story.then("newsletter button has correct color");
    expect(result.newsletterButtonColor).toBe("rgb(255, 255, 255)");
    story.then("the bundle was fetched once");
    expect(result.bridgeFetchCount).toBe(1);
    const screenshotPath = testInfo.outputPath("bridge-host.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    story.screenshot({ path: screenshotPath, alt: "Bridge host" });
  });

  test("Vue: pure UI library renders both directly via createApp AND through the mountly bridge", async ({ page }, testInfo) => {
    story.given("the bridge-vue-host fixture is loaded");
    await page.goto(`${HOST}/tests/fixtures/bridge-vue-host.html`);
    story.when("the bundle is ready");
    const result = await readResult(page);
    story.then("the bridge id is correct");
    expect(result.bridgeId).toBe("vue-widgets-bridge@1.0.0");
    story.then("direct rendering works");
    expect(result.directRendered).toBe(true);
    story.then("the direct button has correct text");
    expect(result.directButtonText.trim()).toBe("Used directly, no mountly");
    story.then("styles are applied directly");
    expect(result.directButtonColor).toBe("rgb(60, 80, 220)");
    story.then("shadow roots are as expected");
    expect(result.shadowRoots).toEqual([false, false, false]);
    const screenshotPath = testInfo.outputPath("bridge-vue-host.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    story.screenshot({ path: screenshotPath, alt: "Bridge Vue host" });
  });

  test("Svelte: pure UI library renders both directly via class constructors AND through the mountly bridge", async ({ page }) => {
    await page.goto(`${HOST}/tests/fixtures/bridge-svelte-host.html`);
    const result = await readResult(page);

    expect(result.bridgeId).toBe("svelte-widgets-bridge@1.0.0");
    expect(result.directRendered).toBe(true);
    expect(result.directButtonText).toBe("Used directly, no mountly");
    expect(result.directButtonColor).toBe("rgb(60, 80, 220)");
    expect(result.shadowRoots).toEqual([false, false, false]);
    expect(result.heroCtaTag).toBe("a");
    expect(result.heroCtaHref).toBe("/start");
    expect(result.heroCtaColor).toBe("rgb(60, 80, 220)");
    expect(result.newsletterButtonColor).toBe("rgb(255, 255, 255)");
    expect(result.bridgeFetchCount).toBe(1);
  });
});
