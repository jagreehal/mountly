import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { story } from "executable-stories-playwright";

const REPO_ROOT = join(__dirname, "..");

test("README Quick Start story: documented URL mounts a widget", async ({ page }, testInfo) => {
  story.init(testInfo, { tags: ["docs", "quickstart"], ticket: "MOUNTLY-DOCS-1" });
  story.given("README Quick Start contains a host URL and source link");
  const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf8");
  const quickStartIdx = readme.indexOf("## Quick Start");
  expect(quickStartIdx, "README.md must contain a '## Quick Start' section").toBeGreaterThan(-1);
  const quickStart = readme.slice(quickStartIdx);

  const urlMatch = quickStart.match(/<(http:\/\/localhost:\d+\/examples\/quickstart\/host\.html)>/);
  expect(
    urlMatch,
    "Quick Start must reference an http://localhost URL for examples/quickstart/host.html",
  ).not.toBeNull();
  const hostUrl = urlMatch![1];

  const srcMatch = quickStart.match(/\[source\]\(([^)]+)\)/);
  expect(srcMatch, "Quick Start must link the [source]() of the host file").not.toBeNull();
  const srcRel = srcMatch![1];
  expect(existsSync(join(REPO_ROOT, srcRel)), `[source](${srcRel}) referenced in README must exist on disk`).toBe(
    true,
  );
  story.kv({ label: "Quick Start URL", value: hostUrl });

  story.when("the documented host URL is opened and View payment is clicked");
  await page.goto(hostUrl);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "View payment" }).click();

  story.then("the payment dialog mounts with expected text");
  await page.waitForFunction(() => {
    const mount = document.getElementById("mount");
    const dialog = mount?.shadowRoot?.querySelector("[role='dialog']");
    return !!dialog && dialog.textContent?.includes("Total due");
  });
});
