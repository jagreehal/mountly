import assert from "node:assert/strict";
import { DEMO_TOOL, DEMO_URI, SAMPLE_SPEC, createDemoServer } from "./demo-core.mjs";

export async function runVerification() {
  const { server, cleanup } = await createDemoServer();

  try {
    const { client } = await server.connectInProcess();

    // --- The tool carries the catalog, not an empty schema ------------------
    const tools = await client.listTools();
    const tool = tools.tools.find((t) => t.name === DEMO_TOOL);
    assert.ok(tool, "expected the render tool to be registered");
    assert.equal(tool._meta?.ui?.resourceUri, DEMO_URI);

    const schemaJson = JSON.stringify(tool.inputSchema);
    assert.ok(
      tool.inputSchema?.required?.includes("spec"),
      "tool should take a single `spec` argument, matching @json-render/mcp",
    );
    for (const component of ["Stack", "Row", "Card", "Heading", "Text", "Stat"]) {
      assert.ok(
        schemaJson.includes(component),
        `input schema should name the ${component} component`,
      );
    }
    assert.ok(
      tool.description?.includes("AVAILABLE COMPONENTS"),
      "tool description should carry catalog.prompt() so the model knows the vocabulary",
    );

    // --- The ui:// resource serves the bundled iframe app -------------------
    const resources = await client.listResources();
    const resource = resources.resources.find((r) => r.uri === DEMO_URI);
    assert.ok(resource, "expected the ui:// resource to be listed");
    assert.equal(resource.mimeType, "text/html;profile=mcp-app");

    const read = await client.readResource({ uri: DEMO_URI });
    const content = read.contents[0];
    assert.equal(content?.mimeType, "text/html;profile=mcp-app");
    assert.ok(content?.text?.includes('<div id="root">'), "expected the mount node in the HTML");
    assert.ok(
      content?.text?.includes("ui/notifications/tool-result"),
      "expected the MCP Apps handshake in the bundled app (proves useJsonRenderApp is wired)",
    );

    // --- Calling the tool ---------------------------------------------------
    const result = await client.callTool({ name: DEMO_TOOL, arguments: { spec: SAMPLE_SPEC } });
    assert.ok(!result.isError, `tool call failed: ${JSON.stringify(result.content)}`);

    // Both wire formats, so an iframe written against either @json-render/mcp
    // or mountly-mcp renders this server unchanged.
    assert.deepEqual(result.structuredContent?.spec, SAMPLE_SPEC);
    assert.deepEqual(JSON.parse(result.content[0].text), SAMPLE_SPEC);

    // A spec using a component the catalog never declared is still returned
    // rather than dropped — the renderer skips what it cannot resolve, and a
    // partial UI beats a blank iframe.
    const unknownComponent = {
      root: "root",
      elements: { root: { type: "NotInCatalog", props: {}, children: [] } },
    };
    const lenient = await client.callTool({
      name: DEMO_TOOL,
      arguments: { spec: unknownComponent },
    });
    assert.ok(!lenient.isError, "an unknown component should not fail the whole call");

    console.log("[json-render-mcp] verification passed");
    console.log(`- tool: ${DEMO_TOOL} (input schema generated from the catalog)`);
    console.log(`- resource: ${DEMO_URI} (${resource.mimeType})`);
    console.log(`- description: ${tool.description.length} chars of catalog.prompt()`);
    console.log(`- spec returned as content[0].text and structuredContent.spec`);
    console.log(`- sample spec: ${Object.keys(SAMPLE_SPEC.elements).length} elements`);
  } finally {
    await cleanup();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runVerification();
}
