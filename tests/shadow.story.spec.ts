import { expect, test } from "@playwright/test";
import { given, story, then, when } from "executable-stories-playwright";

test.describe("Shadow behavior story", () => {
  test("attachShadow reuses the same mount node and style on remount (open)", async ({
    page,
  }, testInfo) => {
    story.init(testInfo, { tags: ["shadow"], ticket: "MOUNTLY-SH-1" });
    given("the open shadow remount fixture is loaded");
    await page.goto("http://localhost:5175/tests/fixtures/shadow-open-reuse.html");
    await page.waitForLoadState("networkidle");

    when("the fixture result is read from window");
    const result = await page.evaluate(() => (window as Window & { __result?: unknown }).__result);
    story.json({ label: "open shadow result", value: result });

    then("shadow root, style, and mount node are reused");
    const typed = result as {
      shadowRoots: number;
      stylePresent: boolean;
      mountNodes: number;
      sameMountReference: boolean;
    };
    expect(typed.shadowRoots).toBe(1);
    expect(typed.stylePresent).toBe(true);
    expect(typed.mountNodes).toBe(1);
    expect(typed.sameMountReference).toBe(true);
  });

  test("attachShadow falls back to light DOM for shadow-rejecting elements", async ({
    page,
  }, testInfo) => {
    story.init(testInfo, { tags: ["shadow"], ticket: "MOUNTLY-SH-2" });
    given("a shadow-rejecting fixture is loaded");
    const warnings: string[] = [];
    page.on("console", (msg) => msg.type() === "warning" && warnings.push(msg.text()));
    await page.goto("http://localhost:5175/tests/fixtures/shadow-fallback.html");
    await page.waitForLoadState("networkidle");

    when("fallback result and warnings are captured");
    const result = await page.evaluate(() => (window as Window & { __result?: unknown }).__result);
    story.json({ label: "shadow fallback result", value: result });
    story.json({ label: "shadow fallback warnings", value: warnings });

    then("mount proceeds in light DOM and warning is emitted once");
    const typed = result as { mountIsSibling: boolean; mountIsRendered: boolean; mountAttr: boolean };
    expect(typed.mountIsSibling).toBe(true);
    expect(typed.mountIsRendered).toBe(true);
    expect(typed.mountAttr).toBe(true);
    expect(warnings.filter((w) => w.includes("light DOM")).length).toBe(1);
  });

  test("injectGlobalStyles dedupes by exact CSS content across containers", async ({
    page,
  }, testInfo) => {
    story.init(testInfo, { tags: ["shadow"], ticket: "MOUNTLY-SH-3" });
    given("the style dedup fixture is loaded");
    await page.goto("http://localhost:5175/tests/fixtures/shadow-style-dedup.html");
    await page.waitForLoadState("networkidle");

    when("style dedup result is read");
    const result = await page.evaluate(() => (window as Window & { __result?: unknown }).__result);
    story.json({ label: "shadow style dedup result", value: result });

    then("the fallback style count matches distinct CSS payloads");
    const typed = result as { fallbackStyleCount: number };
    expect(typed.fallbackStyleCount).toBe(2);
  });
});
