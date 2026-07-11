import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { story } from "executable-stories-playwright";

const REPO_ROOT = join(__dirname, "..");
const HOSTED_QUICKSTART =
  "https://jagreehal.github.io/mountly/examples/quickstart/host.html";

test("README Quick Start story: documented URL mounts a widget", async ({ page }, testInfo) => {
  story.init(testInfo, { tags: ["docs", "quickstart"], ticket: "MOUNTLY-DOCS-1" });
  story.given("README Quick Start contains a host URL and source link");
  const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf8");
  const quickStartIdx = readme.indexOf("## Quick Start");
  expect(quickStartIdx, "README.md must contain a '## Quick Start' section").toBeGreaterThan(-1);
  const quickStart = readme.slice(quickStartIdx);

  expect(
    quickStart.includes(HOSTED_QUICKSTART),
    `Quick Start must link to hosted demo at ${HOSTED_QUICKSTART}`,
  ).toBe(true);

  const localMatch = quickStart.match(
    /<(http:\/\/localhost:\d+\/docs\/examples\/quickstart\/host\.html)>/,
  );
  expect(
    localMatch,
    "Quick Start must reference a localhost URL for docs/examples/quickstart/host.html",
  ).not.toBeNull();
  const hostUrl = localMatch![1];

  const srcMatch = quickStart.match(/\[source\]\(([^)]+)\)/);
  expect(srcMatch, "Quick Start must link the [source]() of the host file").not.toBeNull();
  const srcRel = srcMatch![1];
  expect(
    existsSync(join(REPO_ROOT, srcRel)),
    `[source](${srcRel}) referenced in README must exist on disk`,
  ).toBe(true);
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

test("docs quick-start page links to hosted examples", async ({ page }) => {
  const quickStartMdx = readFileSync(
    join(REPO_ROOT, "docs/src/content/docs/getting-started/quick-start.mdx"),
    "utf8",
  );
  expect(quickStartMdx).toContain("exampleUrl");
  expect(quickStartMdx).toContain("quickstart/host.html");
  expect(quickStartMdx).not.toMatch(/localhost:51\.\./);
});
