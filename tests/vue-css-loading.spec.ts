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

test("Vue adapter applies styles passed as a literal `styles` option (shadow DOM)", async ({ page }) => {
  await page.goto(`${HOST}/tests/fixtures/vue-css-styles-option.html`);
  const result = await readResult(page);
  expect(result.hasShadowRoot).toBe(true);
  expect(result.text).toBe("literal");
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
});

test("Vue adapter fetches CSS via `cssUrl` option and adopts it into the shadow root", async ({ page }) => {
  await page.goto(`${HOST}/tests/fixtures/vue-css-cssurl-option.html`);
  const result = await readResult(page);
  expect(result.hasShadowRoot).toBe(true);
  expect(result.adoptedRuleCount).toBeGreaterThan(0);
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
});

test("Vue adapter derives CSS URL from `moduleUrl` option (.js → .css)", async ({ page }) => {
  await page.goto(`${HOST}/tests/fixtures/vue-css-moduleurl-option.html`);
  const result = await readResult(page);
  expect(result.adoptedRuleCount).toBeGreaterThan(0);
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
});

test("Vue adapter accepts `cssUrl` passed via mount() props", async ({ page }) => {
  await page.goto(`${HOST}/tests/fixtures/vue-css-cssurl-prop.html`);
  const result = await readResult(page);
  expect(result.adoptedRuleCount).toBeGreaterThan(0);
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
});

test("Vue adapter derives CSS from `moduleUrl` passed via mount() props", async ({ page }) => {
  await page.goto(`${HOST}/tests/fixtures/vue-css-moduleurl-prop.html`);
  const result = await readResult(page);
  expect(result.adoptedRuleCount).toBeGreaterThan(0);
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
});

test("Vue adapter sends `Accept: text/css` so dev servers return raw CSS, not JS-wrapped modules", async ({ page }) => {
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
  await page.goto(`${HOST}/tests/fixtures/vue-css-vite-like-server.html`);
  const result = await readResult(page);
  expect(result.adoptedRuleCount).toBeGreaterThan(0);
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
});

test("Vue adapter applies styles via head fallback in light DOM (shadow:false, default styleMode)", async ({ page }) => {
  await page.goto(`${HOST}/tests/fixtures/vue-css-cssurl-light-dom.html`);
  const result = await readResult(page);
  expect(result.hasShadowRoot).toBe(false);
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
  expect(result.hasHeadFallback).toBe(true);
  expect(result.headFallbackHasCss).toBe(true);
});

test("Vue adapter applies styles via inline <style> in light DOM with styleMode='isolated'", async ({ page }) => {
  await page.goto(`${HOST}/tests/fixtures/vue-css-moduleurl-prop-light-dom.html`);
  const result = await readResult(page);
  expect(result.hasShadowRoot).toBe(false);
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
  expect(result.hasInlineStyleTag).toBe(true);
  expect(result.inlineStyleHasCss).toBe(true);
});

test("Vue adapter mount succeeds even when the CSS URL 404s", async ({ page }) => {
  await page.goto(`${HOST}/tests/fixtures/vue-css-missing-url.html`);
  const result = await readResult(page);
  expect(result.mountError).toBeNull();
  expect(result.hasShadowRoot).toBe(true);
  expect(result.text).toBe("missing");
});

test("Vue zero-config: createOnDemandFeature({ moduleUrl }) auto-wires CSS into shadow DOM", async ({ page }) => {
  await page.goto(`${HOST}/tests/fixtures/vue-css-zero-config.html`);
  await page.waitForFunction(() => (window as any).__ready && (window as any).__ready(), null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.hasShadowRoot).toBe(true);
  expect(result.adoptedRuleCount).toBeGreaterThan(0);
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
});
