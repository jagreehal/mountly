import { describe, expect, it } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const cliSource = readFileSync(
  resolve(__dirname, "../packages/mcp-apps/src/cli.ts"),
  "utf8",
);

describe("verify --json flag", () => {
  it("VerifyArgs interface includes json boolean", () => {
    expect(cliSource).toMatch(/json:\s*boolean/);
  });

  it("parseVerifyArgs handles --json", () => {
    expect(cliSource).toContain('arg === "--json"');
  });

  it("verify function branches on args.json", () => {
    expect(cliSource).toContain("args.json");
    expect(cliSource).toContain("JSON.stringify(report");
  });

  it("help text mentions --json", () => {
    expect(cliSource).toContain("--json");
    expect(cliSource).toContain("conformance report as JSON");
  });
});
