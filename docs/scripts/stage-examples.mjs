#!/usr/bin/env node
/**
 * Build and stage runnable examples into docs/public/ for GitHub Pages.
 * Rewrites absolute /packages/ and /docs/examples/ paths to /mountly/…
 */
import { execSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MIME = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".html": "text/html",
  ".css": "text/css",
  ".map": "application/json",
  ".ts": "text/plain",
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = join(SCRIPT_DIR, "..");
const REPO_ROOT = join(DOCS_ROOT, "..");
const PUBLIC_ROOT = join(DOCS_ROOT, "public");
const EXAMPLES_SRC = join(DOCS_ROOT, "examples");
const BASE = "/mountly";

const TEXT_EXTENSIONS = new Set([
  ".html",
  ".json",
  ".js",
  ".mjs",
  ".css",
  ".map",
  ".ts",
  ".tsx",
  ".svg",
]);

const PACKAGE_DISTS = [
  "mountly",
  "mountly-manifest",
  "adapters/mountly-react",
  "adapters/mountly-vue",
  "adapters/mountly-svelte",
  "adapters/mountly-mcp",
];

const WIDGET_PACKAGES = ["payment-breakdown", "image-lightbox", "signup-card"];

const STATIC_EXAMPLE_DIRS = [
  "plain-html",
  "quickstart",
  "marketing-site",
  "shadcn-drop-in",
  "multi-vertical-host",
  "multi-widget-bundle",
  "monorepo-component-library",
];

const PAYMENT_FIXTURES = {
  pay_123: {
    total: 149.99,
    currency: "USD",
    items: [
      { description: "Pro Plan (Monthly)", amount: 129.99, currency: "USD" },
      { description: "Additional Storage (10GB)", amount: 20.0, currency: "USD" },
    ],
    tax: 12.5,
    discount: 12.5,
  },
  pay_456: {
    total: 49.0,
    currency: "EUR",
    items: [{ description: "Starter Plan", amount: 49.0, currency: "EUR" }],
  },
};

function log(msg) {
  console.log(`[stage-examples] ${msg}`);
}

function run(cmd, env = {}) {
  log(`$ ${cmd}`);
  execSync(cmd, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}

function copyDir(src, dest) {
  if (!existsSync(src)) {
    log(`skip missing: ${src}`);
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true, force: true });
}

function rewriteContent(text) {
  return text
    .replaceAll('"/packages/', `"${BASE}/packages/`)
    .replaceAll("'/packages/", `'${BASE}/packages/`)
    .replaceAll('"/docs/examples/', `"${BASE}/examples/`)
    .replaceAll("'/docs/examples/", `'${BASE}/examples/`)
    .replaceAll('"/examples/', `"${BASE}/examples/`)
    .replaceAll("'/examples/", `'${BASE}/examples/`)
    .replaceAll('"/api/payments', `"${BASE}/api/payments`)
    .replaceAll("'/api/payments", `'${BASE}/api/payments`);
}

function rewriteTree(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      rewriteTree(full);
      continue;
    }
    const ext = extname(entry.name);
    if (!TEXT_EXTENSIONS.has(ext) && ext !== "") continue;
    const original = readFileSync(full, "utf8");
    const rewritten = rewriteContent(original);
    if (rewritten !== original) {
      writeFileSync(full, rewritten);
    }
  }
}

function cleanPublic() {
  for (const dir of ["packages", "examples", "api"]) {
    rmSync(join(PUBLIC_ROOT, dir), { recursive: true, force: true });
  }
}

function stagePackageDists() {
  for (const pkg of PACKAGE_DISTS) {
    const src = join(REPO_ROOT, "packages", pkg, "dist");
    const dest = join(PUBLIC_ROOT, "packages", pkg, "dist");
    copyDir(src, dest);
  }
}

function stageWidgetDists() {
  for (const name of WIDGET_PACKAGES) {
    const src = join(EXAMPLES_SRC, name, "dist");
    const dest = join(PUBLIC_ROOT, "examples", name, "dist");
    copyDir(src, dest);
  }
}

