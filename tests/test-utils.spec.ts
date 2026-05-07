import { test, expect } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});

test("mountly test helpers mount and unmount widgets", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

  const result = await page.evaluate(async () => {
    const { mountWidgetFixture } = await import(
      "/packages/mountly/dist/test-utils.js"
    );
    const widget = {
      mount(container: HTMLElement, props: { label?: string }) {
        container.textContent = props.label ?? "mounted";
      },
      unmount(container: HTMLElement) {
        container.textContent = "";
      },
    };

    const fixture = await mountWidgetFixture(widget, { label: "ready" });
    const mountedText = fixture.container.textContent;
    await fixture.unmount();

    const { eachClick } = await import("/packages/mountly/dist/triggers.js");

    const button = document.createElement("button");
    document.body.appendChild(button);
    let triggered = 0;
    const stop = eachClick(button, () => {
      triggered += 1;
      stop();
    });
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    return {
      mountedText,
      afterUnmount: fixture.container.textContent,
      triggered,
    };
  });

  expect(result.mountedText).toBe("ready");
  expect(result.afterUnmount).toBe("");
  expect(result.triggered).toBe(1);
});
