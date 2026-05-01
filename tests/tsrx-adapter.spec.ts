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
