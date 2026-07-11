import { test, expect } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});

test("eachUrlChange listens to popstate/hashchange by default", async ({ page }, testInfo) => {
  story.given("the empty fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");
  story.when("popstate and hashchange events are dispatched");
  const events = await page.evaluate(async () => {
    const { eachUrlChange } = await import("/packages/mountly/dist/triggers.js");

    const seen: string[] = [];
    const cleanup = eachUrlChange((ev: { event?: Event }) => {
      seen.push(ev.event?.type ?? "history");
    });

    window.dispatchEvent(new PopStateEvent("popstate"));
    window.dispatchEvent(
      new HashChangeEvent("hashchange", {
        oldURL: location.href,
        newURL: `${location.origin}${location.pathname}#next`,
      }),
    );

    cleanup();
    window.dispatchEvent(new PopStateEvent("popstate"));

    return seen;
  });

  story.then("both events are seen");
  expect(events).toEqual(["popstate", "hashchange"]);
  const screenshotPath = testInfo.outputPath("url-change.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "eachUrlChange" });
});

test("eachUrlChange can subscribe to pushState/replaceState only", async ({ page }, testInfo) => {
  story.given("the empty fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");
  story.when("history.pushState and replaceState are called");
  const result = await page.evaluate(async () => {
    const { eachUrlChange } = await import("/packages/mountly/dist/triggers.js");

    const seen: string[] = [];
    const cleanup = eachUrlChange(
      (ev: { type: string }) => {
        seen.push(ev.type);
      },
      { events: ["pushstate", "replacestate"] },
    );

    history.pushState({ n: 1 }, "", "?n=1");
    history.replaceState({ n: 2 }, "", "?n=2");
    cleanup();
    history.pushState({ n: 3 }, "", "?n=3");

    return seen;
  });

  story.then("two history events are seen");
  expect(result).toEqual(["url-change", "url-change"]);
  const screenshotPath = testInfo.outputPath("pushstate.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "history triggers" });
});

test("eachMedia fires immediately when query already matches", async ({ page }, testInfo) => {
  story.given("the empty fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");
  story.when("the media query matches");
  const result = await page.evaluate(async () => {
    const { eachMedia } = await import("/packages/mountly/dist/triggers.js");

    const seen: string[] = [];
    const cleanup = eachMedia("(min-width: 1px)", (ev: { type: string }) => {
      seen.push(ev.type);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    cleanup();
    return seen;
  });

  story.then("the media trigger fires immediately");
  expect(result).toEqual(["media"]);
  const screenshotPath = testInfo.outputPath("media.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "eachMedia" });
});
