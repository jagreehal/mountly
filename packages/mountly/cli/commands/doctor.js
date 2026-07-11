import { existsSync, readFileSync } from "node:fs";
import { cwd, stderr, stdout } from "node:process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

function packageEntryFromDir(pkgDir) {
  const pkgJsonPath = join(pkgDir, "package.json");
  if (!existsSync(pkgJsonPath)) return null;

  const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
  const dotExport = pkg.exports?.["."];
  let rel = pkg.main ?? pkg.module ?? "dist/index.js";

  if (typeof dotExport === "string") {
    rel = dotExport;
  } else if (dotExport?.import) {
    rel = dotExport.import;
  }

  const entry = join(pkgDir, rel.replace(/^\.\//, ""));
  return existsSync(entry) ? entry : null;
}

function resolvePackageEntry(name, start) {
  let dir = resolve(start);
  for (;;) {
    const fromNodeModules = packageEntryFromDir(join(dir, "node_modules", name));
    if (fromNodeModules) return fromNodeModules;

    const fromWorkspace = packageEntryFromDir(join(dir, "packages", name));
    if (fromWorkspace) return fromWorkspace;

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

async function loadManifestModule() {
  const entry = resolvePackageEntry("mountly-manifest", cwd());
  try {
    return entry ? await import(pathToFileURL(entry).href) : await import("mountly-manifest");
  } catch {
    throw new Error(
      "mountly-manifest is not installed in this project. Install it: pnpm add mountly-manifest",
    );
  }
}

function doctorIssues(manifest) {
  const issues = [];
  const imports = manifest.platform.imports;
  const hasReactPlatform = Boolean(imports.react);

  for (const vertical of manifest.verticals) {
    const url = vertical.url ?? "";
    if (hasReactPlatform && url.endsWith("/index.js")) {
      issues.push({
        level: "warning",
        message: `vertical "${vertical.id}" url ends with /index.js — on a React host prefer dist/peer.js so the import map provides one React (see /mountly/concepts/distribution/)`,
      });
    }
    if (!url) {
      issues.push({
        level: "error",
        message: `vertical "${vertical.id}" is missing url — add a CDN path to dist/peer.js or dist/index.js`,
      });
    }
  }

  if (hasReactPlatform && !imports["react/jsx-runtime"]) {
    issues.push({
      level: "warning",
      message:
        'platform.imports maps "react" but not "react/jsx-runtime" — peer verticals usually need both (see /mountly/frameworks/plain-html/)',
    });
  }

  if (hasReactPlatform && !imports["mountly"]) {
    issues.push({
      level: "warning",
      message:
        'platform.imports is missing "mountly" — peer widgets externalize the runtime; map it so bootstrapMountly() can derive mountly/* subpaths',
    });
  }

  if (hasReactPlatform && !imports["mountly-react"]) {
    issues.push({
      level: "warning",
      message:
        'platform.imports is missing "mountly-react" — peer React widgets externalize the adapter; map it and keep React hosts on dist/peer.js to avoid duplicate React',
    });
  }

  return issues;
}

/**
 * `mountly doctor [manifest.json]` — manifest validate plus deploy footgun hints.
 */
export async function doctor(args) {
  const path = args.find((a) => !a.startsWith("--")) ?? "./manifest.json";
  const target = resolve(cwd(), path);

  if (!existsSync(target)) {
    throw new Error(`No manifest at ${target}. Pass a path: mountly doctor ./manifest.json`);
  }

  let raw;
  try {
    raw = JSON.parse(readFileSync(target, "utf8"));
  } catch (e) {
    throw new Error(`Could not read JSON at ${target}: ${e.message}`);
  }

  stdout.write(`Checking ${target}…\n\n`);

  const { parseManifest, validateManifest } = await loadManifestModule();

  let parsed;
  try {
    parsed = parseManifest(raw);
  } catch (e) {
    stderr.write(`${RED}✗ ${e.message}${RESET}\n`);
    process.exitCode = 1;
    return;
  }

  const issues = [...validateManifest(parsed), ...doctorIssues(parsed)].sort((a, b) =>
    a.level === b.level ? 0 : a.level === "error" ? -1 : 1,
  );
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  for (const issue of issues) {
    const color = issue.level === "error" ? RED : YELLOW;
    stderr.write(`${color}${issue.level === "error" ? "✗" : "⚠"} ${issue.message}${RESET}\n`);
  }

  if (errors.length === 0) {
    stdout.write(
      `${GREEN}✓ Doctor: ${target} looks deploy-ready${RESET}` +
        ` (${parsed.verticals.length} vertical${parsed.verticals.length === 1 ? "" : "s"}` +
        `${warnings.length ? `, ${warnings.length} warning${warnings.length > 1 ? "s" : ""}` : ""})\n`,
    );
  } else {
    stderr.write(
      `\n${RED}Doctor found ${errors.length} error${errors.length > 1 ? "s" : ""}.${RESET} Fix before deploy. See /mountly/getting-started/choosing-an-architecture/\n`,
    );
    process.exitCode = 1;
  }
}
