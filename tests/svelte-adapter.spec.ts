import { test, expect } from "@playwright/test";
import { story } from "executable-stories-playwright";

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});


test("createWidget mount renders the Svelte component into the shadow root", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/svelte-mount.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => {
    const el = document.getElementById("c");
    const node = el?.shadowRoot?.querySelector("[data-mountly-root]");
    return node && node.textContent === "hello world";
  }, null, { timeout: 8000 });
  const text = await page.evaluate(() => {
    const el = document.getElementById("c");
    return el?.shadowRoot?.querySelector("[data-mountly-root]")?.textContent;
  });
  expect(text).toBe("hello world");
  const color = await page.evaluate(() => {
    const el = document.getElementById("c");
    const node = el?.shadowRoot?.querySelector(".svelte-mounted");
    return node ? getComputedStyle(node).color : "";
  });
  expect(color).toBe("rgb(11, 22, 33)");
});

test("createWidget remount is idempotent (single shadow root, single style, fresh tree)", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/svelte-remount.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.mountNodes).toBe(1);
  expect(result.stylePresent).toBe(true);
  expect(result.text).toBe("second");
});

test("style tag survives Svelte remount", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/svelte-style-survives.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.styleStillPresent).toBe(true);
});

test("Svelte widget unmount calls $destroy and remount rebuilds", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/svelte-unmount.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.before).toBe("alive");
  expect(result.textAfter).toBe("");
  expect(result.textAfterRemount).toBe("reborn");
  expect(result.destroyCallsAfterUnmount).toBe(1);
});

test("Svelte widget supports independent multi-instance mounts", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/svelte-multi-instance.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.aHasShadow).toBe(true);
  expect(result.bHasShadow).toBe(true);
  expect(result.aTextAfter).toBe("");
  expect(result.bText).toBe("beta");
});

test("Svelte widget falls back to light DOM for shadow-rejecting elements", async ({ page }) => {
  const warnings: string[] = [];
  page.on("console", (msg) => msg.type() === "warning" && warnings.push(msg.text()));
  await page.goto("http://localhost:5175/tests/fixtures/svelte-light-dom.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.hasShadowOnImg).toBe(false);
  expect(result.mountIsSibling).toBe(true);
  expect(result.mountText).toBe("fallback");
  expect(result.hasFallbackStyle).toBe(true);
  expect(warnings.some((w) => w.includes("light DOM"))).toBe(true);
});

test("Svelte widget works with closed shadow mode and remounts cleanly", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/svelte-closed-mode.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.error).toBeNull();
  expect(result.containerShadowRootIsNull).toBe(true);
  expect(result.canRemount).toBe(true);
});

test("Svelte 5 functional components dispatch through host-supplied mount/unmount", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/svelte-v5-functional.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.text1).toBe("v5-alive");
  expect(result.text2).toBe("");
  expect(result.text3).toBe("v5-reborn");
  // First mount + remount-after-unmount = 2 calls; one explicit unmount call.
  expect(result.mountCalls).toBe(2);
  expect(result.unmountCalls).toBe(1);
});

test("Svelte 5 auto-runtime import errors clearly when `svelte` is not resolvable", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/svelte-v5-missing-mount.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.caught).toContain("Could not import `svelte` runtime");
  expect(result.caught).toContain("import map");
});

test("Svelte widget supports shadow: false and still applies styles", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/svelte-no-shadow.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.hasShadowRoot).toBe(false);
  expect(result.text).toBe("plain");
  expect(result.computedColor).toBe("rgb(1, 2, 3)");
});

test("Svelte widget exposes update() and applies new props", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/svelte-update.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.text).toContain("b");
});
