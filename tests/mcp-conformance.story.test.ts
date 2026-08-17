import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { story } from "executable-stories-vitest";
import { describe, expect, it } from "vite-plus/test";
import { writeMcpAppManifest } from "../packages/mcp-apps/src/artifact/index";
import { buildMcpResource } from "../packages/mcp-apps/src/build/index";
import { formatConformanceReport, verifyMcpApps } from "../packages/mcp-apps/src/testing/index";

async function fixture(dir: string, description?: string) {
  const entry = join(dir, "widget.js");
  const bridge = join(dir, "bridge.js");
  writeFileSync(entry, "globalThis.__mountlyMcpWidget__ = { mount(){}, unmount(){} };", "utf8");
  writeFileSync(bridge, "/* ui/initialize ui/notifications/initialized */", "utf8");
  return buildMcpResource({
    entry,
    bridgeRuntimePath: bridge,
    output: join(dir, "weather.html"),
    uri: "ui://weather/dashboard",
    name: "weather_dashboard",
    description,
  });
}

describe("MCP Apps conformance", () => {
  it("verifies a canonical manifest deterministically and offline", async ({ task }) => {
    story.init(task, { tags: ["mcp", "conformance"] });
    const dir = mkdtempSync(join(tmpdir(), "mountly-mcp-verify-"));
    const built = await fixture(dir, "Weather dashboard");
    const manifestPath = join(dir, "mountly-mcp.manifest.json");
    await writeMcpAppManifest(manifestPath, [built.artifact]);

    const report = await verifyMcpApps({ manifestPath });

    expect(report.ok).toBe(true);
    expect(report.artifacts.map((artifact) => artifact.uri)).toEqual(["ui://weather/dashboard"]);
    expect(report.mode).toBe("static");
    expect(report.diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      "artifact/not-rendered",
    );
    expect(formatConformanceReport(report)).toContain("static checks only");
    expect(formatConformanceReport(report)).toContain("PASS 1 app artifact");
    rmSync(dir, { recursive: true });
  });

  it("keeps advisory diagnostics as warnings for --strict consumers", async ({ task }) => {
    story.init(task, { tags: ["mcp", "conformance", "strict"] });
    const dir = mkdtempSync(join(tmpdir(), "mountly-mcp-verify-warning-"));
    const built = await fixture(dir);

    const report = await verifyMcpApps({ htmlPaths: [built.htmlPath] });

    expect(report.ok).toBe(true);
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: "warning", code: "artifact/description" }),
      ]),
    );
    rmSync(dir, { recursive: true });
  });

  it("detects stale manifest declarations and continues after broken artifacts", async ({
    task,
  }) => {
    story.init(task, { tags: ["mcp", "conformance", "diagnostics"] });
    const dir = mkdtempSync(join(tmpdir(), "mountly-mcp-verify-stale-"));
    const built = await fixture(dir, "Current description");
    const manifestPath = join(dir, "mountly-mcp.manifest.json");
    await writeMcpAppManifest(manifestPath, [built.artifact]);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      apps: Array<{ declaration: { description?: string } }>;
    };
    manifest.apps[0]!.declaration.description = "Stale description";
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

    const stale = await verifyMcpApps({ manifestPath });
    const broken = await verifyMcpApps({
      htmlPaths: [join(dir, "missing-one.html"), join(dir, "missing-two.html")],
    });

    expect(stale.ok).toBe(false);
    expect(stale.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "manifest/declaration-mismatch" })]),
    );
    expect(broken.diagnostics).toHaveLength(2);
    rmSync(dir, { recursive: true });
  });
});
