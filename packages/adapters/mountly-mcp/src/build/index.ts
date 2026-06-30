import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  DisplayMode,
  McpCsp,
  McpResourceDeclaration,
  McpResourcePermissions,
} from "../types.js";
import { emitHtml } from "./emit-html.js";
import { emitMeta } from "./emit-meta.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to the iframe bridge runtime shipped with this package.
 *
 * `buildMcpResource` inlines this file's contents into the emitted HTML so
 * the widget can speak the MCP Apps postMessage protocol. Use this when you
 * need to point another build tool at the runtime, or when you want a
 * stable, version-pinned alternative to passing `bridgeRuntimePath` yourself.
 *
 * Resolves relative to the installed package, so it works identically in
 * monorepos and in projects that installed mountly-mcp from npm.
 */
export function getBridgeRuntimePath(): string {
  return resolve(__dirname, "../bridge/iframe-entry.js");
}

function defaultBridgeRuntimePath(): string {
  return getBridgeRuntimePath();
}

export interface BuildSelfContainedOptions {
  entry: string;
  uri: string;
  name: string;
  output: string;
  description?: string;
  awaitToolResult?: boolean;
  displayModes?: ReadonlyArray<DisplayMode>;
  csp?: McpCsp;
  /** Sandbox permissions requested by the view (camera/microphone/geolocation/clipboardWrite). */
  permissions?: McpResourcePermissions;
  /** Dedicated sandbox origin (host-dependent format). */
  domain?: string;
  /** Whether the view requests the host to show a visible border + background. */
  prefersBorder?: boolean;
  cssEntry?: string;
  bridgeRuntimePath?: string;
}

export interface BuildCdnOptions extends BuildSelfContainedOptions {
  cdn: { jsUrl: string; cssUrl: string };
}

export type BuildOptions = BuildSelfContainedOptions | BuildCdnOptions;

export interface BuildResult {
  htmlPath: string;
  metaPath: string;
  declaration: McpResourceDeclaration;
}

export async function buildMcpResource(options: BuildOptions): Promise<BuildResult> {
  const bridgeRuntimeJs = await readFile(
    options.bridgeRuntimePath ?? defaultBridgeRuntimePath(),
    "utf8",
  );

  const declaration = emitMeta({
    uri: options.uri,
    name: options.name,
    description: options.description,
    awaitToolResult: options.awaitToolResult,
    displayModes: options.displayModes,
    csp: "cdn" in options ? mergeCdnIntoCsp(options.csp, options.cdn) : options.csp,
    permissions: options.permissions,
    domain: options.domain,
    prefersBorder: options.prefersBorder,
  });

  let html: string;
  if ("cdn" in options) {
    html = emitHtml({
      mode: "cdn",
      uri: options.uri,
      jsUrl: options.cdn.jsUrl,
      cssUrl: options.cdn.cssUrl,
      bridgeRuntimeJs,
    });
  } else {
    const js = await readFile(options.entry, "utf8");
    const css = options.cssEntry ? await readFile(options.cssEntry, "utf8") : "";
    html = emitHtml({ mode: "self-contained", uri: options.uri, js, css, bridgeRuntimeJs });
  }

  const metaPath = `${options.output}.meta.json`;
  await writeFile(options.output, html, "utf8");
  await writeFile(metaPath, JSON.stringify(declaration, null, 2), "utf8");

  return { htmlPath: options.output, metaPath, declaration };
}

function mergeCdnIntoCsp(csp: McpCsp | undefined, cdn: { jsUrl: string; cssUrl: string }): McpCsp {
  const jsOrigin = new URL(cdn.jsUrl).origin;
  const cssOrigin = new URL(cdn.cssUrl).origin;
  const merged: McpCsp = { ...(csp ?? {}) };
  const existing = new Set(merged.resourceDomains ?? []);
  existing.add(jsOrigin);
  existing.add(cssOrigin);
  merged.resourceDomains = Array.from(existing);
  return merged;
}

export { emitHtml } from "./emit-html.js";
export { emitMeta } from "./emit-meta.js";
