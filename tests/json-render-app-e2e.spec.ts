import { test, expect } from "@playwright/test";
import { buildAppHtml } from "../packages/mcp-apps/src/json-render/app";

test("buildAppHtml executes bundled iframe script", async ({ page }) => {
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
