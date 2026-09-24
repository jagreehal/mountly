/**
 * A worker inside a distribution served to another origin. Browsers refuse
 * `new Worker(crossOriginUrl)`; the embed build routes it through a blob: shim.
 */
import { createServer, type Server } from "node:http";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { expect, test } from "@playwright/test";
import { build } from "vite-plus";
import { defineElementsConfig } from "../packages/mountly-vite-plugin/src/embed";

// The example's root resolves mountly-react; dedupe keeps the fixture on its React.
const root = join(process.cwd(), "docs/examples/react-embed");
// Built fresh each run, so it lives outside the tree (fixture dists are tracked).
const outDir = join(tmpdir(), "mountly-worker-embed");

const listen = (server: Server) =>
  new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      resolve(`http://127.0.0.1:${port}`);
    });
  });
const close = (server: Server) => new Promise<void>((resolve) => server.close(() => resolve()));

test("a worker in a cross-origin distribution runs, loaded from the provider", async ({ page }) => {
  test.setTimeout(60000);
  await rm(outDir, { recursive: true, force: true });
  const config = defineElementsConfig({
    prefix: "acme",
    elements: { "worker-echo": "../../../tests/fixtures/worker-embed/WorkerEcho.tsx" },
    root,
  });
  await build({
    ...config,
    configFile: false,
    logLevel: "silent",
    resolve: { dedupe: ["react", "react-dom"] },
    build: { ...config.build, outDir },
  } as unknown as Parameters<typeof build>[0]);

  const provider = createServer(async (req, res) => {
    const path = new URL(req.url!, "http://localhost").pathname;
    res.setHeader("Access-Control-Allow-Origin", "*");
    try {
      const data = await readFile(join(outDir, path));
      res.setHeader("Content-Type", extname(path) === ".css" ? "text/css" : "text/javascript");
      res.end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  const providerUrl = await listen(provider);
  const host = createServer((_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end(
      `<!doctype html><html><head><script type="module" src="${providerUrl}/embed.js"></script></head><body><acme-worker-echo></acme-worker-echo></body></html>`,
    );
  });
  const hostUrl = await listen(host);

  try {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(hostUrl);
    await expect(page.getByTestId("reply")).toHaveText(`ping pong ${providerUrl}`);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([close(provider), close(host)]);
  }
});
