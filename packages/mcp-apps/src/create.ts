import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Package root: dist/cli.js → .. ; src/cli.ts during tests → .. when run via dist. */
const PACKAGE_ROOT = resolve(__dirname, "..");
const TEMPLATES = resolve(PACKAGE_ROOT, "templates");

/**
 * The version of mountly-mcp doing the scaffolding, so the generated
 * package.json pins the API this CLI actually ships.
 *
 * Hardcoding the pin in the templates meant a major release left them behind:
 * `^3.1.0` cannot resolve to 4.0.0, so every scaffolded app installed a
 * package without the exports its own vite.config imported.
 */
function ownVersion(): string {
  const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as {
    version?: string;
  };
  if (!pkg.version) throw new Error("mountly-mcp: cannot read own version from package.json");
  return pkg.version;
}

const SUPPORTED = ["react", "vue", "svelte", "vanilla"] as const;
type Framework = (typeof SUPPORTED)[number];

export interface CreateArgs {
  name: string;
  framework: Framework;
  dir: string;
}

export function parseCreateArgs(argv: ReadonlyArray<string>): CreateArgs {
  const name = argv[0];
  if (!name || name.startsWith("-")) {
    throw new Error(
      "mountly-mcp create requires a project name. e.g. mountly-mcp create my-app --framework react",
    );
  }

  let framework: Framework = "react";
  let dir = `./${name}`;

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--framework" || arg === "-f") {
      const value = argv[++i];
      if (value === undefined) throw new Error(`mountly-mcp: ${arg} needs a value`);
      if (!SUPPORTED.includes(value as Framework)) {
        throw new Error(
          `mountly-mcp: framework "${value}" not supported. Available: ${SUPPORTED.join(", ")}`,
        );
      }
      framework = value as Framework;
    } else if (arg === "--dir") {
      const value = argv[++i];
      if (value === undefined) throw new Error("mountly-mcp: --dir needs a value");
      dir = value;
    } else {
      throw new Error(`mountly-mcp: unknown create option '${arg}'`);
    }
  }

  return { name, framework, dir };
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function renderTemplates(dir: string, ctx: Record<string, string>): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      renderTemplates(full, ctx);
      continue;
    }
    if (!entry.endsWith(".tmpl")) continue;
    let content = readFileSync(full, "utf8");
    for (const [key, value] of Object.entries(ctx)) {
      content = content.split(`{{${key}}}`).join(value);
    }
    writeFileSync(full.replace(/\.tmpl$/, ""), content);
    unlinkSync(full);
  }
}

export async function createProject(args: CreateArgs): Promise<void> {
  const target = resolve(args.dir);
  if (existsSync(target)) {
    throw new Error(`mountly-mcp: target directory already exists: ${target}`);
  }

  const tplDir = join(TEMPLATES, args.framework);
  if (!existsSync(tplDir)) {
    throw new Error(
      `mountly-mcp: template for framework "${args.framework}" is missing at ${tplDir}`,
    );
  }

  mkdirSync(target, { recursive: true });
  cpSync(tplDir, target, { recursive: true });

  const slug = slugify(args.name) || "app";
  renderTemplates(target, {
    name: args.name,
    slug,
    uri: `ui://${slug}/dashboard`,
    framework: args.framework,
    mcpVersion: ownVersion(),
  });

  process.stdout.write(
    [
      "",
      `✓ Created MCP App ${args.name} (${args.framework}) at ${target}`,
      "",
      "Next steps:",
      `  cd ${args.dir}`,
      "  pnpm install",
      "  pnpm dev          # sandboxed host + live reload",
      "  pnpm verify       # conformance check",
      "",
      "Do not clone the Mountly monorepo for greenfield apps — this scaffold is the canonical path.",
      "",
    ].join("\n"),
  );
}
