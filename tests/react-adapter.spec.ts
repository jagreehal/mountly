import { test, expect } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});


test("createWidget mount renders the React component into the shadow root", async ({ page }, testInfo) => {
  story.given("the React mount fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/react-mount.html");
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
  const screenshotPath = testInfo.outputPath("react-mount.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "React mount" });
});

test("createWidget remount is idempotent (single shadow root, single style, fresh tree)", async ({ page }, testInfo) => {
  story.given("the React remount fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/react-remount.html");
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
  const screenshotPath = testInfo.outputPath("react-remount.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "React remount" });
});

test("style tag survives React reconciliation", async ({ page }, testInfo) => {
  story.given("the React style-survives fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/react-style-survives.html");
  await page.waitForLoadState("networkidle");
  story.when("the widget remounts");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  story.then("the style tag survives");
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.styleStillPresent).toBe(true);
  const screenshotPath = testInfo.outputPath("react-style-survives.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "React style survives" });
});

test("React widget exposes update() and applies new props", async ({ page }, testInfo) => {
  story.given("the React update fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/react-update.html");
  await page.waitForLoadState("networkidle");
  story.when("the component finishes mounting");
  await page.waitForFunction(() => {
    const el = document.getElementById("c");
    return (el?.shadowRoot?.textContent ?? "").includes("b");
  }, null, { timeout: 8000 });
  story.then("the text contains b");
  const text = await page.evaluate(() => {
    const el = document.getElementById("c");
    return el?.shadowRoot?.textContent ?? "";
  });
  expect(text).toContain("b");
  const screenshotPath = testInfo.outputPath("react-update.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "React update" });
});
