import { test, expect } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});

const HOST = "http://localhost:5175";

async function readResult(page: import("@playwright/test").Page) {
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  return page.evaluate(() => (window as any).__result);
}

test("Svelte adapter applies styles passed as a literal `styles` option (shadow DOM)", async ({ page }, testInfo) => {
  story.given("the svelte-css-styles-option fixture is loaded");
  await page.goto(`${HOST}/tests/fixtures/svelte-css-styles-option.html`);
  story.when("the component mounts");
  const result = await readResult(page);
  story.then("there is a shadow root");
  expect(result.hasShadowRoot).toBe(true);
  story.then("the text renders");
  expect(result.text).toBe("literal");
  story.then("styles are applied");
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
  const screenshotPath = testInfo.outputPath("svelte-css-styles-option.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Svelte CSS styles option" });
});

test("Svelte adapter fetches CSS via `cssUrl` option and adopts it into the shadow root", async ({ page }, testInfo) => {
  story.given("the svelte-css-cssurl-option fixture is loaded");
  await page.goto(`${HOST}/tests/fixtures/svelte-css-cssurl-option.html`);
  story.when("the component mounts");
  const result = await readResult(page);
  story.then("there is a shadow root");
  expect(result.hasShadowRoot).toBe(true);
  story.then("the stylesheet is adopted");
  expect(result.adoptedSheetCount).toBe(1);
  story.then("CSS rules are present");
  expect(result.adoptedRuleCount).toBeGreaterThan(0);
  story.then("styles are applied");
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
  const screenshotPath = testInfo.outputPath("svelte-css-cssurl-option.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Svelte CSS url option" });
});

test("Svelte adapter derives CSS URL from `moduleUrl` option (.js → .css)", async ({ page }, testInfo) => {
  story.given("the svelte-css-moduleurl-option fixture is loaded");
  await page.goto(`${HOST}/tests/fixtures/svelte-css-moduleurl-option.html`);
  story.when("the component mounts");
  const result = await readResult(page);
  story.then("CSS rules are present");
  expect(result.adoptedRuleCount).toBeGreaterThan(0);
  story.then("styles are applied");
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
  const screenshotPath = testInfo.outputPath("svelte-css-moduleurl-option.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Svelte CSS moduleUrl option" });
});

test("Svelte adapter accepts `cssUrl` passed via mount() props", async ({ page }, testInfo) => {
  story.given("the svelte-css-cssurl-prop fixture is loaded");
  await page.goto(`${HOST}/tests/fixtures/svelte-css-cssurl-prop.html`);
  story.when("the component mounts");
  const result = await readResult(page);
  story.then("CSS rules are present");
  expect(result.adoptedRuleCount).toBeGreaterThan(0);
  story.then("styles are applied");
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
  const screenshotPath = testInfo.outputPath("svelte-css-cssurl-prop.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Svelte CSS url prop" });
});

test("Svelte adapter derives CSS from `moduleUrl` passed via mount() props (regression)", async ({ page }, testInfo) => {
  story.given("the svelte-css-moduleurl-prop fixture is loaded");
  await page.goto(`${HOST}/tests/fixtures/svelte-css-moduleurl-prop.html`);
  story.when("the component mounts");
  const result = await readResult(page);
  story.then("CSS rules are present");
  expect(result.adoptedRuleCount).toBeGreaterThan(0);
  story.then("styles are applied");
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
  const screenshotPath = testInfo.outputPath("svelte-css-moduleurl-prop.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Svelte CSS moduleUrl prop" });
});

test("Svelte adapter sends `Accept: text/css` so dev servers return raw CSS, not JS-wrapped modules", async ({ page }, testInfo) => {
  story.given("a mock Vite-like server is set up");
  await page.route("**/__vite_mock__/widget.css", async (route, request) => {
    const accept = request.headers()["accept"] ?? "";
    if (accept.includes("text/css")) {
      await route.fulfill({
        status: 200,
        contentType: "text/css",
        body: ".styled-widget{color:rgb(11, 22, 33)}",
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "text/javascript",
        body: 'export default ".styled-widget{color:rgb(11, 22, 33)}";',
      });
    }
  });
  story.and("the svelte-css-vite-like-server fixture is loaded");
  await page.goto(`${HOST}/tests/fixtures/svelte-css-vite-like-server.html`);
  story.when("the component mounts");
  const result = await readResult(page);
  story.then("CSS rules are present");
  expect(result.adoptedRuleCount).toBeGreaterThan(0);
  story.then("styles are applied");
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
  const screenshotPath = testInfo.outputPath("svelte-css-vite-like-server.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Svelte CSS Vite-like server" });
});

test("Svelte adapter applies styles via head fallback in light DOM (shadow:false, default styleMode)", async ({ page }) => {
  await page.goto(`${HOST}/tests/fixtures/svelte-css-cssurl-light-dom.html`);
  const result = await readResult(page);
  expect(result.hasShadowRoot).toBe(false);
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
  expect(result.hasHeadFallback).toBe(true);
  expect(result.headFallbackHasCss).toBe(true);
});

test("Svelte adapter applies styles via inline <style> in light DOM with styleMode='isolated'", async ({ page }) => {
  await page.goto(`${HOST}/tests/fixtures/svelte-css-moduleurl-prop-light-dom.html`);
  const result = await readResult(page);
  expect(result.hasShadowRoot).toBe(false);
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
  expect(result.hasInlineStyleTag).toBe(true);
  expect(result.inlineStyleHasCss).toBe(true);
});

test("Svelte adapter mount succeeds even when the CSS URL 404s", async ({ page }) => {
  await page.goto(`${HOST}/tests/fixtures/svelte-css-missing-url.html`);
  const result = await readResult(page);
  expect(result.mountError).toBeNull();
  expect(result.hasShadowRoot).toBe(true);
  expect(result.text).toBe("missing");
});

test("Svelte zero-config: createOnDemandFeature({ moduleUrl }) auto-wires CSS into shadow DOM", async ({ page }) => {
  // Astro-grade DX check: only `moduleId` + `moduleUrl` from the host.
  // No render function, no manual props plumbing — the adapter still
  // adopts the sibling .css into the shadow root.
  await page.goto(`${HOST}/tests/fixtures/svelte-css-zero-config.html`);
  await page.waitForFunction(() => (window as any).__ready && (window as any).__ready(), null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.hasShadowRoot).toBe(true);
  expect(result.adoptedRuleCount).toBeGreaterThan(0);
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
});
