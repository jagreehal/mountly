import { MCP_APPS_PROTOCOL_VERSION } from "../schema.js";
import type { McpUiDisplayMode } from "@modelcontextprotocol/ext-apps";
import { escapeInlineScript, serializeInlineScriptValue } from "../html.js";

/**
 * Runtime config the emitted HTML hands to the inlined bridge
 * (`bridge/iframe-entry.ts` reads these off `globalThis`). Without it the view
 * falls back to `awaitToolResult: true` / `availableDisplayModes: ["inline"]`,
 * regardless of what the build declared in the sidecar.
 */
export interface EmitHtmlConfig {
  awaitToolResult?: boolean;
  displayModes?: ReadonlyArray<McpUiDisplayMode>;
  streamToolInput?: boolean;
}

export interface EmitHtmlSelfContainedInput {
  mode: "self-contained";
  uri: string;
  js: string;
  css: string;
  bridgeRuntimeJs: string;
  config?: EmitHtmlConfig;
}

export interface EmitHtmlCdnInput {
  mode: "cdn";
  uri: string;
  jsUrl: string;
  cssUrl: string;
  bridgeRuntimeJs: string;
  config?: EmitHtmlConfig;
}

export type EmitHtmlInput = EmitHtmlSelfContainedInput | EmitHtmlCdnInput;

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeStyle(value: string): string {
  return value.replace(/<\/style/gi, "<\\/style");
}

/**
 * Classic (non-module) script so it runs at parse time — before the deferred
 * module scripts that boot the bridge.
 */
function configScript(config: EmitHtmlConfig | undefined): string[] {
  if (!config) return [];
  const assignments: string[] = [];
  if (config.awaitToolResult !== undefined) {
    assignments.push(
      `globalThis.__mountlyMcpAwaitToolResult__=${serializeInlineScriptValue(config.awaitToolResult)};`,
    );
  }
  if (config.displayModes !== undefined) {
    assignments.push(
      `globalThis.__mountlyMcpAvailableDisplayModes__=${serializeInlineScriptValue(config.displayModes)};`,
    );
  }
  if (config.streamToolInput !== undefined) {
    assignments.push(
      `globalThis.__mountlyMcpStreamToolInput__=${serializeInlineScriptValue(config.streamToolInput)};`,
    );
  }
  if (assignments.length === 0) return [];
  return [`<script>${assignments.join("")}</script>`];
}

export function emitHtml(input: EmitHtmlInput): string {
  const head = [
    `<meta charset="utf-8">`,
    `<meta name="mountly-mcp-protocol" content="${MCP_APPS_PROTOCOL_VERSION}">`,
    `<meta name="mountly-mcp-uri" content="${escapeAttr(input.uri)}">`,
  ];

  if (input.mode === "self-contained") {
    head.push(`<style>${escapeStyle(input.css)}</style>`);
    const body = [
      `<div id="mountly-mcp-root"></div>`,
      ...configScript(input.config),
      `<script type="module">${escapeInlineScript(input.js)}\n${escapeInlineScript(input.bridgeRuntimeJs)}</script>`,
    ];
    return template(head, body);
  }

  head.push(`<link rel="stylesheet" href="${escapeAttr(input.cssUrl)}">`);
  // The widget bundle MUST load before the bridge: module scripts execute in
  // document order, and the bridge reads `__mountlyMcpWidget__` synchronously.
  const body = [
    `<div id="mountly-mcp-root"></div>`,
    ...configScript(input.config),
    `<script type="module" src="${escapeAttr(input.jsUrl)}"></script>`,
    `<script type="module">${escapeInlineScript(input.bridgeRuntimeJs)}</script>`,
  ];
  return template(head, body);
}

function template(head: string[], body: string[]): string {
  return `<!doctype html>
<html data-mountly-mcp>
<head>
${head.join("\n")}
</head>
<body>
${body.join("\n")}
</body>
</html>`;
}
