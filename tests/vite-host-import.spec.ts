import { test, expect } from "@playwright/test";

test.describe("vite-host-import", () => {
  test("loads whole widget and subpath via import map", async ({ page }) => {
    await page.goto("http://localhost:5190/");
    await expect(page.getByRole("heading", { name: /Vite host/ })).toBeVisible();
    await expect(page.getByTestId("feature-exports")).toContainText("demoWidget");
  });
});
