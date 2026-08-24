import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO = join(__dirname, "..");
const GLOSSARY = join(REPO, "packages/mcp-apps/GLOSSARY.md");
const SKILLS = join(REPO, "plugins/mountly-mcp/skills");
const TEMPLATES = join(REPO, "packages/mcp-apps/templates");
const CLI = join(REPO, "packages/mcp-apps/src/cli.ts");
const README = join(REPO, "packages/mcp-apps/README.md");

const REQUIRED_TERMS = [
  "createMcpView",
  "mountlyMcpViews",
  "registerMcpApps",
  "readMcpAppManifest",
  "mcp.fixtures.json",
  "dist/mountly-mcp.manifest.json",
] as const;

const FORBIDDEN_IN_MCP_SURFACE = [
  "createWidget",
  "data-mountly",
  "On-Demand Interactive UI Platform",
] as const;

function walk(dir: string, suffix: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, suffix));
    else if (full.endsWith(suffix)) out.push(full);
  }
  return out;
}

describe("MCP vocabulary lockstep", () => {
  it("ships a glossary with canonical terms", () => {
    expect(existsSync(GLOSSARY)).toBe(true);
    const text = readFileSync(GLOSSARY, "utf8");
    for (const term of REQUIRED_TERMS) {
      expect(text, `glossary missing ${term}`).toContain(term);
    }
    expect(text).toContain("mountly-mcp create");
    expect(text).toContain("mountly-mcp doctor");
    expect(text).toContain("mountly-mcp add");
  });

  it("CLI help lists vanilla and doctor/add", () => {
    const cli = readFileSync(CLI, "utf8");
    expect(cli).toContain("react | vue | svelte | vanilla");
    expect(cli).toContain("mountly-mcp doctor");
    expect(cli).toContain("mountly-mcp add");
  });

  it("skills and templates stay on the glossary vocabulary", () => {
    const skillFiles = walk(SKILLS, "SKILL.md");
    expect(skillFiles.length).toBeGreaterThanOrEqual(4);

    for (const file of skillFiles) {
      const text = readFileSync(file, "utf8");
      expect(text, `${file} should mention createMcpView or publishMcpView`).toMatch(
        /createMcpView|publishMcpView|registerMcpApps/,
      );
      for (const bad of FORBIDDEN_IN_MCP_SURFACE) {
        expect(text, `${file} must not mention ${bad}`).not.toContain(bad);
      }
      expect(text, `${file} must forbid cloning monorepos`).toMatch(/[Dd]o not|Forbidden|Clone/);
    }

    const readmes = walk(TEMPLATES, "README.md.tmpl");
    expect(readmes.length).toBe(4);
    for (const file of readmes) {
      const text = readFileSync(file, "utf8");
      expect(text).toContain("pnpm dev");
      expect(text).toContain("pnpm verify");
      for (const bad of FORBIDDEN_IN_MCP_SURFACE) {
        expect(text, `${file} must not mention ${bad}`).not.toContain(bad);
      }
    }
  });

  it("package README documents the happy path APIs", () => {
    const text = readFileSync(README, "utf8");
    for (const term of [
      "createMcpView",
      "mountlyMcpViews",
      "registerMcpApps",
      "readMcpAppManifest",
      "mcp.fixtures.json",
    ]) {
      expect(text).toContain(term);
    }
    expect(text).not.toContain("On-Demand Interactive UI Platform");
  });

  it("agent skills never instruct cloning mountly for greenfield Views", () => {
    const create = readFileSync(join(SKILLS, "create-mcp-app/SKILL.md"), "utf8");
    expect(create).toMatch(/npx mountly-mcp create/);
    expect(create).toMatch(/[Dd]o \*\*not\*\* .*clone|Forbidden[\s\S]*clone/i);
    expect(create.toLowerCase()).not.toMatch(/git clone.*jagreehal\/mountly/);
  });
});
