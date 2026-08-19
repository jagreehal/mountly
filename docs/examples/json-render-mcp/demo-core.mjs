import { mkdtemp, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DEMO_URI = "ui://json-render-example/view.html";
export const DEMO_TOOL = "render_ui";

/**
 * A spec of the shape the model produces: flat `{ root, elements }` using only
 * catalog component types. Note there is no `visible` on any element and no
 * extra wrapper — this is exactly what a first-attempt generation looks like,
 * and the tool has to accept it.
 */
export const SAMPLE_SPEC = {
  root: "root",
  elements: {
    root: { type: "Stack", props: { gap: 20 }, children: ["title", "row", "note"] },
    title: { type: "Heading", props: { text: "Revenue" }, children: [] },
    row: { type: "Row", props: { gap: 16 }, children: ["c1", "c2"] },
    c1: { type: "Card", props: { title: "This quarter" }, children: ["s1"] },
    s1: {
      type: "Stat",
      props: { label: "Revenue", value: "$48,200", delta: "+12%" },
      children: [],
    },
    c2: { type: "Card", props: { title: "Customers" }, children: ["s2"] },
    s2: { type: "Stat", props: { label: "Active", value: "1,284", delta: "+3%" }, children: [] },
    note: {
      type: "Text",
      props: { text: "Generated from the catalog.", muted: true },
      children: [],
    },
  },
};

/**
 * Bundle a TypeScript entry with esbuild. Two very different targets share
 * this helper:
 *
 * - the **iframe app** is bundled for the browser with everything inlined,
 *   because the host serves it as one self-contained HTML resource;
 * - the **catalog** is bundled for Node with its packages left external, so
 *   the server shares a single `zod` instance with `@json-render/core`.
 *   Two copies of zod would break the schema checks inside the catalog.
 */
async function bundle(entry, outfile, target) {
  const { build } = await import("esbuild");
  await build({
    entryPoints: [join(__dirname, entry)],
    outfile,
    bundle: true,
    format: "esm",
    target: "es2020",
    jsx: "automatic",
    logLevel: "error",
    ...(target === "browser"
      ? { platform: "browser", define: { "process.env.NODE_ENV": '"production"' } }
      : { platform: "node", packages: "external" }),
  });
}

/**
 * Build the MCP App: bundle the iframe UI, wrap it in a self-contained HTML
 * page, and register both against the catalog in one call.
 */
export async function createDemoServer() {
  const [{ buildAppHtml }, { createJsonRenderMcpApp }] = await Promise.all([
    import("mountly-mcp/json-render/app"),
    import("mountly-mcp/json-render/mcp"),
  ]);

  // Built inside the package, not the system tmpdir: the catalog bundle keeps
  // its imports external, so Node has to resolve them from here.
  const dir = await mkdtemp(join(__dirname, ".build-"));
  let html;
  let catalog;
  try {
    const appJs = join(dir, "app.js");
    const catalogJs = join(dir, "catalog.mjs");
    await Promise.all([
      bundle("src/app.tsx", appJs, "browser"),
      bundle("src/catalog.ts", catalogJs, "node"),
    ]);

    ({ catalog } = await import(pathToFileURL(catalogJs).href));
    html = buildAppHtml({
      title: "json-render MCP App",
      js: await readFile(appJs, "utf8"),
    });
  } catch (err) {
    await rm(dir, { recursive: true, force: true });
    throw err;
  }

  const server = createJsonRenderMcpApp({
    name: "json-render-example",
    version: "1.0.0",
    catalog,
    html,
    tool: {
      name: DEMO_TOOL,
      title: "Render UI",
      resourceUri: DEMO_URI,
    },
  });

  async function cleanup() {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }

  return { server, cleanup, html, catalog, dir };
}
