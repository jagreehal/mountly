import { expect, test } from "@playwright/test";
import { given, story, then, when } from "executable-stories-playwright";

test.describe("Runtime story", () => {
  test("installRuntime injects an import map with all React keys", async ({ page }, testInfo) => {
    story.init(testInfo, { tags: ["runtime"], ticket: "MOUNTLY-RT-1" });
    given("the runtime fixture is loaded");
    await page.goto("http://localhost:5175/tests/fixtures/runtime-basic.html");
    await page.waitForLoadState("networkidle");

    when("the runtime import map is read from the document");
    const map = await page.evaluate(() => {
      const el = document.querySelector("script[type=importmap][data-mountly-runtime]");
      return el ? JSON.parse(el.textContent ?? "{}") : null;
    });
    story.json({ label: "runtime import map", value: map });

    then("all React import keys are present and mapped");
    expect(map?.imports).toEqual({
      react: "https://example.test/react.js",
      "react/jsx-runtime": "https://example.test/react-jsx-runtime.js",
      "react-dom": "https://example.test/react-dom.js",
      "react-dom/client": "https://example.test/react-dom-client.js",
    });
  });

  test("installRuntime is idempotent on identical URLs", async ({ page }, testInfo) => {
    story.init(testInfo, { tags: ["runtime"], ticket: "MOUNTLY-RT-2" });
    given("the idempotent runtime fixture is loaded");
    await page.goto("http://localhost:5175/tests/fixtures/runtime-idempotent.html");
    await page.waitForLoadState("networkidle");

    when("import-map script elements are counted");
    const count = await page.evaluate(() =>
      document.querySelectorAll("script[type=importmap][data-mountly-runtime]").length,
    );
    story.kv({ label: "import map script count", value: String(count) });

    then("only one runtime import map exists");
    expect(count).toBe(1);
  });

  test("installRuntime warns on mismatched second call", async ({ page }, testInfo) => {
    story.init(testInfo, { tags: ["runtime"], ticket: "MOUNTLY-RT-3" });
    given("a fixture that calls installRuntime twice with mismatched URLs");
    const warnings: string[] = [];
    page.on("console", (msg) => msg.type() === "warning" && warnings.push(msg.text()));
    await page.goto("http://localhost:5175/tests/fixtures/runtime-mismatch.html");
    await page.waitForLoadState("networkidle");

    when("warning logs are collected");
    story.json({ label: "runtime warnings", value: warnings });

    then("the warning includes the first-call-wins hint");
    expect(warnings.some((w) => w.includes("first call wins"))).toBe(true);
  });

  test("installRuntime derives react/jsx-runtime when not explicitly provided", async ({
    page,
  }, testInfo) => {
    story.init(testInfo, { tags: ["runtime"], ticket: "MOUNTLY-RT-4" });
    given("a fixture with only react URL provided");
    await page.goto("http://localhost:5175/tests/fixtures/runtime-derived-jsx-runtime.html");
    await page.waitForLoadState("networkidle");

    when("the import map is read from the runtime script");
    const map = await page.evaluate(() => {
      const el = document.querySelector("script[type=importmap][data-mountly-runtime]");
      return el ? JSON.parse(el.textContent ?? "{}") : null;
    });

    then("react/jsx-runtime is derived from react URL");
    expect(map?.imports?.["react/jsx-runtime"]).toBe("https://example.test/react.js/jsx-runtime?dev");
  });
});
