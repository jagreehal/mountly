import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import type {
  McpUiDisplayMode,
  McpUiResourceCsp,
  McpUiResourcePermissions,
} from "@modelcontextprotocol/ext-apps";
import type { McpResourceDeclaration } from "../types.js";
import type { McpAppArtifact } from "../artifact/index.js";
import { emitHtml } from "./emit-html.js";
import { emitMeta } from "./emit-meta.js";

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
  // Ask the module resolver rather than walking up from __dirname: the subpath
  // is a declared export, so this holds wherever a bundler puts this file.
  return fileURLToPath(import.meta.resolve("mountly-mcp/bridge/iframe-entry.js"));
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
  displayModes?: ReadonlyArray<McpUiDisplayMode>;
  /**
   * Render progressive states from `ui/notifications/tool-input-partial`.
   * Off by default — see `RunBridgeOptions.streamToolInput`.
   */
  streamToolInput?: boolean;
  csp?: McpUiResourceCsp;
  /** Sandbox permissions requested by the view (camera/microphone/geolocation/clipboardWrite). */
  permissions?: McpUiResourcePermissions;
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
  artifact: McpAppArtifact;
}

export interface BuildFromSourceOptions extends Omit<
  BuildSelfContainedOptions,
  "entry" | "cssEntry"
> {
  /** The bundled widget JS. */
  js: string;
  /** The widget's CSS, if it has any. */
  css?: string;
}

/**
 * Same as {@link buildMcpResource}, but taking the bundle in memory instead of
 * from disk — for bundler plugins that already hold the emitted sources and
 * shouldn't have to guess when they land on the filesystem.
 */
export async function buildMcpResourceFromSource(
  options: BuildFromSourceOptions,
): Promise<BuildResult> {
  const { js, css, ...rest } = options;
  return writeResource({ ...rest, mode: "self-contained", js, css: css ?? "" });
}

export async function buildMcpResource(options: BuildOptions): Promise<BuildResult> {
  if (!("cdn" in options)) {
    const js = await readFile(options.entry, "utf8");
    const css = options.cssEntry ? await readFile(options.cssEntry, "utf8") : "";
    return writeResource({ ...options, mode: "self-contained", js, css });
  }
  return writeResource({ ...options, mode: "cdn" });
}

type ResourceMeta = Omit<BuildSelfContainedOptions, "entry" | "cssEntry">;

type WriteResourceOptions =
  | (ResourceMeta & { mode: "self-contained"; js: string; css: string })
  | (ResourceMeta & { mode: "cdn"; cdn: BuildCdnOptions["cdn"] });

async function writeResource(options: WriteResourceOptions): Promise<BuildResult> {
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
    csp: options.mode === "cdn" ? mergeCdnIntoCsp(options.csp, options.cdn) : options.csp,
    permissions: options.permissions,
    domain: options.domain,
    prefersBorder: options.prefersBorder,
  });

  // Same values the sidecar declares, so the view's `ui/initialize` matches it.
  const config = {
    awaitToolResult: declaration.awaitToolResult,
    displayModes: declaration.displayModes,
    streamToolInput: options.streamToolInput ?? false,
  };

  const html =
    options.mode === "cdn"
      ? emitHtml({
          mode: "cdn",
          uri: options.uri,
          jsUrl: options.cdn.jsUrl,
          cssUrl: options.cdn.cssUrl,
          bridgeRuntimeJs,
          config,
        })
      : emitHtml({
          mode: "self-contained",
          uri: options.uri,
          js: options.js,
          css: options.css,
          bridgeRuntimeJs,
          config,
        });

  const metaPath = `${options.output}.meta.json`;
  await writeFile(options.output, html, "utf8");
  await writeFile(metaPath, JSON.stringify(declaration, null, 2), "utf8");

  const htmlPath = resolve(options.output);
  return {
    htmlPath,
    metaPath: resolve(metaPath),
    declaration,
    artifact: {
      name: declaration.name,
      uri: declaration.uri,
      htmlPath,
      metaPath: resolve(metaPath),
      declaration,
    },
  };
}

function mergeCdnIntoCsp(
  csp: McpUiResourceCsp | undefined,
  cdn: { jsUrl: string; cssUrl: string },
): McpUiResourceCsp {
  const jsOrigin = new URL(cdn.jsUrl).origin;
  const cssOrigin = new URL(cdn.cssUrl).origin;
  const merged: McpUiResourceCsp = { ...(csp ?? {}) };
  const existing = new Set(merged.resourceDomains ?? []);
  existing.add(jsOrigin);
  existing.add(cssOrigin);
  merged.resourceDomains = Array.from(existing);
  return merged;
}

export { emitHtml } from "./emit-html.js";
export { emitMeta } from "./emit-meta.js";
