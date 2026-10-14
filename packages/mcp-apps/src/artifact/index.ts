import { readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/ext-apps";
import {
  MCP_APP_MANIFEST_VERSION,
  McpAppConformanceError,
  object,
  parseMcpResourceDeclaration,
  type McpAppArtifact,
  type McpAppManifest,
} from "./declaration.js";

export {
  MCP_APP_MANIFEST_FILE,
  MCP_APP_MANIFEST_VERSION,
  McpAppConformanceError,
  inspectMcpResourceDeclaration,
  parseMcpAppSource,
  parseMcpResourceDeclaration,
  type ConformanceDiagnostic,
  type ConformanceSeverity,
  type McpAppArtifact,
  type McpAppManifest,
  type McpAppManifestEntry,
  type McpAppSource,
} from "./declaration.js";

export async function readMcpAppArtifact(
  htmlPath: string,
  expectedUri?: string,
): Promise<McpAppArtifact> {
  const absoluteHtmlPath = resolve(htmlPath);
  const metaPath = `${absoluteHtmlPath}.meta.json`;
  const [html, raw] = await Promise.all([
    readFile(absoluteHtmlPath, "utf8"),
    readFile(metaPath, "utf8"),
  ]);
  if (!/^\s*<!doctype html>/i.test(html)) {
    throw new McpAppConformanceError([
      {
        severity: "error",
        code: "artifact/html5",
        message: "View HTML must start with an HTML5 doctype",
        source: absoluteHtmlPath,
      },
    ]);
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch (error) {
    throw new McpAppConformanceError([
      {
        severity: "error",
        code: "artifact/meta-json",
        message: `metadata is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        source: metaPath,
      },
    ]);
  }
  const declaration = parseMcpResourceDeclaration(decoded, metaPath);
  if (expectedUri !== undefined && declaration.uri !== expectedUri) {
    throw new McpAppConformanceError([
      {
        severity: "error",
        code: "artifact/uri-mismatch",
        message: `registration uri '${expectedUri}' does not match sidecar uri '${declaration.uri}'`,
        source: metaPath,
      },
    ]);
  }
  return {
    name: declaration.name,
    uri: declaration.uri,
    htmlPath: absoluteHtmlPath,
    metaPath,
    declaration,
  };
}

function manifestPath(path: string, base: string): string {
  return isAbsolute(path) ? path : resolve(base, path);
}

export async function writeMcpAppManifest(
  path: string,
  artifacts: ReadonlyArray<McpAppArtifact>,
): Promise<McpAppManifest> {
  const absolutePath = resolve(path);
  const base = dirname(absolutePath);
  const names = new Set<string>();
  const uris = new Set<string>();
  for (const artifact of artifacts) {
    if (names.has(artifact.name))
      throw new Error(`mountly-mcp: duplicate app name '${artifact.name}'`);
    if (uris.has(artifact.uri)) throw new Error(`mountly-mcp: duplicate app uri '${artifact.uri}'`);
    names.add(artifact.name);
    uris.add(artifact.uri);
  }
  const manifest: McpAppManifest = {
    formatVersion: MCP_APP_MANIFEST_VERSION,
    protocolVersion: LATEST_PROTOCOL_VERSION,
    apps: artifacts.map((artifact) => ({
      name: artifact.name,
      uri: artifact.uri,
      html: relative(base, artifact.htmlPath),
      meta: relative(base, artifact.metaPath),
      declaration: artifact.declaration,
    })),
  };
  await writeFile(absolutePath, JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}

export async function readMcpAppManifest(path: string): Promise<{
  path: string;
  manifest: McpAppManifest;
  artifacts: ReadonlyArray<McpAppArtifact>;
}> {
  const absolutePath = resolve(path);
  const base = dirname(absolutePath);
  let decoded: unknown;
  try {
    decoded = JSON.parse(await readFile(absolutePath, "utf8"));
  } catch (error) {
    throw new Error(
      `mountly-mcp: could not read manifest '${absolutePath}': ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const candidate = object(decoded);
  if (
    candidate?.formatVersion !== MCP_APP_MANIFEST_VERSION ||
    candidate.protocolVersion !== LATEST_PROTOCOL_VERSION ||
    !Array.isArray(candidate.apps)
  ) {
    throw new Error(
      `mountly-mcp: '${absolutePath}' is not a supported mountly-mcp manifest (expected formatVersion ${MCP_APP_MANIFEST_VERSION})`,
    );
  }
  const manifest = decoded as McpAppManifest;
  const names = new Set<string>();
  const uris = new Set<string>();
  const artifacts: McpAppArtifact[] = [];
  for (const entry of manifest.apps) {
    if (names.has(entry.name)) throw new Error(`mountly-mcp: duplicate app name '${entry.name}'`);
    if (uris.has(entry.uri)) throw new Error(`mountly-mcp: duplicate app uri '${entry.uri}'`);
    names.add(entry.name);
    uris.add(entry.uri);
    const declaration = parseMcpResourceDeclaration(entry.declaration, absolutePath);
    if (declaration.name !== entry.name || declaration.uri !== entry.uri) {
      throw new Error(
        `mountly-mcp: manifest identity does not match declaration for '${entry.name}'`,
      );
    }
    artifacts.push({
      name: entry.name,
      uri: entry.uri,
      htmlPath: manifestPath(entry.html, base),
      metaPath: manifestPath(entry.meta, base),
      declaration,
    });
  }
  return { path: absolutePath, manifest, artifacts };
}
