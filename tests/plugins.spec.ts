import { test, expect } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});


test("registerBuiltInPlugins includes url-change and media", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

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

  expect(hasPlugin.urlChange).toBe(true);
  expect(hasPlugin.media).toBe(true);
});

test("url-change plugin listens to popstate/hashchange by default", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

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

  expect(events).toEqual(["popstate", "hashchange"]);
});

test("url-change plugin can subscribe to pushState/replaceState", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

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

  expect(result).toEqual(["pushstate", "replacestate"]);
});

test("media plugin triggers immediately when query already matches", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/empty.html");

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

  expect(result).toEqual(["media"]);
});
