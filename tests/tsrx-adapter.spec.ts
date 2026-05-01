import { test, expect } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});

test("TSRX adapter supports render and lifecycle component shapes", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/tsrx-adapter.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });

  const result = await page.evaluate(() => (window as any).__result);

  expect(result.renderText).toContain("render-b");
  expect(result.renderColor).toBe("rgb(12, 34, 56)");
  expect(result.lifecycleText).toContain("life-b");
  expect(result.renderUpdates).toBe(1);
  // No lifecycle update() provided, so adapter should remount.
  expect(result.lifecycleMounts).toBe(2);
  expect(result.lifecycleUnmounts).toBe(1);
});

test("createWidget mount renders into the shadow root", async ({ page }, testInfo) => {
  story.given("the TSRX mount fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/tsrx-mount.html");
  await page.waitForLoadState("networkidle");
  story.when("the component finishes mounting");
  await page.waitForFunction(() => {
    const el = document.getElementById("c");
    const node = el?.shadowRoot?.querySelector("[data-mountly-root]");
    return node && node.textContent === "hello world";
  }, null, { timeout: 8000 });
  story.then("the component renders into the shadow root");
  const text = await page.evaluate(() => {
    const el = document.getElementById("c");
    return el?.shadowRoot?.querySelector("[data-mountly-root]")?.textContent;
  });
  expect(text).toBe("hello world");
  const screenshotPath = testInfo.outputPath("tsrx-mount.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "TSRX mount" });
});

test("createWidget remount is idempotent (single shadow root, single style, fresh tree)", async ({ page }, testInfo) => {
  story.given("the TSRX remount fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/tsrx-remount.html");
  await page.waitForLoadState("networkidle");
  story.when("the widget remounts");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  story.then("there is only one shadow root");
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.mountNodes).toBe(1);
  story.then("the style tag survives");
  expect(result.stylePresent).toBe(true);
  story.then("the new content renders");
  expect(result.text).toBe("second");
  const screenshotPath = testInfo.outputPath("tsrx-remount.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "TSRX remount" });
});

test("style tag survives TSRX remount", async ({ page }, testInfo) => {
  story.given("the TSRX style-survives fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/tsrx-style-survives.html");
  await page.waitForLoadState("networkidle");
  story.when("the widget remounts");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  story.then("the style tag is still present");
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.styleStillPresent).toBe(true);
  const screenshotPath = testInfo.outputPath("tsrx-style-survives.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "TSRX style survives" });
});

test("TSRX widget unmount calls destroy and remount rebuilds", async ({ page }, testInfo) => {
  story.given("the TSRX unmount fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/tsrx-unmount.html");
  await page.waitForLoadState("networkidle");
  story.when("the widget is mounted");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  story.then("the component is alive");
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.before).toBe("alive");
  story.then("the component is removed");
  expect(result.textAfter).toBe("");
  story.then("the component is remounted");
  expect(result.textAfterRemount).toBe("reborn");
  story.then("destroy was called");
  expect(result.unmountCalls).toBe(1);
  const screenshotPath = testInfo.outputPath("tsrx-unmount.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "TSRX unmount" });
});

test("TSRX widget supports independent multi-instance mounts", async ({ page }, testInfo) => {
  story.given("the TSRX multi-instance fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/tsrx-multi-instance.html");
  await page.waitForLoadState("networkidle");
  story.when("the components finish mounting");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  story.then("both have shadow roots");
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.aHasShadow).toBe(true);
  expect(result.bHasShadow).toBe(true);
  story.then("first instance is empty");
  expect(result.aTextAfter).toBe("");
  story.then("second instance has content");
  expect(result.bText).toBe("beta");
  const screenshotPath = testInfo.outputPath("tsrx-multi-instance.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "TSRX multi-instance" });
});

test("TSRX widget supports shadow: false and still applies styles", async ({ page }, testInfo) => {
  story.given("the TSRX no-shadow fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/tsrx-no-shadow.html");
  await page.waitForLoadState("networkidle");
  story.when("the component finishes mounting");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  story.then("there is no shadow root");
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.hasShadowRoot).toBe(false);
  story.then("the plain text renders");
  expect(result.text).toBe("plain");
  story.then("the styles are applied");
  expect(result.computedColor).toBe("rgb(1, 2, 3)");
  const screenshotPath = testInfo.outputPath("tsrx-no-shadow.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "TSRX no shadow" });
});

test("TSRX widget exposes update() and applies new props", async ({ page }, testInfo) => {
  story.given("the TSRX update fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/tsrx-update.html");
  await page.waitForLoadState("networkidle");
  story.when("the component finishes mounting");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  story.then("the initial text contains b");
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.text).toContain("b");
  story.then("update was called");
  expect(result.updateCount).toBe(1);
  const screenshotPath = testInfo.outputPath("tsrx-update.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "TSRX update" });
});
