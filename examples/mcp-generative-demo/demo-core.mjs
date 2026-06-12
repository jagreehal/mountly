import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DEMO_URI = "ui://mountly-demo/generative-dashboard";
export const DEMO_TOOL = "render_dashboard";

/**
 * Pre-authored json-render specs — the "AI output" the agent would generate.
 * Each is a flat `{ root, elements }` tree using ONLY catalog types
 * (Column / Card / Metric) from `src/catalog.ts`. The MCP server returns one
 * as `structuredContent.spec`; the bridge forwards it to the widget, which
 * renders it natively. Two views exercise both first-mount and the bridge's
 * `update()` path on a second call.
 */
export const SAMPLE_SPECS = {
  revenue: {
    root: "root",
    elements: {
      root: { type: "Stack", props: { gap: 20 }, children: ["h", "row", "btn"] },
      h: { type: "Heading", props: { text: "Revenue dashboard" }, children: [] },
      row: { type: "Row", props: { gap: 16 }, children: ["c1", "c2", "c3"] },
      c1: { type: "Card", props: {}, children: ["s1"] },
      s1: { type: "Stat", props: { label: "Total revenue", value: "$48,200", trend: "up", delta: "+12%" }, children: [] },
      c2: { type: "Card", props: {}, children: ["s2"] },
      s2: { type: "Stat", props: { label: "Active customers", value: "1,284", trend: "up", delta: "+3%" }, children: [] },
      c3: { type: "Card", props: {}, children: ["s3"] },
      s3: { type: "Stat", props: { label: "Gross margin", value: "75%", trend: "up", delta: "+1pt" }, children: [] },
      // The agent loop: pressing this sends a follow-up turn to the model.
      btn: {
        type: "Button",
        props: { label: "Ask for Q3 breakdown", variant: "primary" },
        children: [],
        on: {
          press: {
            action: "ask",
            params: { prompt: "Show me the Q3 revenue breakdown." },
          },
        },
      },
    },
  },
  growth: {
    root: "root",
    elements: {
      root: { type: "Stack", props: { gap: 20 }, children: ["h", "row"] },
      h: { type: "Heading", props: { text: "Growth dashboard" }, children: [] },
      row: { type: "Row", props: { gap: 16 }, children: ["c1", "c2"] },
      c1: { type: "Card", props: {}, children: ["s1"] },
      s1: { type: "Stat", props: { label: "New signups", value: "342", trend: "up", delta: "+8%" }, children: [] },
      c2: { type: "Card", props: {}, children: ["s2"] },
      s2: { type: "Stat", props: { label: "Churn", value: "2.1%", trend: "down", delta: "-0.4%" }, children: [] },
    },
  },
};

/**
 * Resolve a spec for a prompt. With `MOUNTLY_LLM=1`, a local Granite model
 * authors it (json-render pipeline in `src/generate.mjs`); otherwise — and on
 * any model failure — fall back to a deterministic sample by keyword. The
 * fallback keeps `verify`/`test` hermetic (no Ollama needed in CI).
 */
export async function resolveSpec(prompt) {
  if (process.env.MOUNTLY_LLM === "1") {
    try {
      const { createSpec } = await import("./src/generate.mjs");
      const { spec } = await createSpec(prompt ?? "").then((ui) => ui.result);
      return spec;
    } catch (err) {
      console.error(
        `[mcp-generative-demo] LLM generation failed, using sample: ${err?.message ?? err}`,
      );
    }
  }
  const p = (prompt ?? "").toLowerCase();
  return p.includes("growth") || p.includes("signup") || p.includes("churn")
    ? SAMPLE_SPECS.growth
    : SAMPLE_SPECS.revenue;
}

async function loadBuild() {
  return await import("mountly-mcp/build");
}

async function loadCreateMcpAppServer() {
  return (await import("mountly-mcp-server")).createMcpAppServer;
}

/**
 * Bundles src/widget.tsx into a self-contained IIFE that sets
 * `globalThis.__mountlyMcpWidget__` to a real createMcpWidget-wrapped React
 * component. esbuild bundles json-render + the catalog/registry, so the demo
 * exercises the same code path a host author would.
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

  const dir = await mkdtemp(join(tmpdir(), "mountly-mcp-generative-demo-"));
  let built;
  try {
    const widgetEntry = join(dir, "widget.js");
    const htmlOut = join(dir, "generative-dashboard.html");

    await bundleWidget(widgetEntry);

    built = await buildMcpResource({
      entry: widgetEntry,
      uri: DEMO_URI,
      name: "generative_dashboard_widget",
      output: htmlOut,
      bridgeRuntimePath: getBridgeRuntimePath(),
      awaitToolResult: true,
    });
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    throw err;
  }

  const server = createMcpAppServer({
    name: "mountly-mcp-generative-demo",
    version: "0.0.1",
    widgets: [
      {
        uri: DEMO_URI,
        htmlPath: built.htmlPath,
        tool: {
          name: DEMO_TOOL,
          description:
            "Render a dashboard UI for a natural-language request. Returns a " +
            "json-render spec the widget renders as native components; buttons " +
            "in it can send follow-up turns back to you via the MCP host.",
          // Zod raw shape — required by @modelcontextprotocol/sdk's McpServer.
          inputSchema: {
            prompt: z.string(),
          },
          handler: async ({ prompt }) => ({
            structuredContent: { spec: await resolveSpec(prompt) },
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
