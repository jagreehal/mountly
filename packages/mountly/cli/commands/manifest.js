import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { cwd, stderr, stdout } from "node:process";
import { dirname, join, resolve } from "node:path";

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

/**
 * Resolve a workspace package by walking `node_modules` and `packages/<name>` up
 * from `start`. Uses the package.json `exports` / `main` field.
 */
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

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

async function validateManifestCommand(rest) {
  const { parseManifest, validateManifest } = await loadManifestModule();
  const path = rest.find((a) => !a.startsWith("--"));
  if (!path) {
    throw new Error(
      "manifest validate requires a path. e.g. mountly manifest validate ./manifest.json",
    );
  }

  const target = resolve(path);
  let raw;
  try {
    raw = JSON.parse(readFileSync(target, "utf8"));
  } catch (e) {
    throw new Error(`Could not read JSON at ${target}: ${e.message}`);
  }

  let parsed;
  try {
    parsed = parseManifest(raw);
  } catch (e) {
    stderr.write(`${RED}✗ ${e.message}${RESET}\n`);
    process.exitCode = 1;
    return;
  }

  const issues = validateManifest(parsed);
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  for (const issue of issues) {
    const color = issue.level === "error" ? RED : YELLOW;
    stderr.write(`${color}${issue.level === "error" ? "✗" : "⚠"} ${issue.message}${RESET}\n`);
  }

  if (errors.length === 0) {
    stdout.write(
      `${GREEN}✓ ${target} is valid${RESET} (${parsed.verticals.length} verticals` +
        `${warnings.length ? `, ${warnings.length} warning${warnings.length > 1 ? "s" : ""}` : ""})\n`,
    );
  }
  if (errors.length > 0) process.exitCode = 1;
}

async function codegenManifestCommand(rest) {
  const { parseManifest, validateManifest, codegenManifestTypes } = await loadManifestModule();
  const path = rest.find((a) => !a.startsWith("--"));
  const outFlag = rest.indexOf("--out");
  const outPath = outFlag >= 0 ? rest[outFlag + 1] : "mountly-remotes.d.ts";

  if (!path) {
    throw new Error(
      "manifest codegen requires a path. e.g. mountly manifest codegen ./manifest.json --out mountly-remotes.d.ts",
    );
  }

  const target = resolve(path);
  const raw = JSON.parse(readFileSync(target, "utf8"));
  const parsed = parseManifest(raw);
  const errors = validateManifest(parsed).filter((i) => i.level === "error");
  if (errors.length > 0) {
    for (const issue of errors) {
      stderr.write(`${RED}✗ ${issue.message}${RESET}\n`);
    }
    process.exitCode = 1;
    return;
  }

  const dts = codegenManifestTypes(parsed);
  const output = resolve(outPath);
  writeFileSync(output, dts);
  stdout.write(`${GREEN}✓ Wrote ${output}${RESET}\n`);
}

async function composeManifestCommand(rest) {
  const { composeManifestFromFragments, validateManifest } = await loadManifestModule();
  const outFlag = rest.indexOf("--out");
  const outPath = outFlag >= 0 ? rest[outFlag + 1] : "manifest.json";
  const baseFlag = rest.indexOf("--base");
  const basePath = baseFlag >= 0 ? rest[baseFlag + 1] : undefined;
  const paths = rest.filter(
    (arg, index) =>
      !arg.startsWith("--") &&
      (outFlag < 0 || index !== outFlag + 1) &&
      (baseFlag < 0 || index !== baseFlag + 1),
  );

  if (paths.length === 0) {
    throw new Error(
      "manifest compose requires fragment paths. e.g. mountly manifest compose ./remote/dist/mountly.manifest.fragment.json --out manifest.json",
    );
  }

  const { manifest } = composeManifestFromFragments({
    root: cwd(),
    fragments: paths,
    base: basePath,
  });

  const issues = validateManifest(manifest).filter((i) => i.level === "error");
  if (issues.length > 0) {
    for (const issue of issues) {
      stderr.write(`${RED}✗ ${issue.message}${RESET}\n`);
    }
    process.exitCode = 1;
    return;
  }

  const output = resolve(outPath);
  writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
  stdout.write(`${GREEN}✓ Wrote ${output}${RESET} (${manifest.verticals.length} verticals)\n`);
}

/**
 * `mountly manifest validate <path>` — parse a manifest JSON file and report schema
 * errors plus consistency issues (duplicate React, version skew, duplicate ids).
 * `mountly manifest codegen <path> [--out file.d.ts]` — emit TypeScript remote modules.
 * `mountly manifest compose <fragments...> [--out manifest.json] [--base base.json]` — merge fragments.
 */
export async function manifest(args) {
  const [sub, ...rest] = args;
  if (sub === "validate") {
    await validateManifestCommand(rest);
    return;
  }
  if (sub === "codegen") {
    await codegenManifestCommand(rest);
    return;
  }
  if (sub === "compose") {
    await composeManifestCommand(rest);
    return;
  }
  throw new Error(
    `Unknown manifest subcommand: ${sub ?? "(none)"}. Try: mountly manifest validate|codegen|compose <path>`,
  );
}
