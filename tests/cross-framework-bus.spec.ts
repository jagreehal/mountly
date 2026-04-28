import { test, expect } from "@playwright/test";

test("cross-framework bus syncs React, Vue, and Svelte widgets on same page", async ({ page }) => {
  await page.goto("http://localhost:5175/tests/fixtures/cross-framework-styled.html");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: /\+\s*React/i }).click();
  await page.waitForTimeout(250);

  const afterReact = await page.textContent("body");
  expect(afterReact ?? "").toContain("react=1");

  await page.getByRole("button", { name: /\+\s*Vue/i }).click();
  await page.waitForTimeout(250);

  const afterVue = await page.textContent("body");
  expect(afterVue ?? "").toContain("vue=1");

  await page.getByRole("button", { name: /\+\s*Svelte/i }).click();
  await page.waitForTimeout(250);

  const afterSvelte = await page.textContent("body");
  expect(afterSvelte ?? "").toContain("svelte=1");

  const styles = await page.evaluate(() => {
    const react = document.querySelector(".rf-card");
    const vue = document.querySelector(".vue-card");
    const svelte = document.querySelector(".sv-card");
    return {
      reactColor: react ? getComputedStyle(react).color : "",
      vueColor: vue ? getComputedStyle(vue).color : "",
      svelteColor: svelte ? getComputedStyle(svelte).color : "",
    };
  });
  expect(styles.reactColor).toBe("rgb(200, 60, 60)");
  expect(styles.vueColor).toBe("rgb(60, 140, 220)");
  expect(styles.svelteColor).toBe("rgb(50, 160, 100)");
});
