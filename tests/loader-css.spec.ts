import { expect, test } from "@playwright/test";

test("createModuleLoader auto-loads companion CSS for React shadow mount", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/loader-react-shadow.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__ready && (window as any).__ready(), null, { timeout: 8000 });
  const result = await page.evaluate(() => {
    const mount = document.getElementById("mount");
    const node = mount?.shadowRoot?.querySelector(".react-loader-widget");
    return { hasShadow: !!mount?.shadowRoot, color: node ? getComputedStyle(node).color : "" };
  });
  expect(result.hasShadow).toBe(true);
  expect(result.color).toBe("rgb(12, 34, 56)");
});

test("createModuleLoader auto-loads companion CSS for React light-DOM mount", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/loader-react-no-shadow.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__ready && (window as any).__ready(), null, { timeout: 8000 });
  const result = await page.evaluate(() => {
    const mount = document.getElementById("mount");
    const node = mount?.querySelector(".react-loader-widget");
    return {
      hasShadow: !!mount?.shadowRoot,
      color: node ? getComputedStyle(node).color : "",
    };
  });
  expect(result.hasShadow).toBe(false);
  expect(result.color).toBe("rgb(12, 34, 56)");
});

test("createModuleLoader auto-loads companion CSS for Vue shadow mount", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/loader-vue-shadow.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__ready && (window as any).__ready(), null, { timeout: 8000 });
  const result = await page.evaluate(() => {
    const mount = document.getElementById("mount");
    const node = mount?.shadowRoot?.querySelector(".vue-loader-widget");
    return { hasShadow: !!mount?.shadowRoot, color: node ? getComputedStyle(node).color : "" };
  });
  expect(result.hasShadow).toBe(true);
  expect(result.color).toBe("rgb(66, 55, 44)");
});

test("createModuleLoader auto-loads companion CSS for Vue light-DOM mount", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/loader-vue-no-shadow.html");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => (window as any).__ready && (window as any).__ready(), null, { timeout: 8000 });
  const result = await page.evaluate(() => {
    const mount = document.getElementById("mount");
    const node = mount?.querySelector(".vue-loader-widget");
    return {
      hasShadow: !!mount?.shadowRoot,
      color: node ? getComputedStyle(node).color : "",
    };
  });
  expect(result.hasShadow).toBe(false);
  expect(result.color).toBe("rgb(66, 55, 44)");
});