function stageStaticExamples() {
  for (const name of STATIC_EXAMPLE_DIRS) {
    const src = join(EXAMPLES_SRC, name);
    const dest = join(PUBLIC_ROOT, "examples", name);
    copyDir(src, dest);
    // Drop package.json / README from staged output to keep public lean
    for (const drop of ["package.json", "README.md", "node_modules"]) {
      rmSync(join(dest, drop), { recursive: true, force: true });
    }
  }
}

function stageViteDist(name) {
  const src = join(EXAMPLES_SRC, name, "dist");
  const dest = join(PUBLIC_ROOT, "examples", name);
  copyDir(src, dest);
}

function stageRemoteDist() {
  const src = join(EXAMPLES_SRC, "vite-host-import", "remote", "dist");
  const dest = join(PUBLIC_ROOT, "examples", "vite-host-import", "remote", "dist");
  copyDir(src, dest);
}

function emitPaymentFixtures() {
  const dir = join(PUBLIC_ROOT, "api", "payments");
  mkdirSync(dir, { recursive: true });
  for (const [id, body] of Object.entries(PAYMENT_FIXTURES)) {
    writeFileSync(join(dir, id), JSON.stringify(body));
  }
}

function buildMcpPreviews() {
  run("pnpm --filter mcp-app-demo exec node ./preview.mjs", { STAGE_ONLY: "1" });
  copyDir(
    join(EXAMPLES_SRC, "mcp-app-demo", "preview"),
    join(PUBLIC_ROOT, "examples", "mcp-app-demo", "preview"),
  );

  run("pnpm --filter mcp-generative-demo exec node ./stream-build.mjs");
  copyDir(
    join(EXAMPLES_SRC, "mcp-generative-demo", "preview", "stream-dist"),
    join(PUBLIC_ROOT, "examples", "mcp-generative-demo", "preview", "stream-dist"),
  );
}

function runAsync(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} failed (${code})`)),
    );
  });
}

function staticServer(rootDir, port) {
  const server = createServer((req, res) => {
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

async function buildViteExamples() {
  const stagingEnv = {
    MOUNTLY_API_URL: `${BASE}/api/payments`,
    NODE_ENV: "production",
  };

  run("pnpm --filter mountly-demo exec vite build --base /mountly/examples/demo/", stagingEnv);
  stageViteDist("demo");

  run(
    "pnpm --filter cross-framework-bus exec vite build --base /mountly/examples/cross-framework-bus/",
    stagingEnv,
  );
  stageViteDist("cross-framework-bus");

  run(
    "pnpm --filter pokemon-kitchen-sink exec vite build --base /mountly/examples/pokemon-kitchen-sink/",
    stagingEnv,
  );
  stageViteDist("pokemon-kitchen-sink");

  run(
    "pnpm --filter vite-host-import exec vite build --config remote/vite.config.ts --base /mountly/examples/vite-host-import/remote/dist/",
    stagingEnv,
  );
  stageRemoteDist();

  run(
    "pnpm --filter vite-host-import exec vite build --base /mountly/examples/vite-host-import/",
    stagingEnv,
  );
  stageViteDist("vite-host-import");

  const remoteRoot = join(EXAMPLES_SRC, "vite-host-import", "remote", "dist");
  const remotePort = 5291;
  const remoteServer = await staticServer(remoteRoot, remotePort);
  try {
    await runAsync(
      "pnpm",
      [
        "--filter",
        "vite-host-remotes-url",
        "exec",
        "vite",
        "build",
        "--base",
        "/mountly/examples/vite-host-remotes-url/",
      ],
      {
        ...stagingEnv,
        MOUNTLY_REMOTE_URL: `http://127.0.0.1:${remotePort}/`,
      },
    );
  } finally {
    remoteServer.close();
  }
  stageViteDist("vite-host-remotes-url");
}

async function main() {
  log("building workspace packages and widget dists");
  run("pnpm --filter '!mountly-docs' build");

  cleanPublic();
  mkdirSync(PUBLIC_ROOT, { recursive: true });

  stagePackageDists();
  stageWidgetDists();
  stageStaticExamples();
  await buildViteExamples();
  buildMcpPreviews();
  emitPaymentFixtures();

  log("rewriting paths for GitHub Pages base");
  rewriteTree(join(PUBLIC_ROOT, "packages"));
  rewriteTree(join(PUBLIC_ROOT, "examples"));
  rewriteTree(join(PUBLIC_ROOT, "api"));

  log("done — staged to docs/public/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
