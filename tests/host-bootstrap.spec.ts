import { test, expect } from "@playwright/test";

test("one-script host bootstrap mounts islands and styles them", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/host-one-tag.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => {
    const node = document.querySelector("#island .host-widget");
    return !!node;
  }, null, { timeout: 8000 });

  const result = await page.evaluate(() => {
    const node = document.querySelector("#island .host-widget");
    return {
      text: node?.textContent ?? "",
      color: node ? getComputedStyle(node).color : "",
    };
  });
  expect(result.text).toContain("host-ok");
  expect(result.color).toBe("rgb(12, 34, 56)");
});

test("fallback content remains usable when JavaScript is disabled", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://localhost:5175/tests/fixtures/island-fallback-nojs.html");
  const href = await page.getAttribute("#fallback-link", "href");
  const text = await page.textContent("#fallback-link");
  expect(href).toBe("/docs");
  expect(text).toContain("fallback");
  await context.close();
});

test("reserve size prevents layout jump during island mount", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-reserve-no-jump.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.before).toBe(40);
  expect(result.after).toBe(40);
});

test("container-query styles respond to container width changes", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/container-query-widget.html");
  await page.waitForLoadState("networkidle");
  const first = await page.evaluate(() => (window as any).__result());
  expect(first).toBe("rgb(10, 10, 10)");
  await page.evaluate(() => {
    (document.getElementById("wrap") as HTMLElement).style.width = "340px";
  });
  const second = await page.evaluate(() => (window as any).__result());
  expect(second).toBe("rgb(220, 80, 80)");
});

test("adapter reserveSize works for React/Vue/Svelte widgets", async ({ page }) => {
  const urls = [
    "http://localhost:5175/tests/fixtures/widget-reserve-react.html",
    "http://localhost:5175/tests/fixtures/widget-reserve-vue.html",
    "http://localhost:5175/tests/fixtures/widget-reserve-svelte.html",
  ];
  for (const url of urls) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
    const result = await page.evaluate(() => (window as any).__result);
    expect(result.h).toBe(40);
  }
});
