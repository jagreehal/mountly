import { expect, test } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.describe("strict CSP", () => {
  test("loads a widget on a page that forbids 'unsafe-eval'", async ({ page }, testInfo) => {
    story.init(testInfo);
    story.given("a host whose CSP omits 'unsafe-eval' — the posture regulated environments ship");

    await page.goto("http://localhost:5175/tests/fixtures/csp-strict.html");
    await page.waitForSelector("body[data-done='1']");

    const result = await page.evaluate(
      () => (window as unknown as { __csp: Record<string, string | null> }).__csp,
    );

    story.when("a feature loads its module by a runtime specifier");
    story.then("eval really is blocked, so the result below is not a false pass");
    expect(result.eval).toBe("blocked");

    story.then("the module still loads and mounts");
    expect(result.error).toBeNull();
    expect(result.load).toBe("ok");
    expect(result.text).toBe("loaded under CSP");
  });
});
