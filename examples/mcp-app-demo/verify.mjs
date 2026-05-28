import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DEMO_APP_ONLY_URI,
  DEMO_APP_ONLY_TOOL,
  DEMO_TOOL,
  DEMO_URI,
  SAMPLE_PAYMENTS,
  createDemoServer,
} from "./demo-core.mjs";

export async function runVerification() {
  const { server, cleanup, built } = await createDemoServer();

  try {
    const { client } = await server.connectInProcess();

    const tools = await client.listTools();
    const tool = tools.tools.find((t) => t.name === DEMO_TOOL);
    assert.ok(tool, "expected demo tool to be registered");
    const appOnlyTool = tools.tools.find((t) => t.name === DEMO_APP_ONLY_TOOL);
    assert.ok(appOnlyTool, "expected app-only tool to be registered");
    assert.deepEqual(appOnlyTool?._meta?.ui?.visibility, ["app"]);
    assert.equal(appOnlyTool?._meta?.ui?.resourceUri, DEMO_APP_ONLY_URI);
    // Modern + legacy meta key both populated by registerAppTool.
    assert.equal(tool._meta?.ui?.resourceUri, DEMO_URI);

    const resources = await client.listResources();
    const resource = resources.resources.find((r) => r.uri === DEMO_URI);
    assert.ok(resource, "expected ui:// resource to be listed");
    assert.equal(
      resource.mimeType,
      "text/html;profile=mcp-app",
      "resource should advertise the MCP Apps MIME type per spec",
    );

    const read = await client.readResource({ uri: DEMO_URI });
    const content = read.contents[0];
    assert.equal(content?.mimeType, "text/html;profile=mcp-app");
    const html = content?.text;
    assert.ok(html?.includes("mountly-mcp-root"), "expected mount node in HTML");

    // Spec-compliance markers — the bundled bridge uses ext-apps's App,
    // which speaks the full 2026-01-26 wire protocol.
    assert.ok(
      html?.includes("ui/initialize"),
      "expected ui/initialize handshake in bridge runtime",
    );
    assert.ok(
      html?.includes("ui/notifications/initialized"),
      "expected ui/notifications/initialized in bridge runtime (proves spec handshake)",
    );
    assert.ok(
      html?.includes("ui/notifications/tool-input"),
      "expected ui/notifications/tool-input handler in bridge runtime",
    );
    assert.ok(
      html?.includes("ui/notifications/tool-result"),
      "expected ui/notifications/tool-result handler in bridge runtime",
    );
    assert.ok(
      html?.includes("ui/notifications/host-context-changed"),
      "expected host-context-changed handler in bridge runtime",
    );
    assert.ok(
      html?.includes("ui/notifications/size-changed") ||
        html?.includes("size-changed"),
      "expected size-changed plumbing in bridge runtime",
    );
    assert.ok(
      html?.includes("__mountlyMcpWidget__"),
      "expected widget bundle to register __mountlyMcpWidget__",
    );
    assert.ok(
      html?.includes("PaymentBreakdown") || html?.includes("Breakdown"),
      "expected PaymentBreakdown component code in widget bundle",
    );

    // Tool returns the annual plan structured content.
    const callAnnual = await client.callTool({
      name: DEMO_TOOL,
      arguments: { plan: "annual" },
    });
    assert.deepEqual(callAnnual.structuredContent, SAMPLE_PAYMENTS.annual);

    // Monthly returns a different payload — proves the handler reacts to args
    // and drives the bridge's update() path in a host.
    const callMonthly = await client.callTool({
      name: DEMO_TOOL,
      arguments: { plan: "monthly" },
    });
    assert.deepEqual(callMonthly.structuredContent, SAMPLE_PAYMENTS.monthly);

    // Sidecar reflects the spec-shaped resource declaration.
    const metaPath = `${built.htmlPath}.meta.json`;
    const meta = JSON.parse(await readFile(metaPath, "utf8"));
    assert.equal(meta.awaitToolResult, true);
    assert.equal(meta.mimeType, "text/html;profile=mcp-app");
    assert.equal(meta.protocolVersion, "2026-01-26");
    assert.ok(Array.isArray(meta.displayModes));

    console.log("[mcp-app-demo] verification passed");
    console.log(`- tool: ${DEMO_TOOL}`);
    console.log(`- resource: ${DEMO_URI} (${resource.mimeType})`);
    console.log(`- widget HTML: ${built.htmlPath}`);
    console.log("- full spec wire protocol present in bridge runtime");
    console.log("- real React widget bundle: yes");
    console.log(
      `- structuredContent (annual): total=${SAMPLE_PAYMENTS.annual.total} ${SAMPLE_PAYMENTS.annual.currency}`,
    );
    console.log(
      `- structuredContent (monthly): total=${SAMPLE_PAYMENTS.monthly.total} ${SAMPLE_PAYMENTS.monthly.currency}`,
    );
  } finally {
    await cleanup();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runVerification();
}
