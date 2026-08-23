import { expect, test } from "@playwright/test";
import { story } from "executable-stories-playwright";
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..");
const CLI = join(REPO_ROOT, "packages", "mcp-apps", "dist", "cli.js");

// `link:` symlinks this checkout; `file:` packs it and then resolves its *own*
// deps from the registry. On a release PR changesets has already bumped those
// to versions that publish after CI, so `file:` failed with
// ERR_PNPM_NO_MATCHING_VERSION — green only once the release it gates is out.
const LOCAL_MCP = `link:${join(REPO_ROOT, "packages", "mcp-apps")}`;

function run(command: string, cwd: string): string {
  try {
    return execSync(command, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CI: "1" },
    });
  } catch (error) {
    const { stdout, stderr } = error as { stdout?: string; stderr?: string };
    const detail = [stdout, stderr].filter(Boolean).join("\n").trim();
    throw new Error(`Command failed in ${cwd}:\n  ${command}\n${detail}`);
  }
}

test.beforeEach(({ page }, testInfo) => {
  void page;
  story.init(testInfo);
});

test("mountly-mcp create scaffolds react app that builds and verifies", () => {
  story.given("mountly-mcp is built");
  expect(existsSync(CLI)).toBe(true);

  story.and("a temporary directory is created");
  const root = mkdtempSync(join(tmpdir(), "mountly-mcp-create-"));
  const appDir = join(root, "demo-app");

  try {
    story.when("mountly-mcp create runs for react");
    const out = run(
      `node ${JSON.stringify(CLI)} create demo-app --framework react --dir ${JSON.stringify(appDir)}`,
      root,
    );
    expect(out).toContain("Created MCP App demo-app");
    expect(existsSync(join(appDir, "package.json"))).toBe(true);
    expect(existsSync(join(appDir, "src/view.tsx"))).toBe(true);
    expect(existsSync(join(appDir, "server.mjs"))).toBe(true);
    expect(existsSync(join(appDir, "vite.config.ts"))).toBe(true);
    expect(existsSync(join(appDir, "src/view.tsx.tmpl"))).toBe(false);

    story.and("package.json points at local Mountly packages");
    const pkgPath = join(appDir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.dependencies.mountly).toBeUndefined();
    expect(pkg.dependencies["mountly-react"]).toBeUndefined();
    pkg.dependencies["mountly-mcp"] = LOCAL_MCP;
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

    story.and("dependencies are installed");
    run("pnpm install", appDir);

    story.then("vite build succeeds");
    run("pnpm exec vite build", appDir);
    expect(existsSync(join(appDir, "dist/mountly-mcp.manifest.json"))).toBe(true);
    expect(existsSync(join(appDir, "dist/dashboard.html"))).toBe(true);

    story.and("mountly-mcp verify passes");
    const verifyOut = run("pnpm exec mountly-mcp verify", appDir);
    expect(verifyOut.toLowerCase()).not.toMatch(/\berror\b/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mountly-mcp create scaffolds vue and svelte entries", () => {
  const root = mkdtempSync(join(tmpdir(), "mountly-mcp-create-fw-"));
  try {
    for (const framework of ["vue", "svelte"] as const) {
      const appDir = join(root, framework);
      run(
        `node ${JSON.stringify(CLI)} create ${framework}-app --framework ${framework} --dir ${JSON.stringify(appDir)}`,
        root,
      );
      expect(existsSync(join(appDir, "package.json"))).toBe(true);
      expect(existsSync(join(appDir, "src/view.ts"))).toBe(true);
      expect(existsSync(join(appDir, "server.mjs"))).toBe(true);
      const pkg = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8")) as {
        dependencies: Record<string, string>;
      };
      if (framework === "vue") expect(pkg.dependencies["mountly-vue"]).toBeTruthy();
      if (framework === "svelte") expect(pkg.dependencies["mountly-svelte"]).toBeTruthy();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("mountly-mcp create scaffolds a vanilla app that needs no framework at all", () => {
  const root = mkdtempSync(join(tmpdir(), "mountly-mcp-create-vanilla-"));
  const appDir = join(root, "vanilla-app");
  try {
    run(
      `node ${JSON.stringify(CLI)} create vanilla-app --framework vanilla --dir ${JSON.stringify(appDir)}`,
      root,
    );
    expect(existsSync(join(appDir, "src/view.ts"))).toBe(true);

    const pkgPath = join(appDir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };

    // The point of this template: no adapter, no framework runtime.
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const framework of ["react", "vue", "svelte", "preact", "solid-js"]) {
      expect(deps[framework]).toBeUndefined();
      expect(deps[`mountly-${framework}`]).toBeUndefined();
    }

    pkg.dependencies["mountly-mcp"] = LOCAL_MCP;
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

    run("pnpm install", appDir);
    run("pnpm exec vite build", appDir);
    expect(existsSync(join(appDir, "dist/dashboard.html"))).toBe(true);

    const verifyOut = run("pnpm exec mountly-mcp verify", appDir);
    expect(verifyOut.toLowerCase()).not.toMatch(/\berror\b/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scaffolds pin the mountly-mcp that generated them, not a hardcoded version", () => {
  // A hardcoded `^3.1.0` in the templates survived the 4.0.0 rename, so every
  // scaffolded app installed a package whose exports its own vite.config did
  // not have. The pin now comes from the CLI, and this keeps it that way
  // without needing the registry.
  const own = (
    JSON.parse(readFileSync(join(REPO_ROOT, "packages/mcp-apps/package.json"), "utf8")) as {
      version: string;
    }
  ).version;
  const ownMajor = own.split(".")[0];

  const root = mkdtempSync(join(tmpdir(), "mountly-mcp-create-pin-"));
  try {
    for (const framework of ["react", "vue", "svelte", "vanilla"] as const) {
      const appDir = join(root, framework);
      run(
        `node ${JSON.stringify(CLI)} create ${framework}-app --framework ${framework} --dir ${JSON.stringify(appDir)}`,
        root,
      );
      const pkg = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8")) as {
        dependencies: Record<string, string>;
      };
      const pin = pkg.dependencies["mountly-mcp"];
      expect(pin, `${framework} template must pin mountly-mcp`).toBeTruthy();
      expect(pin).not.toContain("{{");
      expect(
        pin.replace(/^[\^~]/, "").split(".")[0],
        `${framework} pins ${pin} but this CLI is ${own} — a caret range cannot cross a major`,
      ).toBe(ownMajor);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
