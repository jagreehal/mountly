import { test, expect } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});


test("createWidget mount renders the Vue component into the shadow root", async ({ page }, testInfo) => {
  story.given("the Vue mount fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/vue-mount.html");
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
  story.then("styles are applied");
  const color = await page.evaluate(() => {
    const el = document.getElementById("c");
    const node = el?.shadowRoot?.querySelector(".vue-mounted");
    return node ? getComputedStyle(node).color : "";
  });
  expect(color).toBe("rgb(44, 55, 66)");
  const screenshotPath = testInfo.outputPath("vue-mount.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Vue mount" });
});

test("createWidget remount is idempotent (single shadow root, single style, fresh tree)", async ({ page }, testInfo) => {
  story.given("the Vue remount fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/vue-remount.html");
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
  const screenshotPath = testInfo.outputPath("vue-remount.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Vue remount" });
});

test("style tag survives Vue remount", async ({ page }, testInfo) => {
  story.given("the Vue style-survives fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/vue-style-survives.html");
  await page.waitForLoadState("networkidle");
  story.when("the widget remounts");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  story.then("the style tag is still present");
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.styleStillPresent).toBe(true);
  const screenshotPath = testInfo.outputPath("vue-style-survives.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Vue style survives" });
});

test("Vue widget unmount tears down and remount rebuilds", async ({ page }, testInfo) => {
  story.given("the Vue unmount fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/vue-unmount.html");
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
  const screenshotPath = testInfo.outputPath("vue-unmount.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Vue unmount" });
});

test("Vue widget supports independent multi-instance mounts", async ({ page }, testInfo) => {
  story.given("the Vue multi-instance fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/vue-multi-instance.html");
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
  const screenshotPath = testInfo.outputPath("vue-multi-instance.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Vue multi-instance" });
});

test("Vue widget falls back to light DOM for shadow-rejecting elements", async ({ page }, testInfo) => {
  story.given("console warnings are being captured");
  const warnings: string[] = [];
  page.on("console", (msg) => msg.type() === "warning" && warnings.push(msg.text()));
  story.and("the Vue light-dom fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/vue-light-dom.html");
  await page.waitForLoadState("networkidle");
  story.when("the component finishes mounting");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  story.then("<img> does not have a shadow root");
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.hasShadowOnImg).toBe(false);
  story.then("the mount is a sibling");
  expect(result.mountIsSibling).toBe(true);
  story.then("it falls back to light DOM");
  expect(result.mountText).toBe("fallback");
  story.then("the fallback style is applied");
  expect(result.hasFallbackStyle).toBe(true);
  story.then("a warning was logged");
  expect(warnings.some((w) => w.includes("light DOM"))).toBe(true);
  const screenshotPath = testInfo.outputPath("vue-light-dom.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Vue light DOM fallback" });
});

test("Vue widget works with closed shadow mode and remounts cleanly", async ({ page }, testInfo) => {
  story.given("the Vue closed-mode fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/vue-closed-mode.html");
  await page.waitForLoadState("networkidle");
  story.when("the component finishes mounting");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  story.then("no error was thrown");
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.error).toBeNull();
  story.then("the container shadowRoot is null");
  expect(result.containerShadowRootIsNull).toBe(true);
  story.then("the widget can be remounted");
  expect(result.canRemount).toBe(true);
  const screenshotPath = testInfo.outputPath("vue-closed-mode.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Vue closed mode" });
});

test("Vue widget supports shadow: false and still applies styles", async ({ page }, testInfo) => {
  story.given("the Vue no-shadow fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/vue-no-shadow.html");
  await page.waitForLoadState("networkidle");
  story.when("the component finishes mounting");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  story.then("there is no shadow root");
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.hasShadowRoot).toBe(false);
  story.then("the plain text renders");
  expect(result.text).toBe("plain");
  story.then("the styles are applied");
  expect(result.computedColor).toBe("rgb(4, 5, 6)");
  const screenshotPath = testInfo.outputPath("vue-no-shadow.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Vue no shadow" });
});

test("Vue widget exposes update() and applies new props", async ({ page }, testInfo) => {
  story.given("the Vue update fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/vue-update.html");
  await page.waitForLoadState("networkidle");
  story.when("the component finishes mounting");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  story.then("the initial text contains b");
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.text).toContain("b");
  const screenshotPath = testInfo.outputPath("vue-update.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Vue update" });
});
