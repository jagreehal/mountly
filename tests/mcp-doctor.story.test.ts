import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatDoctorReport, runDoctor } from "../packages/mcp-apps/src/doctor.js";
import { CLI_ERROR_CODES, MountlyMcpCliError, cliError } from "../packages/mcp-apps/src/errors.js";

describe("mountly-mcp doctor", () => {
  it("fails without vite.config and names the next step", () => {
    const root = mkdtempSync(join(tmpdir(), "mountly-mcp-doctor-"));
    try {
      writeFileSync(join(root, "package.json"), JSON.stringify({ name: "tmp", private: true }));
      const report = runDoctor(root);
      expect(report.ok).toBe(false);
      const vite = report.checks.find((c) => c.id === "vite-config");
      expect(vite?.ok).toBe(false);
      expect(vite?.detail).toMatch(/mountly-mcp create|vite\.config/);
      expect(formatDoctorReport(report)).toContain("FAIL");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("passes vite-plugin when mountlyMcpViews is present", () => {
    const root = mkdtempSync(join(tmpdir(), "mountly-mcp-doctor-ok-"));
    try {
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({ name: "tmp", private: true, dependencies: { react: "^19.0.0" } }),
      );
      writeFileSync(
        join(root, "vite.config.ts"),
        `import { mountlyMcpViews } from "mountly-mcp/vite";\nexport default { plugins: [mountlyMcpViews({ apps: [] })] };\n`,
      );
      mkdirSync(join(root, "dist"), { recursive: true });
      writeFileSync(
        join(root, "dist/mountly-mcp.manifest.json"),
        JSON.stringify({ version: 1, apps: [] }),
      );
      const report = runDoctor(root);
      expect(report.checks.find((c) => c.id === "vite-config")?.ok).toBe(true);
      expect(report.checks.find((c) => c.id === "vite-plugin")?.ok).toBe(true);
      expect(report.checks.find((c) => c.id === "manifest")?.ok).toBe(true);
      expect(report.ok).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("mountly-mcp CLI errors", () => {
  it("includes code and Next: line", () => {
    const err = cliError(
      CLI_ERROR_CODES.MISSING_VITE_PLUGIN,
      "no plugin",
      "Add mountlyMcpViews() to vite.config.ts",
    );
    expect(err).toBeInstanceOf(MountlyMcpCliError);
    expect(err.code).toBe("mountly-mcp/missing-vite-plugin");
    expect(err.message).toContain("mountly-mcp/missing-vite-plugin:");
    expect(err.message).toContain("Next:");
    expect(err.next).toContain("mountlyMcpViews");
  });
});
