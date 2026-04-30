import { test, expect } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});


test("mountly exports the adapter contract types", async ({ page }, testInfo) => {
  story.given("the adapter-contract fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/adapter-contract.html");
  await page.waitForFunction(() => (window as any).__contractOk !== undefined, null, { timeout: 5000 });
  story.then("the contract is satisfied");
  const ok = await page.evaluate(() => (window as any).__contractOk);
  expect(ok).toBe(true);
  const screenshotPath = testInfo.outputPath("adapter-contract.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Adapter contract" });
});
