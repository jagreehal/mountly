import { expect, test } from "@playwright/test";
import { given, story, then, when } from "executable-stories-playwright";

test.describe("Mount utils story", () => {
  test("safeUnmount clears mounted output and removes container", async ({ page }, testInfo) => {
    story.init(testInfo, { tags: ["mount-utils"], ticket: "MOUNTLY-TEST-1" });
    story.note("Executable story variant of a mount utils behavior check.");

    given("an empty fixture page and a mount container with attached unmount callback");
    await page.goto("http://localhost:5175/tests/fixtures/empty.html");

    await page.evaluate(async () => {
      const { safeUnmount } = await import("/packages/mountly/dist/index.js");
      const host = document.createElement("div");
      const container = document.createElement("div");
      container.id = "story-container";
      container.textContent = "mounted";
      let calls = 0;
      (container as HTMLElement & { _unmount?: () => void })._unmount = () => {
        calls += 1;
      };
      host.appendChild(container);
      document.body.appendChild(host);

      safeUnmount(container);
      (window as Window & { __storyState?: { calls: number; exists: boolean; html: string } }).__storyState = {
        calls,
        exists: document.getElementById("story-container") !== null,
        html: container.innerHTML,
      };
    });

    when("safeUnmount is invoked");
    const result = await page.evaluate(() => {
      return (window as Window & { __storyState?: { calls: number; exists: boolean; html: string } }).__storyState;
    });
    story.json({ label: "safeUnmount result", value: result });

    then("the unmount callback is called once and the container is removed");
    expect(result).toBeDefined();
    expect(result?.calls).toBe(1);
    expect(result?.exists).toBe(false);
    expect(result?.html).toBe("");
  });
});
