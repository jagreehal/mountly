/**
 * The sandbox proxy required of web hosts by MCP Apps §8.4.
 *
 * This is the security boundary: it decides what a third-party view may
 * execute and which origins it may reach. It runs on an origin distinct from
 * the host, receives the view's HTML over postMessage, injects the CSP the
 * sidecar declared, and relays messages in both directions.
 *
 * Topology:
 *
 *   host page (origin A)
 *     └── iframe: this proxy (origin B, sandbox="allow-scripts allow-same-origin")
 *           └── iframe srcdoc: the view (opaque origin, scripts only)
 *
 * `@modelcontextprotocol/ext-apps` does not ship a proxy, so this is ours to
 * maintain — which is why it is one compiled module rather than a string
 * copied into each place that needs a host.
 */
import type { McpUiResourceCsp, McpUiResourcePermissions } from "@modelcontextprotocol/ext-apps";

interface SandboxConfig {
  hostOrigin: string;
}

interface SandboxResourceReadyParams {
  html?: string;
  csp?: McpUiResourceCsp;
  permissions?: McpUiResourcePermissions;
  /** Host override for the inner frame's sandbox attribute. */
  sandbox?: string;
}

interface JsonRpcMessage {
  jsonrpc?: string;
  method?: string;
  params?: SandboxResourceReadyParams;
}

declare global {
  // eslint-disable-next-line no-var
  var __mountlyMcpSandbox__: SandboxConfig | undefined;
}

const config = globalThis.__mountlyMcpSandbox__;
if (!config) throw new Error("mountly-mcp: sandbox proxy has no host origin");
const HOST = window.parent;
const HOST_ORIGIN = config.hostOrigin;

function buildCspMeta(csp: McpUiResourceCsp): string {
  const join = (values: ReadonlyArray<string> | undefined): string =>
    (values ?? []).join(" ").trim();
  const connect = join(csp.connectDomains);
  const resource = join(csp.resourceDomains);
  const frame = join(csp.frameDomains);
  const baseUri = join(csp.baseUriDomains);
  const withResource = (directive: string): string => directive + (resource ? ` ${resource}` : "");

  const directives = [
    "default-src 'none'",
    // Inline scripts are allowed because the bundle arrives via srcdoc. Nothing
    // grants eval, matching what hosts enforce, so a view that reaches for it
    // fails here rather than in production.
    withResource("script-src 'self' 'unsafe-inline'"),
    withResource("style-src 'self' 'unsafe-inline'"),
    withResource("img-src 'self' data:"),
    withResource("font-src 'self' data:"),
    withResource("media-src 'self' data:"),
    `connect-src ${connect || "'none'"}`,
    `frame-src ${frame || "'none'"}`,
    `base-uri ${baseUri || "'self'"}`,
    "object-src 'none'",
  ];
  return `<meta http-equiv="Content-Security-Policy" content="${directives
    .join("; ")
    .replace(/"/g, "&quot;")}">`;
}

function buildAllow(permissions: McpUiResourcePermissions): string {
  const parts: string[] = [];
  if (permissions.camera) parts.push("camera");
  if (permissions.microphone) parts.push("microphone");
  if (permissions.geolocation) parts.push("geolocation");
  if (permissions.clipboardWrite) parts.push("clipboard-write");
  return parts.join("; ");
}

function injectCsp(html: string, csp: McpUiResourceCsp): string {
  const meta = buildCspMeta(csp);
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (match) => match + meta);
  return meta + html;
}

let inner: HTMLIFrameElement | undefined;

function bootInner(payload: SandboxResourceReadyParams): void {
  if (typeof payload.html !== "string" || payload.html.length === 0) return;
  const iframe = document.createElement("iframe");
  iframe.id = "inner";
  // The spec grants allow-same-origin to the *proxy*, not the view. Under
  // srcdoc the view would inherit this proxy's origin and could reach into its
  // DOM, so the view gets scripts only unless the host overrides.
  iframe.setAttribute("sandbox", payload.sandbox ?? "allow-scripts");
  const allow = buildAllow(payload.permissions ?? {});
  if (allow) iframe.setAttribute("allow", allow);
  iframe.setAttribute("srcdoc", injectCsp(payload.html, payload.csp ?? {}));
  document.body.appendChild(iframe);
  inner = iframe;
}

window.addEventListener("message", (event: MessageEvent) => {
  const fromHost = event.source === HOST;
  // Anything claiming to be the host must actually come from its origin. The
  // view is checked by window identity instead: under srcdoc its origin is
  // opaque, so there is no origin to compare.
  if (fromHost && event.origin !== HOST_ORIGIN) return;
  const message = event.data as JsonRpcMessage | null;
  if (!message || message.jsonrpc !== "2.0") return;

  if (fromHost) {
    // Addressed to the proxy itself; never forwarded on to the view.
    if (message.method === "ui/notifications/sandbox-resource-ready") {
      bootInner(message.params ?? {});
      return;
    }
    inner?.contentWindow?.postMessage(message, "*");
    return;
  }

  // View → host, minus the proxy-internal sandbox-* notifications.
  if (inner && event.source === inner.contentWindow) {
    if (
      typeof message.method === "string" &&
      message.method.startsWith("ui/notifications/sandbox-")
    )
      return;
    HOST.postMessage(message, "*");
  }
});

HOST.postMessage(
  { jsonrpc: "2.0", method: "ui/notifications/sandbox-proxy-ready", params: {} },
  "*",
);
