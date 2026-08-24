import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { addView, parseAddArgs } from "../packages/mcp-apps/src/add.js";

const REPO = join(__dirname, "..");
const CLI = join(REPO, "packages/mcp-apps/dist/cli.js");

describe("mountly-mcp add", () => {
  it("parses add args", () => {
    expect(parseAddArgs(["settings", "--framework", "react"]).name).toBe("settings");
    expect(parseAddArgs(["settings", "--uri", "ui://x/y"]).uri).toBe("ui://x/y");
  });

  it("adds a View entry and vite apps row", () => {
    const root = mkdtempSync(join(tmpdir(), "mountly-mcp-add-"));
    try {
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({ name: "tmp", dependencies: { react: "^19.0.0" } }, null, 2),
      );
      writeFileSync(
        join(root, "vite.config.ts"),
        `import { defineConfig } from "vite";
import { mountlyMcpViews } from "mountly-mcp/vite";
export default defineConfig({
  plugins: [
    mountlyMcpViews({
      apps: [
        {
          entry: "src/view.tsx",
          uri: "ui://demo/dashboard",
          name: "dashboard",
        },
      ],
    }),
  ],
});
`,
      );

      addView({ name: "settings", framework: "react" }, root);

      expect(existsSync(join(root, "src/settings.tsx"))).toBe(true);
      const config = readFileSync(join(root, "vite.config.ts"), "utf8");
      expect(config).toContain('name: "settings"');
      expect(config).toContain("ui://app/settings");
      expect(config).toContain("src/settings.tsx");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("CLI help mentions add", () => {
    expect(existsSync(CLI)).toBe(true);
    const help = execFileSync("node", [CLI, "--help"], { encoding: "utf8" });
    expect(help).toContain("mountly-mcp add");
  });
});
