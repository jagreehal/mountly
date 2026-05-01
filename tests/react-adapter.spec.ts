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

test("React widget unmount tears down and remount rebuilds", async ({ page }, testInfo) => {
  story.given("the React unmount fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/react-unmount.html");
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
  const screenshotPath = testInfo.outputPath("react-unmount.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "React unmount" });
});

test("React widget supports independent multi-instance mounts", async ({ page }, testInfo) => {
  story.given("the React multi-instance fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/react-multi-instance.html");
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
  const screenshotPath = testInfo.outputPath("react-multi-instance.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "React multi-instance" });
});

test("React widget falls back to light DOM for shadow-rejecting elements", async ({ page }, testInfo) => {
  story.given("console warnings are being captured");
  const warnings: string[] = [];
  page.on("console", (msg) => msg.type() === "warning" && warnings.push(msg.text()));
  story.and("the React light-dom fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/react-light-dom.html");
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
  const screenshotPath = testInfo.outputPath("react-light-dom.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "React light DOM fallback" });
});

test("React widget works with closed shadow mode and remounts cleanly", async ({ page }, testInfo) => {
  story.given("the React closed-mode fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/react-closed-mode.html");
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
  const screenshotPath = testInfo.outputPath("react-closed-mode.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "React closed mode" });
});

test("React widget supports shadow: false and still applies styles", async ({ page }, testInfo) => {
  story.given("the React no-shadow fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/react-no-shadow.html");
  await page.waitForLoadState("networkidle");
  story.when("the component finishes mounting");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  story.then("there is no shadow root");
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.hasShadowRoot).toBe(false);
  story.then("the plain text renders");
  expect(result.text).toBe("plain");
  story.then("the styles are applied");
  expect(result.computedColor).toBe("rgb(12, 34, 56)");
  const screenshotPath = testInfo.outputPath("react-no-shadow.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "React no shadow" });
});
