import { test, expect } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});


test("createWidget mount renders the Svelte component into the shadow root", async ({ page }) => {
  story.given("the Svelte mount fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/svelte-mount.html");
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
    const node = el?.shadowRoot?.querySelector(".svelte-mounted");
    return node ? getComputedStyle(node).color : "";
  });
  expect(color).toBe("rgb(11, 22, 33)");
});

test("createWidget remount is idempotent (single shadow root, single style, fresh tree)", async ({ page }) => {
  story.given("the Svelte remount fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/svelte-remount.html");
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
});

test("style tag survives Svelte remount", async ({ page }) => {
  story.given("the Svelte style-survives fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/svelte-style-survives.html");
  await page.waitForLoadState("networkidle");
  story.when("the widget remounts");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  story.then("the style tag is still present");
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.styleStillPresent).toBe(true);
});

test("Svelte widget unmount calls $destroy and remount rebuilds", async ({ page }) => {
  story.given("the Svelte unmount fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/svelte-unmount.html");
  await page.waitForLoadState("networkidle");
  story.when("the widget is mounted");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  story.then("the component is alive");
  let result = await page.evaluate(() => (window as any).__result);
  expect(result.before).toBe("alive");
  story.when("the widget is unmounted");
  // unmount happens automatically in the fixture
  story.then("the component is removed");
  result = await page.evaluate(() => (window as any).__result);
  expect(result.textAfter).toBe("");
  story.then("the component is remounted");
  expect(result.textAfterRemount).toBe("reborn");
  story.then("$destroy was called");
  expect(result.destroyCallsAfterUnmount).toBe(1);
});

test("Svelte widget supports independent multi-instance mounts", async ({ page }, testInfo) => {
  story.given("the Svelte multi-instance fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/svelte-multi-instance.html");
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
  const screenshotPath = testInfo.outputPath("multi-instance.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Multi-instance mount" });
});

test("Svelte widget falls back to light DOM for shadow-rejecting elements", async ({ page }, testInfo) => {
  story.given("console warnings are being captured");
  const warnings: string[] = [];
  page.on("console", (msg) => msg.type() === "warning" && warnings.push(msg.text()));
  story.and("the Svelte light-dom fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/svelte-light-dom.html");
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
  const screenshotPath = testInfo.outputPath("light-dom-fallback.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Light DOM fallback" });
});

test("Svelte widget works with closed shadow mode and remounts cleanly", async ({ page }, testInfo) => {
  story.given("the Svelte closed-mode fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/svelte-closed-mode.html");
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
  const screenshotPath = testInfo.outputPath("closed-mode.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Closed shadow mode" });
});

test("Svelte 5 functional components dispatch through host-supplied mount/unmount", async ({ page }, testInfo) => {
  story.given("the Svelte v5 functional fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/svelte-v5-functional.html");
  await page.waitForLoadState("networkidle");
  story.when("the component mounts");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  story.then("the first text is v5-alive");
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.text1).toBe("v5-alive");
  story.then("the second text is empty");
  expect(result.text2).toBe("");
  story.then("after remount it shows v5-reborn");
  expect(result.text3).toBe("v5-reborn");
  story.then("mount was called twice");
  expect(result.mountCalls).toBe(2);
  story.then("unmount was called once");
  expect(result.unmountCalls).toBe(1);
  const screenshotPath = testInfo.outputPath("v5-functional.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Svelte 5 functional component" });
});

test("Svelte 5 auto-runtime import errors clearly when `svelte` is not resolvable", async ({ page }, testInfo) => {
  story.given("the Svelte v5 missing-mount fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/svelte-v5-missing-mount.html");
  await page.waitForLoadState("networkidle");
  story.when("the import fails");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  story.then("the error mentions svelte");
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.caught).toContain("Could not import `svelte` runtime");
  story.then("the error mentions import map");
  expect(result.caught).toContain("import map");
  const screenshotPath = testInfo.outputPath("v5-missing-mount-error.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Svelte 5 missing runtime error" });
});

test("Svelte widget supports shadow: false and still applies styles", async ({ page }, testInfo) => {
  story.given("the Svelte no-shadow fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/svelte-no-shadow.html");
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
  const screenshotPath = testInfo.outputPath("no-shadow.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "No shadow mode" });
});

test("Svelte widget exposes update() and applies new props", async ({ page }, testInfo) => {
  story.given("the Svelte update fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/svelte-update.html");
  await page.waitForLoadState("networkidle");
  story.when("the component finishes mounting");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  story.then("the initial text contains b");
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.text).toContain("b");
  const screenshotPath = testInfo.outputPath("update.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Update props" });
});
