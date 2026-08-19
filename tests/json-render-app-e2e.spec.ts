import { test, expect } from "@playwright/test";

// Imported dynamically, like tests/mcp-dev-host.story.spec.ts: Playwright
// transpiles specs to CJS, so a static import pulls package source into the
// CJS registry. Later specs that `import()` the same source as ESM then fail
// to see its named exports.
const loadApp = () => import("../packages/mcp-apps/src/json-render/app.js");

test("buildAppHtml executes bundled iframe script", async ({ page }) => {
  const { buildAppHtml } = await loadApp();
  const html = buildAppHtml({
    title: "json-render-e2e",
    js: "window.__jsonRenderReady = 'ok';",
  });
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  const ready = await page.evaluate(
    () => (window as { __jsonRenderReady?: string }).__jsonRenderReady,
  );
  await expect(ready).toBe("ok");
});
