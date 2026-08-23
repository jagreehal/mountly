import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DEMO_URI = "ui://mountly-demo/payment-breakdown";
export const DEMO_APP_ONLY_URI = "ui://mountly-demo/payment-breakdown-admin";
export const DEMO_TOOL = "quote_payment";
export const DEMO_APP_ONLY_TOOL = "refresh_payment_view";

/**
 * Sample tool responses. The MCP server returns one of these as
 * `structuredContent`; the bridge spreads it into the View's props so the
 * React component renders. Two `plan` values exercise both first-mount and
 * the bridge's update() path on a second call.
 */
export const SAMPLE_PAYMENTS = {
  annual: {
    total: 99,
    currency: "USD",
    items: [
      { description: "Annual subscription", amount: 89, currency: "USD" },
      { description: "Setup fee", amount: 10, currency: "USD" },
    ],
    reference: "pay_demo_annual",
  },
  monthly: {
    total: 12,
    currency: "USD",
    items: [
      { description: "Monthly subscription", amount: 9, currency: "USD" },
      { description: "Processing fee", amount: 3, currency: "USD" },
    ],
    reference: "pay_demo_monthly",
  },
};

async function loadBuild() {
  return await import("mountly-mcp/build");
}

async function loadCreateMcpAppServer() {
  return (await import("mountly-mcp/server")).createMcpAppServer;
}

/**
 * Bundles src/view.tsx into a self-contained IIFE. `createMcpView` publishes
 * the View for the bridge. We bundle via esbuild so the demo exercises the same
 * code path a host author would.
 */
async function bundleView(outFile) {
  const { build } = await import("esbuild");
  await build({
    entryPoints: [join(__dirname, "src/view.tsx")],
    outfile: outFile,
    bundle: true,
    format: "iife",
    target: "es2020",
    platform: "browser",
    jsx: "automatic",
    loader: { ".css": "text" },
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "error",
  });
}

export async function createDemoServer() {
  const { buildMcpResource, getBridgeRuntimePath } = await loadBuild();
  const createMcpAppServer = await loadCreateMcpAppServer();

  const dir = await mkdtemp(join(tmpdir(), "mountly-mcp-app-demo-"));
  let built;
  let builtAppOnly;
  try {
    const viewEntry = join(dir, "view.js");
    const htmlOut = join(dir, "payment-breakdown.html");
    const htmlOutAppOnly = join(dir, "payment-breakdown-admin.html");

    await bundleView(viewEntry);

    built = await buildMcpResource({
      entry: viewEntry,
      uri: DEMO_URI,
      name: "payment_breakdown_view",
      output: htmlOut,
      bridgeRuntimePath: getBridgeRuntimePath(),
      awaitToolResult: true,
      // Declared for real, not left empty: this is the only place the whole
      // metadata path is exercised — build → sidecar → server → host → the CSP
      // the sandbox proxy actually enforces on the view.
      displayModes: ["inline", "fullscreen"],
      prefersBorder: true,
      csp: { connectDomains: ["https://api.example.com"] },
    });
    builtAppOnly = await buildMcpResource({
      entry: viewEntry,
      uri: DEMO_APP_ONLY_URI,
      name: "payment_breakdown_view_admin",
      output: htmlOutAppOnly,
      bridgeRuntimePath: getBridgeRuntimePath(),
      awaitToolResult: true,
    });
  } catch (err) {
    // Setup failed — clean up the tmpdir before propagating so we don't
    // leak directories on crash. Successful runs clean up via the returned
    // `cleanup()` instead.
    await rm(dir, { recursive: true, force: true });
    throw err;
  }

  const server = createMcpAppServer({
    name: "mountly-mcp-demo",
    version: "0.0.1",
    // Views and tools are declared independently and linked by resource URI,
    // so a View can back several tools without being registered twice.
    views: [
      { uri: DEMO_URI, artifact: built.htmlPath },
      { uri: DEMO_APP_ONLY_URI, artifact: builtAppOnly.htmlPath },
    ],
    tools: [
      {
        name: DEMO_TOOL,
        resourceUri: DEMO_URI,
        config: {
          description: "Quote a payment breakdown (annual or monthly) for the demo View",
          // Zod raw shape — required by @modelcontextprotocol/sdk's McpServer.
          inputSchema: {
            plan: z.enum(["annual", "monthly"]),
          },
        },
        handler: async ({ plan }) => ({
          structuredContent: SAMPLE_PAYMENTS[plan] ?? SAMPLE_PAYMENTS.annual,
        }),
      },
      {
        name: DEMO_APP_ONLY_TOOL,
        resourceUri: DEMO_APP_ONLY_URI,
        config: {
          description: "App-only refresh signal for the payment View",
          inputSchema: {
            plan: z.enum(["annual", "monthly"]).optional(),
          },
        },
        visibility: ["app"],
        handler: async ({ plan }) => ({
          structuredContent: SAMPLE_PAYMENTS[plan] ?? SAMPLE_PAYMENTS.annual,
        }),
      },
    ],
  });

  async function cleanup() {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }

  return { server, cleanup, built, viewDir: dir };
}
