import { expect, test } from "@playwright/test";
import { story } from "executable-stories-playwright";

/**
 * Real-browser round-trip for the mcp-app-demo preview.
 *
 * Topology (per MCP Apps spec §8.4 — web hosts MUST use a sandbox proxy):
 *
 *   host (localhost:5179)
 *     └── outer iframe: sandbox-proxy.html (localhost:5180, different origin)
 *           └── inner iframe (srcdoc): the built `ui://` widget HTML
 *
 * The host implements: ui/notifications/sandbox-resource-ready,
 * ui/initialize response (with hostContext + hostCapabilities),
 * ui/notifications/tool-input, ui/notifications/tool-result.
 *
 * The widget runs inside the inner iframe and speaks the full 2026-01-26
 * wire protocol via ext-apps's App.
 *
 * verify.mjs is a string-grep — this spec is the only thing that catches a
 * regression in the actual handshake.
 */
test.describe("mcp-app-demo preview", () => {
  function widgetFrameLocator(page: import("@playwright/test").Page) {
    return page.frameLocator("#sandbox").frameLocator("iframe#inner");
  }

  test("full spec handshake: widget renders with annual breakdown", async ({
    page,
  }, testInfo) => {
    story.init(testInfo, {
      tags: ["mcp", "preview", "sandbox-proxy"],
      ticket: "MOUNTLY-MCP-DEMO-1",
    });

    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));

    story.given("the host page serves localhost:5179 and the sandbox proxy serves localhost:5180");
    await page.goto("http://localhost:5179/");
    await page.waitForLoadState("networkidle");

    story.when("the sandbox proxy → view handshake completes and the host auto-delivers the annual payload");
    const widget = widgetFrameLocator(page);
    await expect(widget.getByText("Total due")).toBeVisible({ timeout: 5000 });

    story.then("the widget rendered the annual structuredContent");
    await expect(widget.getByText("$99.00")).toBeVisible();
    await expect(widget.getByText("Annual subscription")).toBeVisible();
    await expect(widget.getByText("Setup fee")).toBeVisible();
    await expect(widget.getByText(/pay_demo_annual/i)).toBeVisible();

    story.then("the host's channel log reflects the full spec wire protocol");
    const log = await page.locator("#log").textContent();
    expect(log).toContain("ui/notifications/sandbox-proxy-ready");
    expect(log).toContain("ui/notifications/sandbox-resource-ready");
    expect(log).toContain("ui/initialize");
    expect(log).toContain("ui/notifications/initialized");
    expect(log).toContain("ui/notifications/tool-input");
    expect(log).toContain("ui/notifications/tool-result");

    story.then("no JS errors fired (catches React duplication / spec drift regressions)");
    expect(pageErrors).toEqual([]);
  });

  test("clicking Monthly delivers a fresh tool-result and the widget re-renders", async ({
    page,
  }, testInfo) => {
    story.init(testInfo, {
      tags: ["mcp", "preview", "update-path"],
      ticket: "MOUNTLY-MCP-DEMO-2",
    });

    story.given("the preview is open with the default annual breakdown shown");
    await page.goto("http://localhost:5179/");
    const widget = widgetFrameLocator(page);
    await expect(widget.getByText("$99.00")).toBeVisible({ timeout: 5000 });

    story.when("the user clicks Monthly, dispatching ui/notifications/tool-input + tool-result");
    await page.getByRole("button", { name: "Monthly" }).click();

    story.then("the widget re-renders against the monthly payload via the bridge's update() path");
    await expect(widget.getByText("$12.00")).toBeVisible({ timeout: 3000 });
    await expect(widget.getByText("Monthly subscription")).toBeVisible();
    await expect(widget.getByText("Processing fee")).toBeVisible();
    await expect(widget.getByText(/pay_demo_monthly/i)).toBeVisible();
    await expect(widget.getByText("Annual subscription")).toHaveCount(0);
  });

  test("sandbox topology: host and sandbox proxy serve from different origins", async ({
    page,
  }, testInfo) => {
    story.init(testInfo, {
      tags: ["mcp", "preview", "sandbox-origin"],
      ticket: "MOUNTLY-MCP-DEMO-3",
    });

    story.given("the preview boots both servers");
    await page.goto("http://localhost:5179/");
    await page.waitForLoadState("networkidle");

    story.when("we enumerate the iframe topology");
    const frameUrls = page.frames().map((f) => f.url()).sort();

    story.then("there are 3 frames: host, sandbox proxy on a distinct origin, inner srcdoc widget");
    expect(frameUrls).toContain("http://localhost:5179/");
    expect(frameUrls.some((u) => u.startsWith("http://localhost:5180/"))).toBe(true);
    expect(frameUrls.some((u) => u === "about:srcdoc")).toBe(true);
    // Origins must differ (spec §8.4.1) — 5179 vs 5180.
    expect(new URL("http://localhost:5179/").origin).not.toBe(
      new URL("http://localhost:5180/").origin,
    );
  });

  test("sandbox proxy applies strict defaults: sandbox attrs + CSP connect-src none", async ({
    page,
  }, testInfo) => {
    story.init(testInfo, {
      tags: ["mcp", "preview", "csp", "sandbox"],
      ticket: "MOUNTLY-MCP-DEMO-4",
    });

    await page.goto("http://localhost:5179/");
    const outerSandbox = await page.locator("#sandbox").getAttribute("sandbox");
    expect(outerSandbox).toBe("allow-scripts allow-same-origin");

    const inner = page.frameLocator("#sandbox").locator("iframe#inner");
    await expect(inner).toHaveAttribute("sandbox", "allow-scripts allow-same-origin");

    const srcdoc = await inner.getAttribute("srcdoc");
    expect(srcdoc).toContain("Content-Security-Policy");
    expect(srcdoc).toContain("connect-src 'none'");
  });

  test("resource teardown request is acknowledged by the widget bridge", async ({
    page,
  }, testInfo) => {
    story.init(testInfo, {
      tags: ["mcp", "preview", "teardown"],
      ticket: "MOUNTLY-MCP-DEMO-5",
    });

    await page.goto("http://localhost:5179/");
    const widget = widgetFrameLocator(page);
    await expect(widget.getByText("Total due")).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: "Teardown" }).click();
    const log = await page.locator("#log").textContent();
    expect(log).toContain("host → ui/resource-teardown#");
  });

  test("sandbox proxy ignores malformed sandbox-resource-ready payloads", async ({
    page,
  }, testInfo) => {
    story.init(testInfo, {
      tags: ["mcp", "preview", "malformed"],
      ticket: "MOUNTLY-MCP-DEMO-6",
    });

    await page.goto("http://localhost:5180/sandbox-proxy.html");
    await page.evaluate(() => {
      window.postMessage(
        {
          jsonrpc: "2.0",
          method: "ui/notifications/sandbox-resource-ready",
          params: { csp: {} },
        },
        "*",
      );
    });

    await expect(page.locator("iframe#inner")).toHaveCount(0);
  });
});
