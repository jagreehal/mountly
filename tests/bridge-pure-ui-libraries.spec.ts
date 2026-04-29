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
  test("React: pure UI library renders both directly via createRoot AND through the mountly bridge (with Radix Slot asChild)", async ({ page }) => {
    await page.goto(`${HOST}/tests/fixtures/bridge-host.html`);
    const result = await readResult(page);

    expect(result.bridgeId).toBe("widgets-bridge@1.0.0");
    expect(result.directRendered).toBe(true);
    expect(result.directButtonText).toBe("Used directly, no mountly");
    expect(result.directButtonColor).toBe("rgb(60, 80, 220)");
    expect(result.shadowRoots).toEqual([false, false, false]);
    expect(result.heroCtaTag).toBe("a");
    expect(result.heroCtaHref).toBe("/start");
    expect(result.heroCtaHasButtonClass).toBe(true);
    expect(result.heroCtaColor).toBe("rgb(60, 80, 220)");
    expect(result.newsletterButtonColor).toBe("rgb(255, 255, 255)");
    expect(result.bridgeFetchCount).toBe(1);
  });

  test("Vue: pure UI library renders both directly via createApp AND through the mountly bridge", async ({ page }) => {
    await page.goto(`${HOST}/tests/fixtures/bridge-vue-host.html`);
    const result = await readResult(page);

    expect(result.bridgeId).toBe("vue-widgets-bridge@1.0.0");
    expect(result.directRendered).toBe(true);
    expect(result.directButtonText.trim()).toBe("Used directly, no mountly");
    expect(result.directButtonColor).toBe("rgb(60, 80, 220)");
    expect(result.shadowRoots).toEqual([false, false, false]);
    expect(result.heroCtaTag).toBe("a");
    expect(result.heroCtaHref).toBe("/start");
    expect(result.heroCtaColor).toBe("rgb(60, 80, 220)");
    expect(result.newsletterButtonColor).toBe("rgb(255, 255, 255)");
    expect(result.bridgeFetchCount).toBe(1);
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
