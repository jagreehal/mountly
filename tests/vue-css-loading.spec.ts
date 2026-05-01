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

test("Vue adapter applies styles passed as a literal `styles` option (shadow DOM)", async ({ page }, testInfo) => {
  story.given("the vue-css-styles-option fixture is loaded");
  await page.goto(`${HOST}/tests/fixtures/vue-css-styles-option.html`);
  story.when("the component mounts");
  const result = await readResult(page);
  story.then("there is a shadow root");
  expect(result.hasShadowRoot).toBe(true);
  story.then("the text renders");
  expect(result.text).toBe("literal");
  story.then("styles are applied");
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
  const screenshotPath = testInfo.outputPath("vue-css-styles-option.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Vue CSS styles option" });
});

test("Vue adapter fetches CSS via `cssUrl` option and adopts it into the shadow root", async ({ page }, testInfo) => {
  story.given("the vue-css-cssurl-option fixture is loaded");
  await page.goto(`${HOST}/tests/fixtures/vue-css-cssurl-option.html`);
  story.when("the component mounts");
  const result = await readResult(page);
  story.then("there is a shadow root");
  expect(result.hasShadowRoot).toBe(true);
  story.then("CSS rules are present");
  expect(result.adoptedRuleCount).toBeGreaterThan(0);
  story.then("styles are applied");
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
  const screenshotPath = testInfo.outputPath("vue-css-cssurl-option.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Vue CSS url option" });
});

test("Vue adapter derives CSS URL from `moduleUrl` option (.js → .css)", async ({ page }, testInfo) => {
  story.given("the vue-css-moduleurl-option fixture is loaded");
  await page.goto(`${HOST}/tests/fixtures/vue-css-moduleurl-option.html`);
  story.when("the component mounts");
  const result = await readResult(page);
  story.then("CSS rules are present");
  expect(result.adoptedRuleCount).toBeGreaterThan(0);
  story.then("styles are applied");
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
  const screenshotPath = testInfo.outputPath("vue-css-moduleurl-option.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Vue CSS moduleUrl option" });
});

test("Vue adapter accepts `cssUrl` passed via mount() props", async ({ page }, testInfo) => {
  story.given("the vue-css-cssurl-prop fixture is loaded");
  await page.goto(`${HOST}/tests/fixtures/vue-css-cssurl-prop.html`);
  story.when("the component mounts");
  const result = await readResult(page);
  story.then("CSS rules are present");
  expect(result.adoptedRuleCount).toBeGreaterThan(0);
  story.then("styles are applied");
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
  const screenshotPath = testInfo.outputPath("vue-css-cssurl-prop.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Vue CSS url prop" });
});

test("Vue adapter derives CSS from `moduleUrl` passed via mount() props", async ({ page }, testInfo) => {
  story.given("the vue-css-moduleurl-prop fixture is loaded");
  await page.goto(`${HOST}/tests/fixtures/vue-css-moduleurl-prop.html`);
  story.when("the component mounts");
  const result = await readResult(page);
  story.then("CSS rules are present");
  expect(result.adoptedRuleCount).toBeGreaterThan(0);
  story.then("styles are applied");
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
  const screenshotPath = testInfo.outputPath("vue-css-moduleurl-prop.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Vue CSS moduleUrl prop" });
});

test("Vue adapter sends `Accept: text/css` so dev servers return raw CSS, not JS-wrapped modules", async ({ page }, testInfo) => {
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
  story.and("the vue-css-vite-like-server fixture is loaded");
  await page.goto(`${HOST}/tests/fixtures/vue-css-vite-like-server.html`);
  story.when("the component mounts");
  const result = await readResult(page);
  story.then("CSS rules are present");
  expect(result.adoptedRuleCount).toBeGreaterThan(0);
  story.then("styles are applied");
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
  const screenshotPath = testInfo.outputPath("vue-css-vite-like-server.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Vue CSS Vite-like server" });
});

test("Vue adapter applies styles via head fallback in light DOM (shadow:false, default styleMode)", async ({ page }, testInfo) => {
  story.given("the vue-css-cssurl-light-dom fixture is loaded");
  await page.goto(`${HOST}/tests/fixtures/vue-css-cssurl-light-dom.html`);
  story.when("the component mounts");
  const result = await readResult(page);
  story.then("there is no shadow root");
  expect(result.hasShadowRoot).toBe(false);
  story.then("styles are applied");
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
  story.then("head fallback is used");
  expect(result.hasHeadFallback).toBe(true);
  story.then("the fallback has CSS");
  expect(result.headFallbackHasCss).toBe(true);
  const screenshotPath = testInfo.outputPath("vue-css-cssurl-light-dom.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Vue CSS head fallback" });
});

test("Vue adapter applies styles via inline <style> in light DOM with styleMode='isolated'", async ({ page }, testInfo) => {
  story.given("the vue-css-moduleurl-prop-light-dom fixture is loaded");
  await page.goto(`${HOST}/tests/fixtures/vue-css-moduleurl-prop-light-dom.html`);
  story.when("the component mounts");
  const result = await readResult(page);
  story.then("there is no shadow root");
  expect(result.hasShadowRoot).toBe(false);
  story.then("styles are applied");
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
  story.then("inline style tag is present");
  expect(result.hasInlineStyleTag).toBe(true);
  story.then("the inline style has CSS");
  expect(result.inlineStyleHasCss).toBe(true);
  const screenshotPath = testInfo.outputPath("vue-css-moduleurl-prop-light-dom.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Vue CSS inline style" });
});

test("Vue adapter mount succeeds even when the CSS URL 404s", async ({ page }, testInfo) => {
  story.given("the vue-css-missing-url fixture is loaded");
  await page.goto(`${HOST}/tests/fixtures/vue-css-missing-url.html`);
  story.when("the component mounts");
  const result = await readResult(page);
  story.then("no mount error occurred");
  expect(result.mountError).toBeNull();
  story.then("there is a shadow root");
  expect(result.hasShadowRoot).toBe(true);
  story.then("the text renders");
  expect(result.text).toBe("missing");
  const screenshotPath = testInfo.outputPath("vue-css-missing-url.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Vue CSS missing URL" });
});

test("Vue zero-config: createOnDemandFeature({ moduleUrl }) auto-wires CSS into shadow DOM", async ({ page }, testInfo) => {
  story.given("the vue-css-zero-config fixture is loaded");
  await page.goto(`${HOST}/tests/fixtures/vue-css-zero-config.html`);
  story.when("the feature is ready");
  await page.waitForFunction(() => (window as any).__ready && (window as any).__ready(), null, { timeout: 8000 });
  story.and("the component mounts");
  const result = await page.evaluate(() => (window as any).__result);
  story.then("there is a shadow root");
  expect(result.hasShadowRoot).toBe(true);
  story.then("CSS rules are auto-wired");
  expect(result.adoptedRuleCount).toBeGreaterThan(0);
  story.then("styles are applied");
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
  const screenshotPath = testInfo.outputPath("vue-css-zero-config.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Vue CSS zero-config" });
});
