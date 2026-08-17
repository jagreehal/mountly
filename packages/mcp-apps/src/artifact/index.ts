import { readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  McpUiDisplayModeSchema,
  McpUiResourceMetaSchema,
  RESOURCE_MIME_TYPE,
  LATEST_PROTOCOL_VERSION,
} from "@modelcontextprotocol/ext-apps";
import type { McpResourceDeclaration } from "../types.js";

export const MCP_APP_MANIFEST_VERSION = 1 as const;
export const MCP_APP_MANIFEST_FILE = "mountly-mcp.manifest.json";

export interface McpAppArtifact {
  /** Developer-facing unique key. */
  name: string;
  /** Protocol identity. */
  uri: string;
  /** Absolute path to the self-contained View HTML. */
  htmlPath: string;
  /** Absolute path to the transitional per-View sidecar. */
  metaPath: string;
  declaration: McpResourceDeclaration;
}

export interface McpAppManifestEntry {
  name: string;
  uri: string;
  /** Path relative to the manifest, unless explicitly absolute. */
  html: string;
  /** Path relative to the manifest, unless explicitly absolute. */
  meta: string;
  declaration: McpResourceDeclaration;
}

export interface McpAppManifest {
  formatVersion: typeof MCP_APP_MANIFEST_VERSION;
  protocolVersion: typeof LATEST_PROTOCOL_VERSION;
  apps: ReadonlyArray<McpAppManifestEntry>;
}

export type ConformanceSeverity = "error" | "warning";

export interface ConformanceDiagnostic {
  severity: ConformanceSeverity;
  code: string;
  message: string;
  source?: string;
}

export class McpAppConformanceError extends Error {
  readonly diagnostics: ReadonlyArray<ConformanceDiagnostic>;

  constructor(diagnostics: ReadonlyArray<ConformanceDiagnostic>) {
    super(diagnostics.map((d) => `${d.code}: ${d.message}`).join("\n"));
    this.name = "McpAppConformanceError";
    this.diagnostics = diagnostics;
  }
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function inspectMcpResourceDeclaration(
  value: unknown,
  source?: string,
): ReadonlyArray<ConformanceDiagnostic> {
  const diagnostics: ConformanceDiagnostic[] = [];
  const add = (code: string, message: string): void => {
    diagnostics.push({ severity: "error", code, message, source });
  };
  const candidate = object(value);
  if (!candidate) {
    add("artifact/not-object", "resource declaration must be an object");
    return diagnostics;
  }
  if (candidate.protocolVersion !== LATEST_PROTOCOL_VERSION) {
    add(
      "artifact/protocol-version",
      `sidecar protocolVersion must be '${LATEST_PROTOCOL_VERSION}' (received '${String(candidate.protocolVersion)}')`,
    );
  }
  if (typeof candidate.uri !== "string" || !candidate.uri.startsWith("ui://")) {
    add("artifact/uri", `uri must use the 'ui://' scheme (received '${String(candidate.uri)}')`);
  }
  if (typeof candidate.name !== "string" || candidate.name.trim() === "") {
    add("artifact/name", "name must be a non-empty string");
  }
  if (candidate.mimeType !== RESOURCE_MIME_TYPE) {
    add(
      "artifact/mime-type",
      `sidecar mimeType must be '${RESOURCE_MIME_TYPE}' (received '${String(candidate.mimeType)}')`,
    );
  }
  if (typeof candidate.awaitToolResult !== "boolean") {
    add("artifact/await-tool-result", "awaitToolResult must be a boolean");
  }
  if (
    !Array.isArray(candidate.displayModes) ||
    candidate.displayModes.length === 0 ||
    candidate.displayModes.some((mode) => !McpUiDisplayModeSchema.safeParse(mode).success)
  ) {
    add("artifact/display-modes", "displayModes must contain supported MCP Apps display modes");
  }
  const meta = object(candidate._meta);
  const ui = meta && object(meta.ui);
  if (!ui || !McpUiResourceMetaSchema.safeParse(ui).success) {
    add("artifact/resource-meta", "_meta.ui must be valid MCP Apps resource metadata");
  }
  return diagnostics;
}

export function parseMcpResourceDeclaration(
  value: unknown,
  source?: string,
): McpResourceDeclaration {
  const diagnostics = inspectMcpResourceDeclaration(value, source);
  if (diagnostics.length > 0) throw new McpAppConformanceError(diagnostics);
  return value as McpResourceDeclaration;
}

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
