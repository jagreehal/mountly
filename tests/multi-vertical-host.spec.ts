import { expect, test } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.describe("Multi-vertical host", () => {
  test("manifest-driven host loads vertical slots and platform bus", async ({ page }, testInfo) => {
    story.init(testInfo, { tags: ["mfe", "manifest"], ticket: "MOUNTLY-MFE-1" });
    story.given("the multi-vertical host example is open");
    await page.goto("http://localhost:5182/docs/examples/multi-vertical-host/");
    await page.waitForLoadState("networkidle");

    story.when("the payments team emits a platform bus event");
    await page.getByRole("button", { name: "Payments emits payment:selected" }).click();

    story.then("the media team listener logs the event");
    await expect(page.locator("#bus-log")).toContainText("[media team heard] payment:selected");

    story.when("the media team emits cart:updated");
    await page.getByRole("button", { name: "Media emits cart:updated" }).click();

    story.then("the payments team listener logs the event");
    await expect(page.locator("#bus-log")).toContainText("[payments team heard] cart:updated");
  });
});
