import { access, readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import {
  MCP_APP_MANIFEST_FILE,
  McpAppConformanceError,
  readMcpAppArtifact,
  readMcpAppManifest,
  type ConformanceDiagnostic,
  type McpAppArtifact,
} from "../artifact/index.js";
import { renderMcpAppArtifact } from "./render-artifact.js";

export interface VerifyMcpAppsOptions {
  /** Canonical manifest. Defaults to `dist/mountly-mcp.manifest.json`. */
  manifestPath?: string;
  /** Transitional single-View inputs when no manifest exists. */
  htmlPaths?: ReadonlyArray<string>;
  /**
   * Load each View in a real browser and confirm the widget mounts with content.
   *
   * Off by default: it needs Playwright and a Chromium download, which the
   * static checks do not. Turn it on in CI. Everything else here inspects
   * files, and a View can satisfy every file-level check while failing to
   * render — a framework left external, a Node global in the bundle, a bridge
   * that never completes the handshake all produce conforming HTML.
   */
  render?: boolean;
}

export interface McpAppConformanceReport {
  ok: boolean;
  /** Verification tier selected by the caller. */
  mode: "static" | "browser";
  artifacts: ReadonlyArray<McpAppArtifact>;
  diagnostics: ReadonlyArray<ConformanceDiagnostic>;
}

function error(code: string, message: string, source?: string): ConformanceDiagnostic {
  return { severity: "error", code, message, source };
}

function warning(code: string, message: string, source?: string): ConformanceDiagnostic {
  return { severity: "warning", code, message, source };
}

/** Deterministic verification shared by the CLI and downstream CI. */
export async function verifyMcpApps(
  options: VerifyMcpAppsOptions = {},
): Promise<McpAppConformanceReport> {
  const diagnostics: ConformanceDiagnostic[] = [];
  const artifacts: McpAppArtifact[] = [];
  if (options.htmlPaths && options.htmlPaths.length > 0) {
    for (const path of options.htmlPaths) {
      try {
        artifacts.push(await readMcpAppArtifact(path));
      } catch (caught) {
        if (caught instanceof McpAppConformanceError) diagnostics.push(...caught.diagnostics);
        else
          diagnostics.push(
            error("verify/load", caught instanceof Error ? caught.message : String(caught)),
          );
      }
    }
  } else {
    try {
      const loaded = await readMcpAppManifest(
        options.manifestPath ?? `dist/${MCP_APP_MANIFEST_FILE}`,
      );
      for (const declared of loaded.artifacts) {
        try {
          const actual = await readMcpAppArtifact(declared.htmlPath, declared.uri);
          if (actual.name !== declared.name) {
            diagnostics.push(
              error(
                "manifest/name-mismatch",
                `manifest app '${declared.name}' points to artifact '${actual.name}'`,
                loaded.path,
              ),
            );
          }
          if (!isDeepStrictEqual(actual.declaration, declared.declaration)) {
            diagnostics.push(
              error(
                "manifest/declaration-mismatch",
                `manifest declaration for '${declared.name}' does not match its metadata file`,
                loaded.path,
              ),
            );
          }
          artifacts.push(actual);
        } catch (caught) {
          if (caught instanceof McpAppConformanceError) diagnostics.push(...caught.diagnostics);
          else
            diagnostics.push(
              error("verify/load", caught instanceof Error ? caught.message : String(caught)),
            );
        }
      }
    } catch (caught) {
      if (caught instanceof McpAppConformanceError) diagnostics.push(...caught.diagnostics);
      else
        diagnostics.push(
          error("verify/load", caught instanceof Error ? caught.message : String(caught)),
        );
    }
  }

  const names = new Set<string>();
  const uris = new Set<string>();
  for (const artifact of artifacts) {
    if (names.has(artifact.name)) {
      diagnostics.push(error("manifest/duplicate-name", `duplicate app name '${artifact.name}'`));
    }
    if (uris.has(artifact.uri)) {
      diagnostics.push(error("manifest/duplicate-uri", `duplicate app uri '${artifact.uri}'`));
    }
    names.add(artifact.name);
    uris.add(artifact.uri);
    try {
      await Promise.all([access(artifact.htmlPath), access(artifact.metaPath)]);
      const html = await readFile(artifact.htmlPath, "utf8");
      if (!html.includes("ui/initialize") || !html.includes("ui/notifications/initialized")) {
        diagnostics.push(
          error(
            "artifact/bridge",
            "View HTML does not contain the MCP Apps initialization handshake",
            artifact.htmlPath,
          ),
        );
      }
      if (options.render) diagnostics.push(...(await renderMcpAppArtifact(artifact)));
      if (!artifact.declaration.description) {
        diagnostics.push(
          warning(
            "artifact/description",
            `View '${artifact.name}' has no description`,
            artifact.metaPath,
          ),
        );
      }
    } catch (caught) {
      diagnostics.push(
        error(
          "artifact/files",
          caught instanceof Error ? caught.message : String(caught),
          artifact.htmlPath,
        ),
      );
    }
  }

  return {
    ok: !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    mode: options.render === true ? "browser" : "static",
    artifacts,
    diagnostics,
  };
}

export function formatConformanceReport(report: McpAppConformanceReport): string {
  const lines = report.diagnostics.map((diagnostic) => {
    const marker = diagnostic.severity === "error" ? "ERROR" : "WARN";
    const source = diagnostic.source ? ` (${diagnostic.source})` : "";
    return `${marker} ${diagnostic.code}: ${diagnostic.message}${source}`;
  });
  lines.push(
    `${report.ok ? "PASS" : "FAIL"} ${report.artifacts.length} app artifact${report.artifacts.length === 1 ? "" : "s"} (${report.mode === "browser" ? "browser checks" : "static checks only; pass --render for runtime coverage"})`,
  );
  return `${lines.join("\n")}\n`;
}
