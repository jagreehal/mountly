import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

const REPO = join(__dirname, "..");
const CLI = join(REPO, "packages/mcp-apps/dist/cli.js");
const SKILL = join(REPO, "plugins/mountly-mcp/skills/create-mcp-app/SKILL.md");
const LLMS = join(REPO, "llms.txt");

/**
 * The two files an agent reads before scaffolding must both point at
 * `mountly-mcp create` and rule out cloning a monorepo.
 */
describe("MCP agent routing eval", () => {
  it("create-mcp-app skill description wins common MCP Apps phrases", () => {
    const skill = readFileSync(SKILL, "utf8");
    const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    for (const phrase of [
      "create an MCP App",
      "MCP Apps View",
      "interactive MCP",
      "mountly-mcp create",
    ]) {
      expect(frontmatter.toLowerCase() + skill.toLowerCase()).toContain(phrase.toLowerCase());
    }
  });

  it("llms.txt forbids cloning and names the create command", () => {
    expect(existsSync(LLMS)).toBe(true);
    const text = readFileSync(LLMS, "utf8");
    expect(text).toContain("mountly-mcp create");
    expect(text.toLowerCase()).toMatch(/do not clone|forbidden[\s\S]*clon/);
    expect(text).toContain("jagreehal/mountly");
    expect(text).toContain("--framework");
    expect(text).not.toMatch(/git clone[^\n]*jagreehal\/mountly/);
  });

  it("doctor and help are available from the built CLI", () => {
    expect(existsSync(CLI)).toBe(true);
    const help = execSync(`node ${JSON.stringify(CLI)} --help`, {
      encoding: "utf8",
      cwd: REPO,
    });
    expect(help).toContain("doctor");
    expect(help).toContain("vanilla");
    expect(help).toContain("add <name>");

    const root = mkdtempSync(join(tmpdir(), "mountly-mcp-doctor-"));
    try {
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({ name: "tmp", private: true }, null, 2),
      );
      // No vite config → doctor fails with a coded error (or FAIL lines).
      try {
        execSync(`node ${JSON.stringify(CLI)} doctor`, {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
        throw new Error("doctor should fail without vite config");
      } catch (error) {
        const err = error as { stdout?: string; stderr?: string; message?: string };
        const out = `${err.stdout ?? ""}\n${err.stderr ?? ""}\n${err.message ?? ""}`;
        expect(out).toMatch(/FAIL|doctor-failed|vite-config|vite\.config/i);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
