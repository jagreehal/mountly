import { test, expect } from "@playwright/test";

test("mountIslandFeature mounts widget from data payload", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-basic.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__ready && (window as any).__ready(), null, { timeout: 8000 });
  const text = await page.evaluate(() => {
    const island = document.getElementById("island");
    return island?.shadowRoot?.textContent ?? island?.textContent ?? "";
  });
  expect(text).toContain("hello");
});

test("readIslandPayload fails clearly for invalid payload", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-invalid.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.caught).toContain("invalid island payload");
  expect(result.caught).toContain("MNTI001");
});

test("mountIslandFeature fails clearly for missing loader", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-missing-loader.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.caught).toContain("no loader registered");
  expect(result.caught).toContain("MNTI004");
});

test("readIslandPayload validates targetSelector and emits mountly:error", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-invalid-selector.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.caught).toContain("MNTI003");
  expect(result.events[0].code).toBe("MNTI003");
});

test("mountIslandFeature emits mountly:error for missing loader", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-missing-loader-event.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.caught).toContain("MNTI004");
  expect(result.events[0].code).toBe("MNTI004");
});

test("mountIslandFeature respects targetSelector in payload", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-target-selector.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__ready && (window as any).__ready(), null, { timeout: 8000 });
  const text = await page.evaluate(() => document.getElementById("island")?.textContent ?? "");
  expect(text).toContain("hello-target");
});

test("mountIslandFeature emits lifecycle events", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-events.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__ready && (window as any).__ready(), null, { timeout: 8000 });
  const events = await page.evaluate(() => (window as any).__events);
  const names = events.map((e: { name: string }) => e.name);
  expect(names).toContain("load-start");
  expect(names).toContain("load-end");
  expect(names).toContain("mount");
});

test("mountAllIslands mounts all payload elements under root", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-mount-all.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.count).toBe(2);
  expect(result.text).toContain("A");
  expect(result.text).toContain("B");
});

test("island path keeps styles working in shadow mode", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-style-shadow.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__ready && (window as any).__ready(), null, { timeout: 8000 });
  const result = await page.evaluate(() => {
    const island = document.getElementById("island");
    const node = island?.shadowRoot?.querySelector(".island-shadow-style");
    return {
      hasShadow: !!island?.shadowRoot,
      color: node ? getComputedStyle(node).color : "",
    };
  });
  expect(result.hasShadow).toBe(true);
  expect(result.color).toBe("rgb(77, 88, 99)");
});

test("island path keeps styles working in no-shadow mode", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-style-no-shadow.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__ready && (window as any).__ready(), null, { timeout: 8000 });
  const result = await page.evaluate(() => {
    const island = document.getElementById("island");
    const node = island?.querySelector(".island-no-shadow-style");
    return {
      hasShadow: !!island?.shadowRoot,
      color: node ? getComputedStyle(node).color : "",
    };
  });
  expect(result.hasShadow).toBe(false);
  expect(result.color).toBe("rgb(101, 111, 121)");
});

test("island can preserve SSR content when already hydrated", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-hydrated-skip.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.text).toContain("ssr-content");
  expect(result.hasClient).toBe(false);
});

test("island can force remount over SSR content when requested", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-hydrated-force-remount.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.text).toContain("client");
  expect(result.hasClient).toBe(true);
  expect(result.hydratedAttr).toBe("true");
});

test("island honors payload skipIfHydrated without JS options", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-hydrated-payload-skip.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.text).toContain("ssr-only");
  expect(result.hasClient).toBe(false);
});

test("island honors payload forceRemount and hydratedAttr without JS options", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-hydrated-payload-force.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.text).toContain("client");
  expect(result.hasClient).toBe(true);
  expect(result.hydratedAttr).toBe("true");
});


test("unmountAllIslands detaches and clears mounted island content", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-unmount-all.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.count).toBe(2);
  expect(result.before).toContain("A");
  expect(result.before).toContain("B");
  expect(result.after).not.toContain("A");
  expect(result.after).not.toContain("B");
});


test("island once mode mounts once and ignores subsequent toggles", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-once.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.first).toContain("hello-once");
  expect(result.second).toContain("hello-once");
});


test("nested island waits for parent hydration before child mount", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-nested-ordering.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.mountedCount).toBe(2);
  expect(result.beforeParent).not.toContain("child-mount");
  expect(result.beforeParent).not.toContain("parent-mount");
  expect(result.order).toContain("parent-mount");
  expect(result.order).toContain("child-mount");
});


test("island sets data-mountly-state to mounted on success", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-basic.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__ready && (window as any).__ready(), null, { timeout: 8000 });
  const state = await page.evaluate(() => document.getElementById("island")?.getAttribute("data-mountly-state"));
  expect(state).toBe("mounted");
});

test("island sets data-mountly-state to error on loader failure", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-state-error.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.state).toBe("error");
});


test("island retries transient loader failures and mounts", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-retry-success.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.calls).toBe(2);
  expect(result.state).toBe("mounted");
  expect(result.text).toContain("ok");
});

test("island enters error state after retry budget is exhausted", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-retry-fail.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.calls).toBe(2);
  expect(result.state).toBe("error");
});


test("island auto-unmounts on mountly:unmount event", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-auto-unmount-event.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.before).toContain("alive");
  expect(result.after).not.toContain("alive");
});


test("island can require SSR marker and skip hydration when missing", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-require-ssr-missing.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.calls).toBe(0);
  expect(result.text).not.toContain("x");
});

test("island can require SSR marker and hydrate when present", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-require-ssr-present.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.calls).toBe(1);
  expect(result.text).toContain("ok");
});

test("island handles mountly:refresh via module refresh()", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-refresh-event.html");
  await page.waitForLoadState("networkidle");
  await page.locator("#island").dispatchEvent("click");
  await expect(page.locator("#island .value")).toHaveText("hello:1");
  await page.locator("#island").dispatchEvent("mountly:refresh");
  await expect(page.locator("#island .value")).toHaveText("hello:2");
});

test("island warns on hydration mismatch when force-remounting SSR content", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-hydration-mismatch-warn.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.warnedAttr).toBe("true");
  expect(result.warns.some((w: string) => w.includes("force-remounting over SSR content"))).toBe(true);
});

test("island emits perf marks when enabled", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-perf-marks.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.marks.some((m: string) => m.includes("mountly:island:pm:load-start"))).toBe(true);
  expect(result.marks.some((m: string) => m.includes("mountly:island:pm:mount-end"))).toBe(true);
  expect(result.marks.some((m: string) => m.includes("mountly:island:pm:refresh"))).toBe(true);
});

test("island emits pause/resume lifecycle events on visibilitychange", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-visibility-events.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  expect(result.events).toContain("pause");
  expect(result.events).toContain("resume");
});

test("readIslandPayload emits warnings for unknown keys and weak trigger combos", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/island-payload-warnings.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__result, null, { timeout: 8000 });
  const result = await page.evaluate(() => (window as any).__result);
  const codes = result.warnings.map((w: { code: string }) => w.code);
  expect(codes).toContain("MNTW001");
  expect(codes).toContain("MNTW002");
});
