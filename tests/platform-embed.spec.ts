import { expect, test } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.describe("Platform embed", () => {
  test("Product A widget loads in foreign platform shell", async ({ page }, testInfo) => {
    story.init(testInfo, { tags: ["platform-embed", "stage-2"], ticket: "MOUNTLY-EMBED-1" });
    story.given("the platform shell example is open");
    await page.goto("http://localhost:5184/docs/examples/platform-embed/platform-host/");
    await page.waitForLoadState("networkidle");

    story.when("the user opens Product A settings");
    await page.getByRole("button", { name: "Show Product A settings" }).click();

    story.then("Product A API data renders in the widget");
    await expect(page.getByRole("heading", { name: "Tenant settings" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("tenant_acme")).toBeVisible();
    await expect(page.getByText("Business")).toBeVisible();
    await expect(page.getByText("api.product-a.example")).toBeVisible();
  });
});
