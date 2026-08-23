import { expect, test } from "@playwright/test";
import { story } from "executable-stories-playwright";
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..");
const CLI = join(REPO_ROOT, "packages", "mcp-apps", "dist", "cli.js");

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
    pkg.dependencies["mountly-mcp"] = `file:${join(REPO_ROOT, "packages/mcp-apps")}`;
    // Transitive deps of mountly-mcp — pin local packages for the file: install.
    pkg.dependencies.mountly = `file:${join(REPO_ROOT, "packages/mountly")}`;
    pkg.dependencies["mountly-react"] = `file:${join(REPO_ROOT, "packages/adapters/mountly-react")}`;
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
