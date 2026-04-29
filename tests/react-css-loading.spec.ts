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

test("React adapter applies styles passed as a literal `styles` option (shadow DOM)", async ({ page }) => {
  await page.goto(`${HOST}/tests/fixtures/react-css-styles-option.html`);
  const result = await readResult(page);
  expect(result.hasShadowRoot).toBe(true);
  expect(result.text).toBe("literal");
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
});

test("React adapter fetches CSS via `cssUrl` option and adopts it into the shadow root", async ({ page }) => {
  await page.goto(`${HOST}/tests/fixtures/react-css-cssurl-option.html`);
  const result = await readResult(page);
  expect(result.adoptedRuleCount).toBeGreaterThan(0);
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
});

test("React adapter derives CSS from `moduleUrl` passed via mount() props", async ({ page }) => {
  await page.goto(`${HOST}/tests/fixtures/react-css-moduleurl-prop.html`);
  const result = await readResult(page);
  expect(result.adoptedRuleCount).toBeGreaterThan(0);
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
});

test("React adapter sends `Accept: text/css` so dev servers return raw CSS, not JS-wrapped modules", async ({ page }) => {
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
  await page.goto(`${HOST}/tests/fixtures/react-css-vite-like-server.html`);
  const result = await readResult(page);
  expect(result.adoptedRuleCount).toBeGreaterThan(0);
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
});

test("React adapter scopes CSS-Modules class names through the shadow root (decoy global rule does NOT leak in)", async ({ page }) => {
  // Demonstrates that React, which has no native style scoping, gets it
  // for free from mountly's shadow root: the build's hashed class names
  // come out of a CSS-Modules pipeline, the .css is fetched alongside the
  // .js (auto via moduleUrl), and a colliding global selector at document
  // level cannot reach into the shadow root.
  await page.goto(`${HOST}/tests/fixtures/react-css-modules.html`);
  const result = await readResult(page);
  expect(result.hashedButtonClass).toMatch(/^button_/);
  expect(result.buttonHasHashedClass).toBe(true);
  // The component also has the global "button" class, but the global rule
  // (color: red !important) does not pierce the shadow root.
  expect(result.buttonHasGlobalDecoyClass).toBe(true);
  expect(result.buttonComputedColor).toBe("rgb(7, 7, 7)");
  expect(result.labelComputedFontWeight).toBe("700");
  expect(result.adoptedRuleCount).toBe(2);
});

test("React adapter applies styles via head fallback in light DOM (shadow:false, default styleMode)", async ({ page }) => {
  await page.goto(`${HOST}/tests/fixtures/react-css-cssurl-light-dom.html`);
  const result = await readResult(page);
  expect(result.hasShadowRoot).toBe(false);
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
  expect(result.hasHeadFallback).toBe(true);
  expect(result.headFallbackHasCss).toBe(true);
});

test("React adapter mount succeeds even when the CSS URL 404s", async ({ page }) => {
  await page.goto(`${HOST}/tests/fixtures/react-css-missing-url.html`);
  const result = await readResult(page);
  expect(result.mountError).toBeNull();
  expect(result.hasShadowRoot).toBe(true);
  expect(result.text).toBe("missing");
});

test("React zero-config: createOnDemandFeature({ moduleUrl }) auto-wires CSS into shadow DOM", async ({ page }) => {
  await page.goto(`${HOST}/tests/fixtures/react-css-zero-config.html`);
  await page.waitForFunction(() => (window as any).__ready && (window as any).__ready(), null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.hasShadowRoot).toBe(true);
  expect(result.adoptedRuleCount).toBeGreaterThan(0);
  expect(result.computedColor).toBe("rgb(11, 22, 33)");
});
