import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DEMO_TOOL, DEMO_URI, SAMPLE_SPECS, createDemoServer } from "./demo-core.mjs";

export async function runVerification() {
  const { server, cleanup, built } = await createDemoServer();

  try {
    const { client } = await server.connectInProcess();

    // --- Tool is registered and points at the ui:// resource ---
    const tools = await client.listTools();
    const tool = tools.tools.find((t) => t.name === DEMO_TOOL);
    assert.ok(tool, "expected render_dashboard tool to be registered");
    assert.equal(tool._meta?.ui?.resourceUri, DEMO_URI);

    // --- Resource is listed with the MCP Apps MIME type ---
    const resources = await client.listResources();
    const resource = resources.resources.find((r) => r.uri === DEMO_URI);
    assert.ok(resource, "expected ui:// resource to be listed");
    assert.equal(
      resource.mimeType,
      "text/html;profile=mcp-app",
      "resource should advertise the MCP Apps MIME type per spec",
    );

    // --- Resource HTML carries the bridge + the generative widget bundle ---
    const read = await client.readResource({ uri: DEMO_URI });
    const content = read.contents[0];
    assert.equal(content?.mimeType, "text/html;profile=mcp-app");
    const html = content?.text;
    assert.ok(html?.includes("mountly-mcp-root"), "expected mount node in HTML");
    assert.ok(
      html?.includes("ui/initialize"),
      "expected ui/initialize handshake in bridge runtime",
    );
    assert.ok(
      html?.includes("ui/notifications/tool-result"),
      "expected tool-result handler in bridge runtime",
    );
    assert.ok(
      html?.includes("__mountlyMcpWidget__"),
      "expected widget bundle to register __mountlyMcpWidget__",
    );
    // json-render markers — proves the catalog components + renderer are bundled.
    assert.ok(
      html?.includes("gv-stat") && html?.includes("gv-card"),
      "expected registry component class names in the widget bundle",
    );
    // Actions-bridge markers — the value-add json-render alone can't do:
    // a generated button calls back into the agent via the MCP host.
    assert.ok(html?.includes("gv-button"), "expected Button component in the widget bundle");
    assert.ok(
      html?.includes("sendMessage"),
      "expected the onAction→App.sendMessage bridge in the widget bundle",
    );

    // The sample spec itself wires a button action back to the agent.
    const btn = SAMPLE_SPECS.revenue.elements.btn;
    assert.equal(btn?.type, "Button");
    assert.equal(btn?.on?.press?.action, "ask", "button must bind the ask action");

    // --- Tool reacts to the prompt: keyword routing into a spec (no LLM) ---
    const callGrowth = await client.callTool({
      name: DEMO_TOOL,
      arguments: { prompt: "show me growth and churn" },
    });
    assert.deepEqual(callGrowth.structuredContent, {
      spec: SAMPLE_SPECS.growth,
    });

    const callRevenue = await client.callTool({
      name: DEMO_TOOL,
      arguments: { prompt: "give me a revenue overview" },
    });
    assert.deepEqual(callRevenue.structuredContent, {
      spec: SAMPLE_SPECS.revenue,
    });

    // --- Sidecar reflects the spec-shaped resource declaration ---
    const meta = JSON.parse(await readFile(`${built.htmlPath}.meta.json`, "utf8"));
    assert.equal(meta.awaitToolResult, true);
    assert.equal(meta.mimeType, "text/html;profile=mcp-app");
    assert.equal(meta.protocolVersion, "2026-01-26");
    assert.ok(Array.isArray(meta.displayModes));

    console.log("[mcp-generative-demo] verification passed");
    console.log(`- tool: ${DEMO_TOOL} (args drive which spec is returned)`);
    console.log(`- resource: ${DEMO_URI} (${resource.mimeType})`);
    console.log(`- widget HTML: ${built.htmlPath}`);
    console.log("- json-render catalog + renderer bundled in widget: yes");
    console.log(
      `- revenue spec: ${Object.keys(SAMPLE_SPECS.revenue.elements).length} elements, root='${SAMPLE_SPECS.revenue.root}'`,
    );
    console.log(
      `- growth spec: ${Object.keys(SAMPLE_SPECS.growth.elements).length} elements, root='${SAMPLE_SPECS.growth.root}'`,
    );
  } finally {
    await cleanup();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runVerification();
}
