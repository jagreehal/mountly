import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { story } from "executable-stories-playwright";

// Imported dynamically: Playwright transpiles specs to CJS, and both modules
// use `import.meta`, which only parses inside an ES module.
const loadBuild = () => import("../packages/mcp-apps/src/build/index.js");
const loadDev = () => import("../packages/mcp-apps/src/dev/index.js");

/**
 * The dev host in a real browser.
 *
 * tests/mcp-dev.story.test.ts asserts over HTTP, which means it passes for a
 * host that serves a correct-looking page and never completes a handshake.
 * Three shipped bugs — a host runtime resolved to the wrong path, a framework
 * externalized out of the bundle, and `process` referenced inside the iframe —
 * all produced a blank view while every HTTP assertion stayed green. Only a
 * browser that loads the page and reads the rendered text catches those.
 */
async function buildWidget(): Promise<string> {
  const { buildMcpResource, getBridgeRuntimePath } = await loadBuild();
  const dir = mkdtempSync(join(tmpdir(), "mountly-mcp-devhost-"));
  // Renders the delivered tool data, so a handshake that never completes shows
  // up as missing text rather than as a silently blank iframe.
  writeFileSync(
    join(dir, "widget.js"),
    `globalThis.__mountlyMcpWidget__ = {
       mount(container, props) {
         const total = props?.toolResult?.structuredContent?.total;
         container.textContent = "total:" + (total ?? "none");
       },
       update(container, props) { this.mount(container, props); },
       unmount(container) { container.textContent = ""; },
     };`,
    "utf8",
  );
  const output = join(dir, "widget.html");
  await buildMcpResource({
    entry: join(dir, "widget.js"),
    uri: "ui://dev-host/quote",
    name: "quote_payment",
    output,
    bridgeRuntimePath: getBridgeRuntimePath(),
  });
  return output;
}

test.describe("mountly-mcp dev host", () => {
  test("renders a view through the sandbox proxy and delivers fixtures", async ({
    page,
  }, testInfo) => {
    story.init(testInfo, { tags: ["mcp", "dev", "sandbox-proxy"] });

    story.given("a built View served by the dev host");
    const htmlPath = await buildWidget();
    const { startDevHost } = await loadDev();
    const host = await startDevHost({
      htmlPath,
      fixtures: { annual: { total: 99 }, monthly: { total: 12 } },
      hostPort: 5410,
    });

    try {
      story.when("a browser opens the host");
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(host.hostUrl);

      story.then("the handshake completes and the view renders the first fixture");
      const view = page.frameLocator("#sandbox").frameLocator("iframe");
      await expect(view.locator("body")).toContainText("total:99", { timeout: 15_000 });

      story.then("nothing in the view threw on the way there");
      expect(errors).toEqual([]);

      story.then("a second fixture re-delivers tool-result and the view updates");
      await page.click('button[data-fixture="monthly"]');
      await expect(view.locator("body")).toContainText("total:12");
      expect(errors).toEqual([]);
    } finally {
      await host.close();
    }
  });
});

test.describe("mountly-mcp verify --render", () => {
  test("fails a View that throws, which the file checks pass", async ({}, testInfo) => {
    story.init(testInfo, { tags: ["mcp", "verify", "conformance"] });

    story.given("a View whose bundle references a Node global, as the vite bug produced");
    const { buildMcpResource, getBridgeRuntimePath } = await loadBuild();
    const dir = mkdtempSync(join(tmpdir(), "mountly-mcp-verify-"));
    writeFileSync(
      join(dir, "widget.js"),
      `globalThis.__mountlyMcpWidget__ = {
         mount(c){ c.textContent = "mode:" + process.env.NODE_ENV; },
         unmount(c){ c.textContent = ""; },
       };`,
      "utf8",
    );
    const htmlPath = join(dir, "broken.html");
    await buildMcpResource({
      entry: join(dir, "widget.js"),
      uri: "ui://broken/view",
      name: "broken_view",
      description: "Throws on mount",
      output: htmlPath,
      bridgeRuntimePath: getBridgeRuntimePath(),
    });

    const { verifyMcpApps } = await import("../packages/mcp-apps/src/testing/index.js");

    story.when("verification runs over the files alone");
    const staticOnly = await verifyMcpApps({ htmlPaths: [htmlPath] });

    story.then("it passes — the handshake strings are present, so nothing looks wrong");
    expect(staticOnly.ok).toBe(true);
    expect(staticOnly.mode).toBe("static");
    expect(staticOnly.diagnostics.map((d) => d.code)).not.toContain("artifact/not-rendered");

    story.when("the same View is rendered");
    const rendered = await verifyMcpApps({ htmlPaths: [htmlPath], render: true });

    story.then("it fails, naming what the View actually did");
    expect(rendered.ok).toBe(false);
    const boundary = rendered.diagnostics.find((d) => d.code === "render/error-boundary");
    expect(boundary?.message).toContain("process is not defined");

    rmSync(dir, { recursive: true });
  });

  test("fails a View whose mount succeeds without rendering content", async ({}, testInfo) => {
    story.init(testInfo, { tags: ["mcp", "verify", "conformance"] });

    const { buildMcpResource, getBridgeRuntimePath } = await loadBuild();
    const dir = mkdtempSync(join(tmpdir(), "mountly-mcp-verify-blank-"));
    writeFileSync(
      join(dir, "widget.js"),
      `globalThis.__mountlyMcpWidget__ = {
         mount(){},
         unmount(){},
       };`,
      "utf8",
    );
    const htmlPath = join(dir, "blank.html");
    await buildMcpResource({
      entry: join(dir, "widget.js"),
      uri: "ui://blank/view",
      name: "blank_view",
      description: "Intentionally blank",
      output: htmlPath,
      bridgeRuntimePath: getBridgeRuntimePath(),
    });

    try {
      const { verifyMcpApps } = await import("../packages/mcp-apps/src/testing/index.js");
      const report = await verifyMcpApps({ htmlPaths: [htmlPath], render: true });

      expect(report.ok).toBe(false);
      expect(report.diagnostics).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: "render/blank" })]),
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("waits for an asynchronous Shadow DOM commit", async ({}, testInfo) => {
    story.init(testInfo, { tags: ["mcp", "verify", "shadow-dom"] });

    const { buildMcpResource, getBridgeRuntimePath } = await loadBuild();
    const dir = mkdtempSync(join(tmpdir(), "mountly-mcp-verify-shadow-"));
    writeFileSync(
      join(dir, "widget.js"),
      `globalThis.__mountlyMcpWidget__ = {
         mount(container) {
           setTimeout(() => {
             const root = container.attachShadow({ mode: "open" });
             root.innerHTML = "<p>ready</p>";
           }, 50);
         },
         unmount(){},
       };`,
      "utf8",
    );
    const htmlPath = join(dir, "shadow.html");
    await buildMcpResource({
      entry: join(dir, "widget.js"),
      uri: "ui://shadow/view",
      name: "shadow_view",
      description: "Asynchronous shadow View",
      output: htmlPath,
      bridgeRuntimePath: getBridgeRuntimePath(),
    });

    try {
      const { verifyMcpApps } = await import("../packages/mcp-apps/src/testing/index.js");
      const report = await verifyMcpApps({ htmlPaths: [htmlPath], render: true });

      expect(report.ok).toBe(true);
      expect(report.mode).toBe("browser");
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
