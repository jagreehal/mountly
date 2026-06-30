import { expect, test } from "@playwright/test";
import { execSync, spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const REPO_ROOT = join(__dirname, "..");

const MIME: Record<string, string> = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".html": "text/html",
  ".css": "text/css",
  ".map": "application/json",
  ".ts": "text/plain",
};

// Async so the in-process static server keeps answering the build's fragment fetch
// (execSync would block the event loop and deadlock the fetch).
function runAsync(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: REPO_ROOT, env, stdio: "pipe" });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} ${args.join(" ")} failed (${code}):\n${stderr}`)),
    );
  });
}

function staticServer(rootDir: string, port: number): Promise<Server> {
  const server = createServer((req, res) => {
    // Cross-origin module loads from the host need CORS.
    res.setHeader("Access-Control-Allow-Origin", "*");
    const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    const filePath = join(rootDir, urlPath === "/" ? "/index.html" : urlPath);
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    const ext = filePath.endsWith(".d.ts") ? ".ts" : extname(filePath);
    res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
    res.end(readFileSync(filePath));
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

// Proves the federation-style `remotes: { name: url }` host option end to end:
// build a remote, serve it, build a host that declares it by URL (the host fetches the
// remote's fragment from that URL), then load the host in a browser and confirm the
// remote's module + subpath component resolve through the injected import map.
test("host loads a URL-declared remote (federation-style) in the browser", async ({ page }) => {
  test.setTimeout(120_000);
  const remotePort = 5291;
  const hostPort = 5293;

  execSync("pnpm --filter vite-host-import run build:remote", { cwd: REPO_ROOT, stdio: "pipe" });
  const remoteServer = await staticServer(
    join(REPO_ROOT, "docs/examples/vite-host-import/remote/dist"),
    remotePort,
  );

  let hostServer: Server | undefined;
  try {
    await runAsync("pnpm", ["--filter", "vite-host-remotes-url", "run", "build:host"], {
      ...process.env,
      MOUNTLY_REMOTE_URL: `http://127.0.0.1:${remotePort}/`,
    });
    hostServer = await staticServer(
      join(REPO_ROOT, "docs/examples/vite-host-remotes-url/dist"),
      hostPort,
    );

    await page.goto(`http://127.0.0.1:${hostPort}/`);

    // import("demo-widget") resolved through the import map → its exports are listed.
    await expect(page.getByTestId("feature-exports")).toContainText("Badge", { timeout: 20_000 });
    await expect(page.getByTestId("feature-exports")).toContainText("demoWidget");

    // import("demo-widget/Badge") subpath rendered the remote component.
    await expect(page.getByTestId("remote-badge")).toHaveText("remote badge", { timeout: 20_000 });
  } finally {
    hostServer?.close();
    remoteServer.close();
  }
});
