import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { EXTENSION_ID, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { createReleaseServer, DECISION_TOOL, RESOURCE_URI, REVIEW_TOOL } from "./server.mjs";

const server = await createReleaseServer();
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const client = new Client(
  { name: "release-readiness-verifier", version: "0.0.1" },
  {
    capabilities: {
      extensions: { [EXTENSION_ID]: { mimeTypes: [RESOURCE_MIME_TYPE] } },
    },
  },
);

try {
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const tools = await client.listTools();
  const review = tools.tools.find((tool) => tool.name === REVIEW_TOOL);
  const decision = tools.tools.find((tool) => tool.name === DECISION_TOOL);
  if (review?._meta?.ui?.resourceUri !== RESOURCE_URI) throw new Error("review tool has no UI");
  if (JSON.stringify(decision?._meta?.ui?.visibility) !== JSON.stringify(["app"])) {
    throw new Error("decision tool is not app-only");
  }

  const resources = await client.listResources();
  if (!resources.resources.some((resource) => resource.uri === RESOURCE_URI)) {
    throw new Error("UI resource was not listed");
  }

  const resource = await client.readResource({ uri: RESOURCE_URI });
  const html = resource.contents[0];
  if (
    html.mimeType !== RESOURCE_MIME_TYPE ||
    !("text" in html) ||
    !html.text.includes("release-docket")
  ) {
    throw new Error("built UI resource is incomplete");
  }

  const result = await client.callTool({
    name: REVIEW_TOOL,
    arguments: { service: "checkout-api", environment: "production" },
  });
  if (result.structuredContent?.recommendation !== "hold") {
    throw new Error("release tool returned the wrong recommendation");
  }

  const decisionResult = await client.callTool({
    name: DECISION_TOOL,
    arguments: { releaseId: result.structuredContent.releaseId, decision: "hold" },
  });
  if (decisionResult.structuredContent?.recorded !== true) {
    throw new Error("app-only decision was not recorded");
  }

  console.log("[mcp-release-readiness] verification passed");
  console.log(`- tool: ${REVIEW_TOOL}`);
  console.log(`- app-only action: ${DECISION_TOOL}`);
  console.log(`- resource: ${RESOURCE_URI} (${RESOURCE_MIME_TYPE})`);
  console.log(`- recommendation: ${result.structuredContent.recommendation}`);
} finally {
  await client.close();
  await server.close();
}
