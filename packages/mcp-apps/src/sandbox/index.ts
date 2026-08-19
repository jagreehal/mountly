/**
 * Standalone sandbox proxy HTML for external hosts (Vercel AI SDK, etc.).
 *
 * The dev host already builds this internally, but external hosts need it too —
 * every host has to serve the proxy page on a separate origin (spec §8.4), and
 * hand-writing it is error-prone and drifts from the canonical CSP/permissions
 * logic in `sandbox-entry`.
 *
 * The proxy page is a thin HTML shell: it sets `__mountlyMcpSandbox__` with the
 * host origin and then runs the sandbox entry script (an IIFE). Hosts provide
 * the entry script themselves because loading strategy varies — some inline it,
 * others serve it as a separate `<script src>`.
 */
import { escapeInlineScript, serializeInlineScriptValue } from "../html.js";

export interface SandboxProxyHtmlOptions {
  /**
   * The compiled sandbox entry IIFE to inline. When omitted the page emits an
   * empty `<script>` — the caller must arrange for the runtime to load another
   * way (e.g. a `<script src>` tag).
   */
  sandboxEntryScript?: string;
}

/**
 * Return the complete sandbox proxy HTML document for the given host origin.
 *
 * This is the security boundary described in MCP Apps §8.4: it runs on an
 * origin distinct from the host, receives the view HTML over postMessage,
 * injects the CSP the sidecar declared, and relays messages.
 */
export function sandboxProxyHtml(
  hostOrigin: string,
  options: SandboxProxyHtmlOptions = {},
): string {
  const runtime = options.sandboxEntryScript ?? "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>mountly-mcp sandbox proxy</title>
<style>
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: transparent; }
  #inner { width: 100%; height: 100%; border: 0; background: white; }
</style>
</head>
<body>
<script>globalThis.__mountlyMcpSandbox__ = ${serializeInlineScriptValue({ hostOrigin })};</script>
<script>${escapeInlineScript(runtime)}</script>
</body>
</html>
`;
}
