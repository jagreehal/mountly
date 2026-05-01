import { test, expect } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});


test("registerBuiltInPlugins includes url-change and media", async ({ page }, testInfo) => {
  story.given("the empty fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");
  story.when("plugins are registered");
  const hasPlugin = await page.evaluate(async () => {
    const {
      registerBuiltInPlugins,
      getTriggerPlugin,
    } = await import("/packages/mountly/dist/index.js");
    registerBuiltInPlugins();
    return {
      urlChange: Boolean(getTriggerPlugin("url-change")),
      media: Boolean(getTriggerPlugin("media")),
    };
  });

  story.then("url-change plugin exists");
  expect(hasPlugin.urlChange).toBe(true);
  story.then("media plugin exists");
  expect(hasPlugin.media).toBe(true);
  const screenshotPath = testInfo.outputPath("built-in-plugins.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Built-in plugins" });
});

test("url-change plugin listens to popstate/hashchange by default", async ({ page }, testInfo) => {
  story.given("the empty fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");
  story.when("popstate and hashchange events are dispatched");
  const events = await page.evaluate(async () => {
    const {
      registerBuiltInPlugins,
      createPluginTrigger,
    } = await import("/packages/mountly/dist/index.js");
    registerBuiltInPlugins();

    const trigger = document.createElement("button");
    document.body.appendChild(trigger);

    const seen: string[] = [];
    const cleanup = createPluginTrigger("url-change", trigger, (ctx: { event?: Event }) => {
      seen.push(ctx.event?.type ?? "unknown");
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
  const screenshotPath = testInfo.outputPath("url-change-plugin.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "URL change plugin" });
});

test("url-change plugin can subscribe to pushState/replaceState", async ({ page }, testInfo) => {
  story.given("the empty fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");
  story.when("history.pushState and replaceState are called");
  const result = await page.evaluate(async () => {
    const {
      registerBuiltInPlugins,
      createPluginTrigger,
    } = await import("/packages/mountly/dist/index.js");
    registerBuiltInPlugins();

    const trigger = document.createElement("button");
    document.body.appendChild(trigger);

    const seen: string[] = [];
    const cleanup = createPluginTrigger(
      "url-change",
      trigger,
      (ctx: { event?: Event }) => {
        seen.push(ctx.event?.type ?? "unknown");
      },
      { events: ["pushstate", "replacestate"] },
    );

    history.pushState({ n: 1 }, "", "?n=1");
    history.replaceState({ n: 2 }, "", "?n=2");
    cleanup();
    history.pushState({ n: 3 }, "", "?n=3");

    return seen;
  });

  story.then("pushstate and replacestate events are seen");
  expect(result).toEqual(["pushstate", "replacestate"]);
  const screenshotPath = testInfo.outputPath("pushstate-plugin.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "PushState plugin" });
});

test("media plugin triggers immediately when query already matches", async ({ page }, testInfo) => {
  story.given("the empty fixture is loaded");
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");
  story.when("the media query matches");
  const result = await page.evaluate(async () => {
    const {
      registerBuiltInPlugins,
      createPluginTrigger,
    } = await import("/packages/mountly/dist/index.js");
    registerBuiltInPlugins();

    const trigger = document.createElement("button");
    document.body.appendChild(trigger);

    const seen: string[] = [];
    const cleanup = createPluginTrigger(
      "media",
      trigger,
      (ctx: { triggerType: string }) => {
        seen.push(ctx.triggerType);
      },
      { query: "(min-width: 1px)" },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    cleanup();
    return seen;
  });

  story.then("the media trigger fires immediately");
  expect(result).toEqual(["media"]);
  const screenshotPath = testInfo.outputPath("media-plugin.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  story.screenshot({ path: screenshotPath, alt: "Media plugin" });
});
