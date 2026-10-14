import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { CLI_ERROR_CODES, cliError } from "./errors.js";

export interface DoctorCheck {
  id: string;
  ok: boolean;
  detail: string;
  /** Worth fixing, but never fails the run: printed as `warn`, not `FAIL`. */
  advisory?: boolean;
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
 * Path to `pkg` in the project's node_modules, walking up from `fromDir`. Reads the
 * filesystem, so packages whose `exports` omit `./package.json` resolve too.
 */
function findInstalled(pkg: string, fromDir: string): string | null {
  for (let dir = resolve(fromDir); ; dir = dirname(dir)) {
    const path = join(dir, "node_modules", pkg, "package.json");
    if (existsSync(path)) return path;
    if (dirname(dir) === dir) return null;
  }
}

const OPENAI_USAGE =
  /openai\/ui|useOpenAIExtensions|mountly-mcp\/openai|mountly-mcp\/react\/openai|@openai\/mcp-extensions|openaiUi\b|openaiUiToolMeta|enableOpenAiExtensions/;

function projectSourcesMentionOpenAi(cwd: string, viteConfig?: string): boolean {
  const candidates: string[] = [];
  if (viteConfig) candidates.push(viteConfig);
  for (const name of ["server.ts", "server.mjs", "server.js", "src/server.ts", "src/view.tsx"]) {
    const path = resolve(cwd, name);
    if (existsSync(path)) candidates.push(path);
  }
  const srcDir = resolve(cwd, "src");
  if (existsSync(srcDir)) {
    try {
      for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
        if (entry.isFile() && /\.(tsx?|jsx?|mjs|cjs)$/.test(entry.name)) {
          candidates.push(join(srcDir, entry.name));
        }
      }
    } catch {
      // ignore unreadable src
    }
  }
  for (const path of candidates) {
    try {
      if (OPENAI_USAGE.test(readFileSync(path, "utf8"))) return true;
    } catch {
      // skip
    }
  }
  return false;
}

/**
 * Habits of an ordinary web app that break once it runs as a View, inside a
 * host's sandboxed iframe with no origin of its own. Text patterns, not
 * analysis: each hit marks a line to check.
 */
const SANDBOX_HAZARDS: ReadonlyArray<{ id: string; pattern: RegExp; fix: string }> = [
  {
    id: "storage",
    pattern: /\b(?:localStorage|sessionStorage|indexedDB)\b/,
    fix: "throws in a sandbox without allow-same-origin. Wrap each access in try/catch, or keep the state in memory or on the server.",
  },
  {
    id: "router",
    pattern: /\b(?:BrowserRouter|createBrowserRouter)\b/,
    fix: "a ui:// View has no URL to route on. Render the page directly, or use a MemoryRouter.",
  },
  {
    id: "download",
    pattern: /\.download\s*=|\bdownload=|\bsaveAs\s*\(|\bXLSX\.writeFile(?:XLSX)?\s*\(/,
    fix: "hosts block <a download>. Use useDownload() from mountly-mcp/react, or downloadFile() from mountly-mcp.",
  },
  {
    id: "worker",
    pattern: /new\s+(?:Shared)?Worker\s*\((?!\s*new\s+URL\s*\()/,
    fix: 'only new Worker(new URL("./w.ts", import.meta.url)) is bundled into the View. Start the worker that way.',
  },
  {
    id: "remote-import",
    pattern: /(?:import\s*\(|\bfrom)\s*["'`]https?:\/\//,
    fix: "remote modules load only from origins in csp.resourceDomains. Install and bundle the package instead.",
  },
  {
    id: "hostname",
    pattern: /\blocation\.(?:hostname|host|origin)\b/,
    fix: "in a host iframe this is the sandbox's origin, not your site. Pass configuration in through the tool result.",
  },
  {
    id: "relative-fetch",
    pattern: /\bfetch\s*\(\s*[`'"]\/(?!\/)/,
    fix: "a View has no origin to resolve /api against. Call an app-only server tool with callServerTool(), or fetch an absolute URL listed in csp.connectDomains.",
  },
  {
    id: "window-open",
    pattern: /\bwindow\.open\s*\(/,
    fix: "popups are blocked. Use app.openLink({ url }) from useMcpApp().",
  },
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (
      /\.(?:[cm]?[jt]sx?|vue|svelte)$/.test(entry.name) &&
      !/\.(?:test|spec)\./.test(entry.name)
    ) {
      out.push(path);
    }
  }
  return out;
}

/** One advisory check per hazard found under `src/`, naming where to look. */
export function scanSandboxHazards(cwd: string): DoctorCheck[] {
  const hits = new Map<string, string[]>();
  for (const file of sourceFiles(resolve(cwd, "src"))) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    // Whole-file, not per line: `new Worker(\n  new URL(…)` is one call.
    for (const hazard of SANDBOX_HAZARDS) {
      for (const match of text.matchAll(new RegExp(hazard.pattern.source, "g"))) {
        const line = text.slice(0, match.index).split("\n").length;
        const at = hits.get(hazard.id) ?? [];
        at.push(`${relative(cwd, file)}:${line}`);
        hits.set(hazard.id, at);
      }
    }
  }
  if (hits.size === 0) {
    return [
      { id: "sandbox", ok: true, detail: "no sandbox hazards found in src/", advisory: true },
    ];
  }
  return SANDBOX_HAZARDS.filter((hazard) => hits.has(hazard.id)).map((hazard) => {
    const at = hits.get(hazard.id) ?? [];
    const more = at.length > 3 ? ` (+${at.length - 3} more)` : "";
    return {
      id: `sandbox/${hazard.id}`,
      ok: false,
      advisory: true,
      detail: `${at.slice(0, 3).join(", ")}${more}: ${hazard.fix}`,
    };
  });
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
    // A brand-new scaffold has not built yet.
    advisory: true,
    detail: existsSync(manifest)
      ? `Found ${manifest}`
      : "No dist/mountly-mcp.manifest.json yet. Run: npx mountly-mcp build",
  });

  const playwright = tryResolve("playwright", cwd) ?? tryResolve("@playwright/test", cwd);
  checks.push({
    id: "playwright",
    ok: Boolean(playwright),
    // Only `verify --render` needs it.
    advisory: true,
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
          ok: reactMajor >= 18,
          detail:
            reactMajor >= 18
              ? `React ${reactPkg.version} (ok)`
              : `React ${reactPkg.version} is below 18. mountly-mcp/react and mountly-react need createRoot, from React 18.`,
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

  if (projectSourcesMentionOpenAi(cwd, viteConfig)) {
    const openai = findInstalled("@openai/mcp-extensions", cwd);
    checks.push({
      id: "openai-extensions",
      ok: Boolean(openai),
      detail: openai
        ? `@openai/mcp-extensions resolvable (${openai})`
        : "Project references OpenAI MCP extensions but @openai/mcp-extensions is not installed. Run: pnpm add @openai/mcp-extensions",
    });
  }

  checks.push(...scanSandboxHazards(cwd));

  const ok = checks.every((c) => c.ok || c.advisory);

  return { ok, checks };
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines = ["mountly-mcp doctor", ""];
  for (const check of report.checks) {
    const status = check.ok ? "ok" : check.advisory ? "warn" : "FAIL";
    lines.push(`${status.padEnd(4)}  ${check.id.padEnd(22)} ${check.detail}`);
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
