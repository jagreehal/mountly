import { test, expect } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});


test("createWidget mount renders the Vue component into the shadow root", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/vue-mount.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => {
    const el = document.getElementById("c");
    const node = el?.shadowRoot?.querySelector("[data-mountly-root]");
    return node && node.textContent === "hello world";
  }, null, { timeout: 8000 });
  const text = await page.evaluate(() => {
    const el = document.getElementById("c");
    return el?.shadowRoot?.querySelector("[data-mountly-root]")?.textContent;
  });
  expect(text).toBe("hello world");
  const color = await page.evaluate(() => {
    const el = document.getElementById("c");
    const node = el?.shadowRoot?.querySelector(".vue-mounted");
    return node ? getComputedStyle(node).color : "";
  });
  expect(color).toBe("rgb(44, 55, 66)");
});

test("createWidget remount is idempotent (single shadow root, single style, fresh tree)", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/vue-remount.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.mountNodes).toBe(1);
  expect(result.stylePresent).toBe(true);
  expect(result.text).toBe("second");
});

test("style tag survives Vue remount", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/vue-style-survives.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.styleStillPresent).toBe(true);
});

test("Vue widget unmount tears down and remount rebuilds", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/vue-unmount.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.before).toBe("alive");
  expect(result.textAfter).toBe("");
  expect(result.textAfterRemount).toBe("reborn");
});

test("Vue widget supports independent multi-instance mounts", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/vue-multi-instance.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.aHasShadow).toBe(true);
  expect(result.bHasShadow).toBe(true);
  expect(result.aTextAfter).toBe("");
  expect(result.bText).toBe("beta");
});

test("Vue widget falls back to light DOM for shadow-rejecting elements", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", (msg) => msg.type() === "warning" && warnings.push(msg.text()));
  await page.goto("http://localhost:5175/tests/fixtures/vue-light-dom.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.hasShadowOnImg).toBe(false);
  expect(result.mountIsSibling).toBe(true);
  expect(result.mountText).toBe("fallback");
  expect(result.hasFallbackStyle).toBe(true);
  expect(warnings.some((w) => w.includes("light DOM"))).toBe(true);
});

test("Vue widget works with closed shadow mode and remounts cleanly", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/vue-closed-mode.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.error).toBeNull();
  expect(result.containerShadowRootIsNull).toBe(true);
  expect(result.canRemount).toBe(true);
});

test("Vue widget supports shadow: false and still applies styles", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/vue-no-shadow.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.hasShadowRoot).toBe(false);
  expect(result.text).toBe("plain");
  expect(result.computedColor).toBe("rgb(4, 5, 6)");
});

test("Vue widget exposes update() and applies new props", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/vue-update.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.text).toContain("b");
});
