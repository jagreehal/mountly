import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, "preview/stream-dist");

/**
 * Build the streaming + self-driving hero demo. Two illustrative specs (shaped
 * exactly like model output — the real model path is proven in verify/tests);
 * the preview replays each as a json-render patch stream and self-navigates
 * between them on button click.
 */
const OVERVIEW = {
  root: "root",
  elements: {
    root: {
      type: "Stack",
      props: { gap: 22 },
      children: ["h", "kpis", "quarter", "div", "badges", "foot"],
    },
    h: { type: "Heading", props: { text: "Revenue overview" }, children: [] },
    kpis: { type: "Row", props: { gap: 16 }, children: ["c1", "c2", "c3"] },
    c1: { type: "Card", props: {}, children: ["s1", "sp1"] },
    s1: {
      type: "Stat",
      props: { label: "MRR", value: "$48.2k", trend: "up", delta: "+12.4%" },
      children: [],
    },
    sp1: {
      type: "Sparkline",
      props: { points: [38, 40, 39, 43, 45, 47, 48.2], tone: "accent" },
      children: [],
    },
    c2: { type: "Card", props: {}, children: ["s2", "sp2"] },
    s2: {
      type: "Stat",
      props: { label: "Active customers", value: "1,284", trend: "up", delta: "+3.1%" },
      children: [],
    },
    sp2: {
      type: "Sparkline",
      props: { points: [1180, 1205, 1220, 1240, 1262, 1275, 1284], tone: "positive" },
      children: [],
    },
    c3: { type: "Card", props: {}, children: ["s3", "sp3"] },
    s3: {
      type: "Stat",
      props: { label: "Gross margin", value: "75%", trend: "up", delta: "+1.2pt" },
      children: [],
    },
    sp3: {
      type: "Sparkline",
      props: { points: [71, 72, 72, 73, 74, 74, 75], tone: "accent" },
      children: [],
    },
    quarter: { type: "Card", props: { title: "This quarter", accent: true }, children: ["qrow"] },
    qrow: { type: "Row", props: { gap: 24 }, children: ["qcard", "qbtn"] },
    qcard: { type: "Card", props: {}, children: ["qstat", "qspark"] },
    qstat: {
      type: "Stat",
      props: { label: "Q3 bookings", value: "$612k", trend: "up", delta: "+18%" },
      children: [],
    },
    qspark: {
      type: "Sparkline",
      props: { points: [180, 210, 240, 280, 330, 410, 612], tone: "accent" },
      children: [],
    },
    qbtn: {
      type: "Button",
      props: { label: "Break down Q3 by region  →", variant: "primary" },
      children: [],
      on: {
        press: { action: "ask", params: { prompt: "Show me the Q3 revenue breakdown by region" } },
      },
    },
    div: { type: "Divider", props: {}, children: [] },
    badges: { type: "Row", props: { gap: 8 }, children: ["b1", "b2", "b3"] },
    b1: { type: "Badge", props: { text: "Live", tone: "positive" }, children: [] },
    b2: { type: "Badge", props: { text: "SOC 2 Type II", tone: "neutral" }, children: [] },
    b3: { type: "Badge", props: { text: "99.98% uptime", tone: "positive" }, children: [] },
    foot: {
      type: "Text",
      props: {
        text: "Streamed live from one prompt — every card you see was generated, not hand-coded.",
        muted: true,
      },
      children: [],
    },
  },
};

const Q3 = {
  root: "root",
  elements: {
    root: { type: "Stack", props: { gap: 22 }, children: ["h", "regions", "deal", "nav"] },
    h: { type: "Heading", props: { text: "Q3 revenue by region" }, children: [] },
    regions: { type: "Row", props: { gap: 16 }, children: ["na", "emea", "apac"] },
    na: { type: "Card", props: {}, children: ["nast", "nasp", "nabg"] },
    nast: {
      type: "Stat",
      props: { label: "North America", value: "$284k", trend: "up", delta: "+22%" },
      children: [],
    },
    nasp: {
      type: "Sparkline",
      props: { points: [120, 150, 170, 190, 230, 260, 284], tone: "positive" },
      children: [],
    },
    nabg: { type: "Badge", props: { text: "Top region", tone: "positive" }, children: [] },
    emea: { type: "Card", props: {}, children: ["emst", "emsp"] },
    emst: {
      type: "Stat",
      props: { label: "EMEA", value: "$201k", trend: "up", delta: "+14%" },
      children: [],
    },
    emsp: {
      type: "Sparkline",
      props: { points: [130, 140, 155, 165, 180, 192, 201], tone: "accent" },
      children: [],
    },
    apac: { type: "Card", props: {}, children: ["apst", "apsp", "apbg"] },
    apst: {
      type: "Stat",
      props: { label: "APAC", value: "$127k", trend: "up", delta: "+31%" },
      children: [],
    },
    apsp: {
      type: "Sparkline",
      props: { points: [60, 72, 80, 95, 108, 118, 127], tone: "positive" },
      children: [],
    },
    apbg: { type: "Badge", props: { text: "Fastest growing", tone: "warning" }, children: [] },
    deal: {
      type: "Card",
      props: { title: "Largest expansion", accent: true },
      children: ["dealt", "dealbg"],
    },
    dealt: {
      type: "Text",
      props: { text: "Northwind Trading — $84k expansion, closed by the EMEA team." },
      children: [],
    },
    dealbg: { type: "Badge", props: { text: "Closed won", tone: "positive" }, children: [] },
    nav: { type: "Row", props: { gap: 12 }, children: ["back", "next"] },
    back: {
      type: "Button",
      props: { label: "←  Overview", variant: "ghost" },
      children: [],
      on: { press: { action: "ask", params: { prompt: "Show the revenue overview" } } },
    },
    next: {
      type: "Button",
      props: { label: "Forecast Q4  →", variant: "primary" },
      children: [],
      on: {
        press: { action: "ask", params: { prompt: "Show the Q3 revenue breakdown by region" } },
      },
    },
  },
};

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await build({
  entryPoints: [join(__dirname, "preview/stream-entry.tsx")],
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
const safe = (v) => JSON.stringify(v).replace(/</g, "\\u003c");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Generative UI — streaming + self-driving</title>
<style>
${styles}
html, body { margin: 0; background: oklch(0.13 0.012 256); }
.wrap { max-width: 880px; margin: 0 auto; padding: 40px 24px; }
.tag { font-family: var(--mono); font-size: 12px; color: var(--faint); letter-spacing: 0.04em; margin: 0 0 14px; }
.tag b { color: var(--accent); font-weight: 500; }
#app { min-height: 460px; }
</style></head>
<body>
<div class="wrap">
  <p class="tag">json-render spec · streamed via <b>createSpecStreamCompiler</b> · the UI builds itself, then navigates itself</p>
  <div id="app"></div>
</div>
<script>window.__SPECS__ = { overview: ${safe(OVERVIEW)}, q3: ${safe(Q3)} }; window.__FIRST__ = "overview";</script>
<script src="./app.js"></script>
</body></html>`;

await writeFile(join(dist, "index.html"), html);
console.log("stream demo built:", join(dist, "index.html"));
