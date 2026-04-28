import { test, expect } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});


test("createWidget mount renders the React component into the shadow root", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/react-mount.html");
  await page.waitForLoadState("networkidle");
  // Allow React to commit
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
});

test("createWidget remount is idempotent (single shadow root, single style, fresh tree)", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/react-remount.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.mountNodes).toBe(1);
  expect(result.stylePresent).toBe(true);
  expect(result.text).toBe("second");
});

test("style tag survives React reconciliation", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/react-style-survives.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.styleStillPresent).toBe(true);
});

test("React widget exposes update() and applies new props", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/react-update.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => {
    const el = document.getElementById("c");
    return (el?.shadowRoot?.textContent ?? "").includes("b");
  }, null, { timeout: 8000 });
  const text = await page.evaluate(() => {
    const el = document.getElementById("c");
    return el?.shadowRoot?.textContent ?? "";
  });
  expect(text).toContain("b");
});
