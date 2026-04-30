import { test, expect } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});

const HOST = "http://localhost:5175";

test.describe("Island styling with JavaScript disabled", () => {
  test("SSR'd island content remains styled when JS is off (noscript pattern)", async ({ browser }, testInfo) => {
    story.given("a browser context with JS disabled");
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    story.and("the island-nojs-styled fixture is loaded");
    await page.goto(`${HOST}/tests/fixtures/island-nojs-styled.html`);
    story.when("the page renders");
    const result = await page.evaluate(() => {
      const node = document.querySelector("#island .styled-widget") as HTMLElement | null;
      return {
        hasIsland: !!document.getElementById("island"),
        islandHasShadowRoot: !!document.getElementById("island")?.shadowRoot,
        text: node?.textContent ?? "",
        computedColor: node ? getComputedStyle(node).color : "",
      };
    });

    story.then("the island is present");
    expect(result.hasIsland).toBe(true);
    story.then("no shadow root was created");
    expect(result.islandHasShadowRoot).toBe(false);
    story.then("the SSR text renders");
    expect(result.text).toBe("server-rendered");
    story.then("styles are applied");
    expect(result.computedColor).toBe("rgb(11, 22, 33)");
    await context.close();
  });

  test("Same fixture with JS on: island hydrates into a shadow root and is still styled (no double-paint regression)", async ({ page }, testInfo) => {
    story.given("the island-nojs-styled fixture is loaded");
    await page.goto(`${HOST}/tests/fixtures/island-nojs-styled.html`);
    story.when("the user clicks to trigger hydration");
    await page.click("#island");
    await page.waitForFunction(
      () => !!document.getElementById("island")?.shadowRoot?.querySelector(".styled-widget"),
      null,
      { timeout: 8000 },
    );
    story.then("the island has a shadow root");
    const result = await page.evaluate(() => {
      const island = document.getElementById("island");
      const inShadow = island?.shadowRoot?.querySelector(".styled-widget") as HTMLElement | null;
      return {
        hasShadowRoot: !!island?.shadowRoot,
        shadowText: inShadow?.textContent ?? "",
        shadowComputedColor: inShadow ? getComputedStyle(inShadow).color : "",
        documentHasLink: !!document.querySelector('link[rel="stylesheet"][href*="css-loader-asset.css"]'),
      };
    });
    expect(result.hasShadowRoot).toBe(true);
    expect(result.shadowComputedColor).toBe("rgb(11, 22, 33)");
    expect(result.documentHasLink).toBe(true);
    const screenshotPath = testInfo.outputPath("island-nojs-styled.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    story.screenshot({ path: screenshotPath, alt: "Island nojs styled" });
  });
});
