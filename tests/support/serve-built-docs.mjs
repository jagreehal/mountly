/**
 * Serves the built docs (`docs/dist`) under the same `/mountly` base path that
 * GitHub Pages uses.
 *
 * The dev servers in playwright.config.ts all serve from the origin root, where
 * BASE_URL is "/" — which is exactly why a whole class of base-path bugs
 * (import maps, example links) reached production unnoticed. This one reproduces
 * the deployed shape so hosted-examples.spec.ts can catch them.
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = fileURLToPath(new URL("../../docs/dist/", import.meta.url));
const BASE = "/mountly";
const PORT = Number(process.env.PORT ?? 5196);

const MIME = {
  ".css": "text/css",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".json": "application/json",
  ".map": "application/json",
  ".mjs": "text/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ts": "text/typescript",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
};

createServer((req, res) => {
  const raw = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
  const path = raw.startsWith(BASE) ? raw.slice(BASE.length) || "/" : raw;

  // normalize() collapses any ../ before it can escape docs/dist.
  let file = join(DIST, normalize(path));
  if (!file.startsWith(DIST)) {
    res.statusCode = 403;
    res.end("forbidden");
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");

  if (!existsSync(file) || !statSync(file).isFile()) {
    res.statusCode = 404;
    res.end("not found");
    return;
  }

  res.setHeader("Content-Type", MIME[extname(file)] ?? "application/octet-stream");
  res.end(readFileSync(file));
}).listen(PORT, "127.0.0.1", () => {
  console.log(`built docs on http://127.0.0.1:${PORT}${BASE}/`);
});
