import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DEMO_URI = "ui://mountly-demo/payment-breakdown";
export const DEMO_APP_ONLY_URI = "ui://mountly-demo/payment-breakdown-admin";
export const DEMO_TOOL = "quote_payment";
export const DEMO_APP_ONLY_TOOL = "refresh_payment_widget";

/**
 * Sample tool responses. The MCP server returns one of these as
 * `structuredContent`; the bridge spreads it into the widget's props so the
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
  return (await import("mountly-mcp-server")).createMcpAppServer;
}

/**
 * Bundles src/widget.tsx into a self-contained IIFE that sets
 * `globalThis.__mountlyMcpWidget__` to a real createMcpWidget-wrapped React
 * component. We bundle via esbuild so the demo exercises the same code path
 * a host author would, rather than hand-rolling a global.
 */
async function bundleWidget(outFile) {
  const { build } = await import("esbuild");
  await build({
    entryPoints: [join(__dirname, "src/widget.tsx")],
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
    const widgetEntry = join(dir, "widget.js");
    const htmlOut = join(dir, "payment-breakdown.html");
    const htmlOutAppOnly = join(dir, "payment-breakdown-admin.html");

    await bundleWidget(widgetEntry);

    built = await buildMcpResource({
      entry: widgetEntry,
      uri: DEMO_URI,
      name: "payment_breakdown_widget",
      output: htmlOut,
      bridgeRuntimePath: getBridgeRuntimePath(),
      awaitToolResult: true,
    });
    builtAppOnly = await buildMcpResource({
      entry: widgetEntry,
      uri: DEMO_APP_ONLY_URI,
      name: "payment_breakdown_widget_admin",
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
    widgets: [
      {
        uri: DEMO_URI,
        htmlPath: built.htmlPath,
        tool: {
          name: DEMO_TOOL,
          description:
            "Quote a payment breakdown (annual or monthly) for the demo widget",
          // Zod raw shape — required by @modelcontextprotocol/sdk's McpServer.
          inputSchema: {
            plan: z.enum(["annual", "monthly"]),
          },
          handler: async ({ plan }) => ({
            structuredContent:
              SAMPLE_PAYMENTS[plan] ?? SAMPLE_PAYMENTS.annual,
          }),
        },
      },
      {
        uri: DEMO_APP_ONLY_URI,
        htmlPath: builtAppOnly.htmlPath,
        tool: {
          name: DEMO_APP_ONLY_TOOL,
          description: "App-only refresh signal for the payment widget",
          inputSchema: {
            plan: z.enum(["annual", "monthly"]).optional(),
          },
          visibility: ["app"],
          handler: async ({ plan }) => ({
            structuredContent:
              SAMPLE_PAYMENTS[plan] ?? SAMPLE_PAYMENTS.annual,
          }),
        },
      },
    ],
  });

  async function cleanup() {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }

  return { server, cleanup, built, widgetDir: dir };
}
