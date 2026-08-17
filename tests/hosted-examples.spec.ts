import { expect, test } from "@playwright/test";
import { story } from "executable-stories-playwright";

/**
 * Guards the examples as they are actually deployed: built, and served under
 * the `/mountly` base path.
 *
 * Every other spec drives a dev server at the origin root, where BASE_URL is
 * "/" — so base-path bugs are invisible to them. Four of them shipped at once:
 * links built as `/mountlyexamples/...`, an import map emitted without the base,
 * a remote URL left pointing at a throwaway build server, and a docs deploy that
 * built no packages at all.
 */
const SITE = "http://127.0.0.1:5196";
const INDEX = `${SITE}/mountly/examples/`;

test.describe("hosted examples", () => {
  test("every example link on the index is base-prefixed and loads", async ({ page }, testInfo) => {
    story.init(testInfo);

    story.given("the built docs served under the /mountly base, as on Pages");
    await page.goto(INDEX, { waitUntil: "domcontentloaded" });

    story.when("the live examples index is read for its example links");
    const links: string[] = await page.$$eval("a[href*='/examples/']", (anchors) =>
      anchors
        .map((a) => a.getAttribute("href") ?? "")
        .filter((href) => href.startsWith("/") && href !== "/mountly/examples/"),
    );
    expect(links.length, "expected the index to list examples").toBeGreaterThan(5);

    story.then("no link escapes the base path");
    // `BASE_URL + "examples/"` produced /mountlyexamples/ — every link 404'd.
    const unprefixed = links.filter((href) => !href.startsWith("/mountly/examples/"));
    expect(unprefixed, "links must keep the /mountly base").toEqual([]);

    story.then("each one loads with no console errors or failed requests");
    const broken: string[] = [];
    for (const href of [...new Set(links)]) {
      const problems: string[] = [];
      const onConsole = (m: { type: () => string; text: () => string }) => {
        if (m.type() === "error") problems.push(m.text().slice(0, 120));
      };
      const onPageError = (e: Error) => problems.push(`pageerror: ${e.message.slice(0, 120)}`);
      const onFailed = (r: { url: () => string }) => problems.push(`failed: ${r.url()}`);

      page.on("console", onConsole);
      page.on("pageerror", onPageError);
      page.on("requestfailed", onFailed);

      const response = await page.goto(`${SITE}${href}`, { waitUntil: "networkidle" });
      const body = (
        await page
          .locator("body")
          .innerText()
          .catch(() => "")
      ).trim();

      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      page.off("requestfailed", onFailed);

      if (response?.status() !== 200) problems.push(`status ${response?.status()}`);
      if (body.length === 0) problems.push("rendered nothing");
      if (problems.length > 0) broken.push(`${href} — ${problems.slice(0, 3).join("; ")}`);
    }

    expect(broken, "hosted examples must load cleanly").toEqual([]);
  });
});
