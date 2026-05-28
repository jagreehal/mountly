import { MCP_APPS_PROTOCOL_VERSION } from "../schema.js";

export interface EmitHtmlSelfContainedInput {
  mode: "self-contained";
  uri: string;
  js: string;
  css: string;
  bridgeRuntimeJs: string;
}

export interface EmitHtmlCdnInput {
  mode: "cdn";
  uri: string;
  jsUrl: string;
  cssUrl: string;
  bridgeRuntimeJs: string;
}

export type EmitHtmlInput = EmitHtmlSelfContainedInput | EmitHtmlCdnInput;

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeScript(value: string): string {
  return value.replace(/<\/script/gi, "<\\/script");
}

function escapeStyle(value: string): string {
  return value.replace(/<\/style/gi, "<\\/style");
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
      `<script type="module">${escapeScript(input.js)}\n${escapeScript(input.bridgeRuntimeJs)}</script>`,
    ];
    return template(head, body);
  }

  head.push(`<link rel="stylesheet" href="${escapeAttr(input.cssUrl)}">`);
  const body = [
    `<div id="mountly-mcp-root"></div>`,
    `<script type="module">${escapeScript(input.bridgeRuntimeJs)}</script>`,
    `<script type="module" src="${escapeAttr(input.jsUrl)}"></script>`,
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
