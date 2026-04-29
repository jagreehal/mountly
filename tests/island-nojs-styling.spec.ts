import { test, expect } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});

const HOST = "http://localhost:5175";

test.describe("Island styling with JavaScript disabled", () => {
  test("SSR'd island content remains styled when JS is off (noscript pattern)", async ({ browser }) => {
    // The recommended noscript pattern: pair the island with a hand-authored
    // <link rel="stylesheet"> in <head>. mountly cannot ship a runtime
    // <link> when no script ever runs — but the document-level stylesheet
    // already does the work, and is harmless when JS is on.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`${HOST}/tests/fixtures/island-nojs-styled.html`);

    const result = await page.evaluate(() => {
      const node = document.querySelector("#island .styled-widget") as HTMLElement | null;
      return {
        hasIsland: !!document.getElementById("island"),
        islandHasShadowRoot: !!document.getElementById("island")?.shadowRoot,
        text: node?.textContent ?? "",
        computedColor: node ? getComputedStyle(node).color : "",
      };
    });

    expect(result.hasIsland).toBe(true);
    // No JS = no shadow root. The SSR span stays in the light DOM and is
    // styled by the document <link>.
    expect(result.islandHasShadowRoot).toBe(false);
    expect(result.text).toBe("server-rendered");
    expect(result.computedColor).toBe("rgb(11, 22, 33)");

    await context.close();
  });

  test("Same fixture with JS on: island hydrates into a shadow root and is still styled (no double-paint regression)", async ({ page }) => {
    await page.goto(`${HOST}/tests/fixtures/island-nojs-styled.html`);
    // Trigger hydration and wait for the shadow root to appear.
    await page.click("#island");
    await page.waitForFunction(
      () => !!document.getElementById("island")?.shadowRoot?.querySelector(".styled-widget"),
      null,
      { timeout: 8000 },
    );

    const result = await page.evaluate(() => {
      const island = document.getElementById("island");
      const inShadow = island?.shadowRoot?.querySelector(".styled-widget") as HTMLElement | null;
      return {
        hasShadowRoot: !!island?.shadowRoot,
        shadowText: inShadow?.textContent ?? "",
        shadowComputedColor: inShadow ? getComputedStyle(inShadow).color : "",
        // Document <link> coexists harmlessly.
        documentHasLink: !!document.querySelector('link[rel="stylesheet"][href*="css-loader-asset.css"]'),
      };
    });

    expect(result.hasShadowRoot).toBe(true);
    expect(result.shadowComputedColor).toBe("rgb(11, 22, 33)");
    expect(result.documentHasLink).toBe(true);
  });
});
