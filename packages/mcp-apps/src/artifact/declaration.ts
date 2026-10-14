/**
 * The parts of an artifact that need no filesystem: its types, and the checks
 * a resource declaration must pass. Kept apart so a server on a runtime without
 * `node:fs` (Cloudflare Workers) can register Views held in memory.
 */
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

export function object(value: unknown): Record<string, unknown> | undefined {
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

/**
 * A View held in memory rather than on disk: what `mountly-mcp build` writes to
 * `mountly-mcp.views.js` for servers that cannot read files.
 */
export interface McpAppSource {
  name: string;
  uri: string;
  declaration: McpResourceDeclaration;
  /** The self-contained View HTML. */
  html: string;
}

/** Check an in-memory View the way `readMcpAppArtifact` checks one on disk. */
export function parseMcpAppSource(value: McpAppSource, expectedUri?: string): McpAppSource {
  const source = value.name ? `view '${value.name}'` : "in-memory view";
  if (typeof value.html !== "string" || !/^\s*<!doctype html>/i.test(value.html)) {
    throw new McpAppConformanceError([
      {
        severity: "error",
        code: "artifact/html5",
        message: "View HTML must start with an HTML5 doctype",
        source,
      },
    ]);
  }
  const declaration = parseMcpResourceDeclaration(value.declaration, source);
  if (declaration.name !== value.name || declaration.uri !== value.uri) {
    throw new Error(`mountly-mcp: ${source} identity does not match its declaration`);
  }
  if (expectedUri !== undefined && declaration.uri !== expectedUri) {
    throw new McpAppConformanceError([
      {
        severity: "error",
        code: "artifact/uri-mismatch",
        message: `registration uri '${expectedUri}' does not match declared uri '${declaration.uri}'`,
        source,
      },
    ]);
  }
  return value;
}
