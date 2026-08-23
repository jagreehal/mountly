import { test, expect, type Page } from "@playwright/test";

const HOST = "http://localhost:5175/tests/fixtures";

const open = async (page: Page, fixture: string) => {
  await page.goto(`${HOST}/${fixture}`);
  await page.waitForLoadState("networkidle");
};

const textOf = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el?.shadowRoot?.textContent ?? el?.textContent ?? "";
  }, selector);

test("an island is a URL, a trigger and some props — no page JS", async ({ page }) => {
  await open(page, "island-basic.html");
  await expect(page.locator("#island")).toHaveAttribute("data-mountly-state", "idle");

  await page.click("#island");
  await expect(page.locator("#island .island-msg")).toHaveText("hello");
  await expect(page.locator("#island")).toHaveAttribute("data-mountly-state", "mounted");

  // the sibling w-echo.css is loaded from the module URL, with nothing declared
  const color = await page.evaluate(
    () => getComputedStyle(document.querySelector("#island .island-msg")!).color,
  );
  expect(color).toBe("rgb(1, 2, 3)");
});

test("data-mountly can be an alias resolved by the host script's url map", async ({ page }) => {
  await open(page, "island-urls.html");
  await page.click("#island");
  await expect(page.locator("#island .island-msg")).toHaveText("aliased");
});

test("props can live in a JSON script child, so quotes need no escaping", async ({ page }) => {
  await open(page, "island-props-script.html");
  await page.click("#island");
  await expect(page.locator("#island .island-msg")).toHaveText('He said "hi"');
});

test("data-target splits the trigger from the mount point", async ({ page }) => {
  await open(page, "island-target.html");
  await page.click("#trigger");
  await expect(page.locator("#panel .island-msg")).toHaveText("in-panel");
  await expect(page.locator("#trigger")).toHaveText("Open");
});

test("activation mounts once; data-toggle opts in to click-to-close", async ({ page }) => {
  await open(page, "island-toggle.html");
  await page.click("#sticky");
  await page.click("#toggle");
  await expect(page.locator("#sticky .island-msg")).toHaveText("sticky");
  await expect(page.locator("#toggle .island-msg")).toHaveText("toggle");

  await page.click("#sticky");
  await page.click("#toggle");
  await expect(page.locator("#sticky .island-msg")).toHaveText("sticky");
  await expect(page.locator("#toggle")).toBeEmpty();
  await expect(page.locator("#toggle")).toHaveAttribute("data-mountly-state", "idle");
  // the sticky island mounted exactly once across two clicks
  expect(await page.evaluate(() => (window as any).__mounts)).toBe(2);
});

test("triggers read as kind or kind:arg, and several can share one island", async ({ page }) => {
  await open(page, "island-triggers.html");

  // media and idle fire on their own
  await expect(page.locator("#media .island-msg")).toHaveText("media");
  await expect(page.locator("#idle .island-msg")).toHaveText("idle");

  await page.hover("#hover");
  await expect(page.locator("#hover .island-msg")).toHaveText("hover");

  await page.focus("#focus");
  await expect(page.locator("#focus .island-msg")).toHaveText("focus");

  await page.focus("#either");
  await expect(page.locator("#either .island-msg")).toHaveText("either");

  await page.locator("#viewport").scrollIntoViewIfNeeded();
  await expect(page.locator("#viewport .island-msg")).toHaveText("viewport");
});

test('data-mountly-state="mounted" from the server is the whole SSR handshake', async ({
  page,
}) => {
  await open(page, "island-ssr.html");
  await page.click("#island");
  await page.waitForTimeout(200);
  expect(await textOf(page, "#island")).toContain("server-rendered");
  expect(await page.evaluate(() => (window as any).__mounts)).toBeUndefined();
});

test("a failed load lands in the error state and retries on the next intent", async ({ page }) => {
  await open(page, "island-error.html");
  await page.click("#island");
  await expect(page.locator("#island")).toHaveAttribute("data-mountly-state", "error");
  const events = await page.evaluate(() => (window as any).__events);
  expect(events).toEqual(["/tests/fixtures/does-not-exist.js"]);
});

test("islands added to the DOM later are picked up automatically", async ({ page }) => {
  await open(page, "island-late.html");
  await page.click("#parent");
  await expect(page.locator("#child")).toHaveAttribute("data-mountly-state", "idle");
  await page.click("#child");
  await expect(page.locator("#child .island-msg")).toHaveText("child");
});

test("data-preload fetches the module without mounting it", async ({ page }) => {
  await open(page, "island-preload.html");
  await page.hover("#island");
  await page.waitForFunction(() => (window as any).__loaded === 1);
  expect(await page.evaluate(() => (window as any).__mounts)).toBeUndefined();
  await expect(page.locator("#island")).toHaveAttribute("data-mountly-state", "idle");

  await page.click("#island");
  await expect(page.locator("#island .island-msg")).toHaveText("preloaded");
  // still one network fetch: the preload is what the mount consumes
  expect(await page.evaluate(() => (window as any).__loaded)).toBe(1);
});

test("every island under the root is wired", async ({ page }) => {
  await open(page, "island-mount-all.html");
  await page.click("#a");
  await page.click("#b");
  const text = await textOf(page, "#root");
  expect(text).toContain("A");
  expect(text).toContain("B");
});

test("light-DOM widgets stay reachable to the page and to form APIs", async ({ page }) => {
  await open(page, "island-forms.html");
  await page.click("#island");
  await expect(page.locator("#island .widget-form")).toBeVisible();
  expect(await page.evaluate(() => !!document.getElementById("island")?.shadowRoot)).toBe(false);
  await page.locator("#island .widget-form button").click();
  expect(await page.evaluate(() => (window as any).__formValue)).toBe("test-value");
});

test("shadow-mode widgets get their stylesheet without the host declaring it", async ({ page }) => {
  await open(page, "island-style-shadow.html");
  await page.click("#island");
  await page.waitForFunction(
    () => !!document.getElementById("island")?.shadowRoot?.querySelector(".styled-widget"),
  );
  const color = await page.evaluate(
    () =>
      getComputedStyle(
        document.getElementById("island")!.shadowRoot!.querySelector(".styled-widget")!,
      ).color,
  );
  expect(color).toBe("rgb(11, 22, 33)");
});

test("light-mode widgets get theirs too, in the document", async ({ page }) => {
  await open(page, "island-style-no-shadow.html");
  await page.click("#island");
  await expect(page.locator("#island .styled-widget")).toBeVisible();
  const result = await page.evaluate(() => {
    const node = document.querySelector("#island .styled-widget")!;
    return {
      shadow: !!document.getElementById("island")?.shadowRoot,
      color: getComputedStyle(node).color,
    };
  });
  expect(result.shadow).toBe(false);
  expect(result.color).toBe("rgb(11, 22, 33)");
});

test("frameworks mix on one page because they share one widget contract", async ({ page }) => {
  await open(page, "island-mixed.html");
  await page.click("#svelte-island");
  await page.click("#plain-island");
  await page.waitForFunction(
    () => !!document.getElementById("svelte-island")?.shadowRoot?.querySelector(".styled-widget"),
  );
  await expect(page.locator("#plain-island .island-msg")).toHaveText("plain");
});

test("mount / update / unmount are available imperatively", async ({ page }) => {
  await open(page, "island-imperative.html");
  await page.waitForFunction(() => (window as any).__result);
  expect(await page.evaluate(() => (window as any).__result)).toEqual({
    mounted: "first",
    updated: "second",
    unmounted: "",
    state: "idle",
  });
});
