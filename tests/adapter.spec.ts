import { test, expect } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});


test("mountly exports the adapter contract types", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/adapter-contract.html");
  await page.waitForFunction(() => (window as any).__contractOk !== undefined, null, { timeout: 5000 });
  const ok = await page.evaluate(() => (window as any).__contractOk);
  expect(ok).toBe(true);
});
