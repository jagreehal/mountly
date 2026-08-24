import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { CLI_ERROR_CODES, cliError } from "./errors.js";

export interface DoctorCheck {
  id: string;
  ok: boolean;
  detail: string;
}

export interface DoctorReport {
  ok: boolean;
  checks: DoctorCheck[];
}

function nodeMajor(): number {
  return Number(process.versions.node.split(".")[0] ?? 0);
}

function tryResolve(specifier: string, fromDir: string): string | null {
  try {
    const require = createRequire(resolve(fromDir, "package.json"));
    return require.resolve(specifier);
  } catch {
    return null;
  }
}

/**
 * Check the local project for Mountly MCP readiness. Exits nonzero via the
 * CLI when `ok` is false.
 */
export function runDoctor(cwd = process.cwd()): DoctorReport {
  const checks: DoctorCheck[] = [];

  const major = nodeMajor();
  checks.push({
    id: "node",
    ok: major >= 20,
    detail:
      major >= 20
        ? `Node ${process.versions.node} (ok; 20+ required, 22+ recommended)`
        : `Node ${process.versions.node} is below 20. Upgrade Node, then re-run mountly-mcp doctor.`,
  });

  const viteConfigCandidates = [
    "vite.config.ts",
    "vite.config.mts",
    "vite.config.js",
    "vite.config.mjs",
  ].map((name) => resolve(cwd, name));
  const viteConfig = viteConfigCandidates.find((path) => existsSync(path));
  checks.push({
    id: "vite-config",
    ok: Boolean(viteConfig),
    detail: viteConfig
      ? `Found ${viteConfig}`
      : "No vite.config.* in this directory. Run from the View project, or: npx mountly-mcp create my-app --framework react",
  });

  if (viteConfig) {
    const source = readFileSync(viteConfig, "utf8");
    const hasPlugin = /mountlyMcpViews\s*\(/.test(source);
    checks.push({
      id: "vite-plugin",
      ok: hasPlugin,
      detail: hasPlugin
        ? "vite config imports mountlyMcpViews()"
        : `Add mountlyMcpViews() from "mountly-mcp/vite" to ${viteConfig}`,
    });
  }

  const manifest = resolve(cwd, "dist/mountly-mcp.manifest.json");
  checks.push({
    id: "manifest",
    ok: existsSync(manifest),
    detail: existsSync(manifest)
      ? `Found ${manifest}`
      : "No dist/mountly-mcp.manifest.json yet. Run: npx mountly-mcp build",
  });

  const playwright = tryResolve("playwright", cwd) ?? tryResolve("@playwright/test", cwd);
  checks.push({
    id: "playwright",
    ok: Boolean(playwright),
    detail: playwright
      ? `Playwright resolvable for verify --render (${playwright})`
      : "Playwright not installed. For CI render checks: pnpm add -D playwright && npx playwright install chromium",
  });

  const pkgPath = resolve(cwd, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.react) {
      const reactPath = tryResolve("react/package.json", cwd);
      if (reactPath) {
        const reactPkg = JSON.parse(readFileSync(reactPath, "utf8")) as { version?: string };
        const reactMajor = Number((reactPkg.version ?? "0").split(".")[0]);
        checks.push({
          id: "react",
          ok: reactMajor >= 19,
          detail:
            reactMajor >= 19
              ? `React ${reactPkg.version} (ok)`
              : `React ${reactPkg.version} is below 19. mountly-mcp/react and mountly-react require React 19.`,
        });
      }
    }
    if (deps.vite) {
      const vitePath = tryResolve("vite/package.json", cwd);
      if (vitePath) {
        const vitePkg = JSON.parse(readFileSync(vitePath, "utf8")) as { version?: string };
        const viteMajor = Number((vitePkg.version ?? "0").split(".")[0]);
        checks.push({
          id: "vite",
          ok: viteMajor >= 8,
          detail:
            viteMajor >= 8
              ? `Vite ${vitePkg.version} (ok)`
              : `Vite ${vitePkg.version} is below 8. mountly-mcp/vite is built and tested against Vite 8.`,
        });
      }
    }
  }

  // Manifest missing is advisory for a brand-new scaffold before first build.
  const hard = checks.filter((c) => c.id !== "manifest" && c.id !== "playwright");
  const ok = hard.every((c) => c.ok);

  return { ok, checks };
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines = ["mountly-mcp doctor", ""];
  for (const check of report.checks) {
    lines.push(`${check.ok ? "ok" : "FAIL"}  ${check.id.padEnd(14)} ${check.detail}`);
  }
  lines.push("");
  lines.push(report.ok ? "Ready for mountly-mcp build / dev / verify." : "Fix FAIL items above.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function doctorCommand(cwd = process.cwd()): void {
  const report = runDoctor(cwd);
  process.stdout.write(formatDoctorReport(report));
  if (!report.ok) {
    throw cliError(
      CLI_ERROR_CODES.DOCTOR_FAILED,
      "one or more doctor checks failed",
      "Fix the FAIL lines above, then re-run: mountly-mcp doctor",
    );
  }
}
