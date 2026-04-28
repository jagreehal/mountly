import { test, expect } from "@playwright/test";

type Case = {
  name: string;
  mountUrl: string;
  updateUrl: string;
  noShadowUrl: string;
  expectedNoShadowColor: string;
};

const cases: Case[] = [
  {
    name: "react",
    mountUrl: "http://localhost:5175/tests/fixtures/react-mount.html",
    updateUrl: "http://localhost:5175/tests/fixtures/react-update.html",
    noShadowUrl: "http://localhost:5175/tests/fixtures/loader-react-no-shadow.html",
    expectedNoShadowColor: "rgb(12, 34, 56)",
  },
  {
    name: "vue",
    mountUrl: "http://localhost:5175/tests/fixtures/vue-mount.html",
    updateUrl: "http://localhost:5175/tests/fixtures/vue-update.html",
    noShadowUrl: "http://localhost:5175/tests/fixtures/vue-no-shadow.html",
    expectedNoShadowColor: "rgb(4, 5, 6)",
  },
  {
    name: "svelte",
    mountUrl: "http://localhost:5175/tests/fixtures/svelte-mount.html",
    updateUrl: "http://localhost:5175/tests/fixtures/svelte-update.html",
    noShadowUrl: "http://localhost:5175/tests/fixtures/svelte-no-shadow.html",
    expectedNoShadowColor: "rgb(1, 2, 3)",
  },
];

for (const c of cases) {
  test(`${c.name} parity: mounts in shadow DOM`, async ({ page }) => {
    await page.goto(c.mountUrl);
    await page.waitForLoadState("networkidle");
    const hasShadow = await page.evaluate(() => !!document.getElementById("c")?.shadowRoot);
    expect(hasShadow).toBe(true);
  });

  test(`${c.name} parity: update applies new props`, async ({ page }) => {
    await page.goto(c.updateUrl);
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => {
      const el = document.getElementById("c");
      const text = el?.shadowRoot?.textContent ?? "";
      return text.includes("b");
    }, null, { timeout: 8000 });
  });

  test(`${c.name} parity: supports no-shadow styling`, async ({ page }) => {
    await page.goto(c.noShadowUrl);
    await page.waitForLoadState("networkidle");
    const result = await page.evaluate(async () => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 20; i += 1) {
        const root = document.getElementById("c") ?? document.getElementById("mount");
        const node =
          root?.querySelector(".react-loader-widget, .vue-no-shadow, .svelte-no-shadow");
        if (root && node) {
          return {
            hasShadowRoot: !!(root as HTMLElement).shadowRoot,
            computedColor: getComputedStyle(node as Element).color,
          };
        }
        await wait(50);
      }
      return { hasShadowRoot: true, computedColor: "" };
    });
    expect(result.hasShadowRoot).toBe(false);
    expect(result.computedColor).toBe(c.expectedNoShadowColor);
  });
}
