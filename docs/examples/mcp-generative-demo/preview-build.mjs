import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, "preview/dist");

/**
 * Build a static, dependency-free preview (index.html + app.js) of the
 * generative render path. Run in the sandbox (esbuild), then serve the static
 * output anywhere (e.g. `python3 -m http.server`).
 *
 * Renders a REAL Gemini-generated spec (fixtures/gemini-generated-spec.json):
 * its Metric values are `$state` bindings resolved from the spec's `state`
 * block, and its Button is bound on `on.press` → the `ask` action. This is the
 * full prompt→spec→render→action loop, end to end, with model output.
 */
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await build({
  entryPoints: [join(__dirname, "preview/entry.tsx")],
  outfile: join(dist, "app.js"),
  bundle: true,
  format: "iife",
  target: "es2020",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "error",
});

const styles = await readFile(join(__dirname, "src/styles.css"), "utf8");
const spec = JSON.parse(
  await readFile(join(__dirname, "fixtures/gemini-generated-spec.json"), "utf8"),
);
const state = spec.state ?? {};

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>mcp-generative-demo preview</title>
<style>
${styles}
body { font-family: system-ui, sans-serif; margin: 24px; background: #f8fafc; color: #0f172a; }
h1 { font-size: 15px; font-weight: 600; margin: 0 0 16px; }
#app { max-width: 420px; }
.jr-button { margin-top: 4px; padding: 8px 14px; border: 1px solid #2563eb; border-radius: 8px; background: #2563eb; color: #fff; font: 600 13px system-ui; cursor: pointer; }
#log { margin-top: 16px; padding: 8px 12px; border-radius: 8px; background: #0f172a; color: #a5f3fc; font: 13px/1.4 ui-monospace, monospace; }
</style>
</head>
<body>
<h1>REAL Gemini-generated spec → native render (values resolved from $state)</h1>
<div id="app"></div>
<div id="log" data-fired="false">no action yet — click the button</div>
<script>window.__SPEC__ = ${JSON.stringify(spec)}; window.__STATE__ = ${JSON.stringify(state)};</script>
<script src="./app.js"></script>
</body>
</html>`;

await writeFile(join(dist, "index.html"), html);
console.log("preview built:", join(dist, "index.html"));
