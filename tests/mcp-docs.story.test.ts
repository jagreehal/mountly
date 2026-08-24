import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(__dirname, "..");
const DOCS = join(REPO, "docs/src/content/docs/mcp-apps");
const README = join(REPO, "packages/mcp-apps/README.md");
const GLOSSARY = join(REPO, "packages/mcp-apps/GLOSSARY.md");
const LLMS = join(REPO, "llms.txt");
const LLMS_PUBLISHED = join(REPO, "docs/public/llms.txt");

const REQUIRED_PAGES = [
  "index.mdx",
  "quick-start.mdx",
  "agent-skills.mdx",
  "vs-ext-apps.mdx",
  "host-matrix.mdx",
  "examples.mdx",
  "production-integration.mdx",
  "development-and-verification.mdx",
  "build-and-artifacts.mdx",
  "how-it-works.mdx",
] as const;

describe("MCP docs completeness", () => {
  it("ships every scorecard page", () => {
    for (const page of REQUIRED_PAGES) {
      expect(existsSync(join(DOCS, page)), page).toBe(true);
    }
  });

  it("keeps glossary terms in the overview and package README", () => {
    const index = readFileSync(join(DOCS, "index.mdx"), "utf8");
    const readme = readFileSync(README, "utf8");
    const glossary = readFileSync(GLOSSARY, "utf8");
    for (const term of [
      "createMcpView",
      "mountlyMcpViews",
      "registerMcpApps",
      "readMcpAppManifest",
      "mcp.fixtures.json",
    ]) {
      expect(glossary).toContain(term);
      expect(readme).toContain(term);
    }
    expect(index).toContain("createMcpView");
    expect(index).toContain("registerMcpApps");
    expect(index).toContain("mountly-mcp create");
    expect(index).toContain("Host matrix");
  });

  it("documents Claude and VS Code connect paths", () => {
    const hosts = readFileSync(join(DOCS, "host-matrix.mdx"), "utf8");
    expect(hosts).toContain("Claude Desktop");
    expect(hosts).toContain("VS Code");
    expect(hosts).toContain("serve-stdio.mjs");
    expect(hosts).toContain("claude_desktop_config.json");
    expect(hosts).toMatch(/Untested|Partial/);
  });

  it("serves the same llms.txt it keeps at the repo root", () => {
    expect(readFileSync(LLMS_PUBLISHED, "utf8")).toBe(readFileSync(LLMS, "utf8"));
  });

  it("points agents at create, not clone", () => {
    const skills = readFileSync(join(DOCS, "agent-skills.mdx"), "utf8");
    expect(skills).toContain("mountly-mcp create");
    expect(skills).toMatch(/must not clone|Do not clone/i);
  });
});
