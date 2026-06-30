import { expect, test } from "@playwright/test";
import { story } from "executable-stories-playwright";

/**
 * Real-browser proof of the generative-UI loop: an agent-shaped UI that
 * **builds itself** (json-render's stream compiler replays the spec live) and
 * then **navigates itself** (a generated button drives the next view via
 * `mountly-mcp/json-render`'s action bridge).
 *
 * The native vitest test asserts a spec renders to DOM; this is the only thing
 * that catches a regression in the streaming + self-navigation experience the
 * README sells. Served by the `preview:stream:serve` webServer on :5181.
 */
const PREVIEW = "http://localhost:5181/";

test.describe("mcp-generative-demo streaming preview", () => {
  test("the dashboard streams itself in", async ({ page }, testInfo) => {
    story.init(testInfo, {
      tags: ["generative", "json-render", "streaming"],
      ticket: "MOUNTLY-GEN-1",
    });

    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    story.given("the streaming preview is opened");
    await page.goto(PREVIEW);

    story.when("json-render's compiler replays the spec patch-by-patch");
    await expect(page.getByRole("heading", { name: "Revenue overview" })).toBeVisible({
      timeout: 10_000,
    });

    story.then("the generated KPIs and the agent-wired button finish streaming");
    await expect(page.getByText("MRR", { exact: false })).toBeVisible();
    await expect(page.getByText("$48.2k")).toBeVisible();
    await expect(page.getByRole("button", { name: /Break down Q3 by region/i })).toBeVisible({
      timeout: 10_000,
    });
    story.screenshot({
      path: testInfo.outputPath("overview.png"),
      alt: "The revenue overview dashboard after streaming in",
    });

    story.but("the generated UI produced no JS errors");
    expect(pageErrors).toEqual([]);
  });

  test("a generated button drives the agent to the next view, and back", async ({
    page,
  }, testInfo) => {
    story.init(testInfo, {
      tags: ["generative", "json-render", "self-navigation", "agent-loop"],
      ticket: "MOUNTLY-GEN-2",
    });

    story.given("the overview has streamed in");
    await page.goto(PREVIEW);
    const drillDown = page.getByRole("button", {
      name: /Break down Q3 by region/i,
    });
    await expect(drillDown).toBeVisible({ timeout: 10_000 });

    story.when("the user clicks the generated 'Break down Q3 by region' button");
    await drillDown.click();

    story.then("the action bridge drives the next view, which streams in over the last");
    await expect(page.getByRole("heading", { name: "Q3 revenue by region" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("North America")).toBeVisible();
    await expect(page.getByText("EMEA", { exact: true })).toBeVisible();
    await expect(page.getByText("APAC")).toBeVisible();
    story.screenshot({
      path: testInfo.outputPath("q3-by-region.png"),
      alt: "The Q3-by-region view the agent generated in response to the click",
    });

    story.and("a generated 'Overview' button closes the loop back to the start");
    await page.getByRole("button", { name: /Overview/i }).click();
    await expect(page.getByRole("heading", { name: "Revenue overview" })).toBeVisible({
      timeout: 10_000,
    });
  });
});
