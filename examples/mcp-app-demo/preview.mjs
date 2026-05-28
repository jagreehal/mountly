import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createDemoServer, SAMPLE_PAYMENTS } from "./demo-core.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOST_DIR = resolve(__dirname, "preview/host");
const SANDBOX_DIR = resolve(__dirname, "preview/sandbox");
const HOST_PORT = 5179;
const SANDBOX_PORT = 5180;

// MCP Apps spec §8.4: Host and Sandbox MUST have different origins. localhost
// + distinct ports counts as a distinct origin per the same-origin policy,
// which is the standard development trick for dev hosts.

await rm(resolve(__dirname, "preview"), { recursive: true, force: true });
await mkdir(HOST_DIR, { recursive: true });
await mkdir(SANDBOX_DIR, { recursive: true });

const { built, cleanup } = await createDemoServer();
await copyFile(built.htmlPath, join(HOST_DIR, "widget.html"));
await copyFile(
  `${built.htmlPath}.meta.json`,
  join(HOST_DIR, "widget.html.meta.json"),
);
const widgetHtml = await readFile(built.htmlPath, "utf8");
const widgetMeta = JSON.parse(
  await readFile(`${built.htmlPath}.meta.json`, "utf8"),
);
await cleanup();

const cspMeta = widgetMeta._meta?.ui?.csp ?? {};
const permsMeta = widgetMeta._meta?.ui?.permissions ?? {};

/**
 * `JSON.stringify`'d strings injected inside an inline `<script>` will break
 * the HTML parser if they contain `</script>` substrings. Escape the `<` so
 * the script tag terminator is no longer formed at parse time.
 */
function safeJsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c");
}

const hostIndex = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>mountly-mcp · payment breakdown preview</title>
<style>
  :root { color-scheme: light dark; --bg:#f6f7f9; --fg:#0b0c0f; --muted:#5c6675; --accent:#1d4ed8; --border:#dcdfe5; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0b0c0f; --fg:#e6e9ef; --muted:#9aa3b2; --accent:#7aa2ff; --border:#252a33; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--fg); font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; display: grid; grid-template-rows: auto 1fr; }
  header { padding: 18px 24px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
  header h1 { margin: 0; font-size: 16px; font-weight: 600; }
  header p { margin: 0; color: var(--muted); font-size: 13px; }
  .btn { appearance: none; border: 1px solid var(--border); background: transparent; color: var(--fg); padding: 6px 12px; border-radius: 6px; font: inherit; cursor: pointer; }
  .btn:hover { border-color: var(--accent); color: var(--accent); }
  .btn[data-active="true"] { background: var(--accent); color: white; border-color: var(--accent); }
  main { display: grid; grid-template-columns: minmax(420px, 1fr) 360px; gap: 20px; padding: 24px; align-items: start; }
  iframe { width: 100%; height: 460px; border: 1px solid var(--border); border-radius: 12px; background: white; }
  .panel { border: 1px solid var(--border); border-radius: 12px; padding: 16px; background: color-mix(in srgb, var(--bg) 60%, transparent); }
  .panel h2 { margin: 0 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
  pre { margin: 0; padding: 10px; background: color-mix(in srgb, var(--fg) 8%, transparent); border-radius: 8px; font: 12px/1.45 ui-monospace, Menlo, Consolas, monospace; overflow: auto; max-height: 200px; }
  .log { font: 11px/1.5 ui-monospace, Menlo, Consolas, monospace; color: var(--muted); white-space: pre-wrap; max-height: 280px; overflow: auto; }
  @media (max-width: 880px) { main { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<header>
  <h1>mountly-mcp · payment breakdown</h1>
  <p>Sandbox proxy on :${SANDBOX_PORT} → inner widget iframe. Click a plan to deliver <code>ui/notifications/tool-result</code>.</p>
  <span style="flex:1"></span>
  <button class="btn" data-plan="annual" data-active="true">Annual</button>
  <button class="btn" data-plan="monthly">Monthly</button>
  <button class="btn" id="teardown">Teardown</button>
</header>
<main>
  <iframe
    id="sandbox"
    src="http://localhost:${SANDBOX_PORT}/sandbox-proxy.html"
    sandbox="allow-scripts allow-same-origin"
    title="mountly-mcp sandbox proxy"
  ></iframe>
  <div>
    <div class="panel">
      <h2>Last structuredContent</h2>
      <pre id="payload">(none yet)</pre>
    </div>
    <div class="panel" style="margin-top:12px">
      <h2>Channel log</h2>
      <div class="log" id="log"></div>
    </div>
  </div>
</main>
<script>
  // The MCP host: responds to ui/initialize, sends tool-input/tool-result/host-context-changed,
  // and bootstraps the sandbox proxy with the widget HTML once it's ready.
  const SAMPLES = ${safeJsonForScript(SAMPLE_PAYMENTS)};
  const WIDGET_HTML = ${safeJsonForScript(widgetHtml)};
  const WIDGET_CSP = ${safeJsonForScript(cspMeta)};
  const WIDGET_PERMS = ${safeJsonForScript(permsMeta)};
  const TOOL_NAME = "quote_payment";
  const HOST_ORIGIN = "http://localhost:${HOST_PORT}";
  const SANDBOX_ORIGIN = "http://localhost:${SANDBOX_PORT}";

  const sandbox = document.getElementById("sandbox");
  const payloadEl = document.getElementById("payload");
  const logEl = document.getElementById("log");
  let currentPlan = "annual";
  let initialized = false;
  let sentToolInput = false;
  let requestId = 1;

  function log(direction, label, params) {
    const head = direction === "in" ? "iframe →" : "host →";
    const detail = params ? " " + JSON.stringify(params).slice(0, 80) : "";
    logEl.textContent += head + " " + label + detail + "\\n";
    logEl.scrollTop = logEl.scrollHeight;
  }

  function postToSandbox(msg) {
    sandbox.contentWindow.postMessage(msg, SANDBOX_ORIGIN);
  }

  function notify(method, params) {
    postToSandbox({ jsonrpc: "2.0", method, params });
    log("out", method);
  }

  function reply(id, result) {
    postToSandbox({ jsonrpc: "2.0", id, result });
    log("out", "result#" + id);
  }

  function request(method, params) {
    const id = requestId++;
    postToSandbox({ jsonrpc: "2.0", id, method, params });
    log("out", method + "#" + id);
  }

  function buildHostContext() {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return {
      theme: isDark ? "dark" : "light",
      displayMode: "inline",
      availableDisplayModes: ["inline", "fullscreen"],
      locale: navigator.language,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      platform: "web",
      userAgent: "mountly-mcp-preview/0.0.1",
      deviceCapabilities: { hover: true, touch: false },
      styles: { variables: {} },
    };
  }

  function deliver(plan) {
    currentPlan = plan;
    document.querySelectorAll("button[data-plan]").forEach((b) => {
      b.dataset.active = String(b.dataset.plan === plan);
    });
    const payload = SAMPLES[plan];
    payloadEl.textContent = JSON.stringify(payload, null, 2);
    if (!initialized) return; // wait until handshake completes
    // Send tool-input once for this simulated invocation; subsequent clicks
    // only swap tool-result to demonstrate update() in the widget.
    if (!sentToolInput) {
      notify("ui/notifications/tool-input", { arguments: { plan } });
      sentToolInput = true;
    }
    notify("ui/notifications/tool-result", { structuredContent: payload });
  }

  // Toggle host context on system theme changes so the widget sees a live host-context-changed.
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    notify("ui/notifications/host-context-changed", { theme: buildHostContext().theme });
  });

  window.addEventListener("message", (e) => {
    if (e.origin !== SANDBOX_ORIGIN) return;
    if (e.source !== sandbox.contentWindow) return;
    const msg = e.data;
    if (!msg || msg.jsonrpc !== "2.0") return;

    // Sandbox proxy lifecycle messages — host responds with the resource to load.
    if (msg.method === "ui/notifications/sandbox-proxy-ready") {
      log("in", "ui/notifications/sandbox-proxy-ready");
      notify("ui/notifications/sandbox-resource-ready", {
        html: WIDGET_HTML,
        csp: WIDGET_CSP,
        permissions: WIDGET_PERMS,
      });
      return;
    }

    // Everything else is forwarded from the view through the sandbox proxy.
    if (typeof msg.id === "number" && msg.method === "ui/initialize") {
      log("in", "ui/initialize");
      reply(msg.id, {
        protocolVersion: "2026-01-26",
        hostInfo: { name: "mountly-mcp-preview-host", version: "0.0.1" },
        hostCapabilities: {
          openLinks: {},
          serverTools: {},
          serverResources: {},
          logging: {},
        },
        hostContext: buildHostContext(),
      });
      return;
    }

    if (msg.method === "ui/notifications/initialized") {
      log("in", "ui/notifications/initialized");
      initialized = true;
      // Auto-deliver the first sample so the widget renders without user action.
      setTimeout(() => deliver(currentPlan), 50);
      return;
    }

    if (typeof msg.id === "number" && msg.method === "ping") {
      reply(msg.id, {});
      return;
    }

    if (typeof msg.id === "number" && "result" in msg && !("method" in msg)) {
      log("in", "result#" + msg.id);
      return;
    }

    if (msg.method) {
      log("in", msg.method);
      // Acknowledge id-bearing requests we don't otherwise implement so the
      // view's promise chain doesn't dangle.
      if (typeof msg.id === "number") reply(msg.id, {});
    }
  });

  document.querySelectorAll("button[data-plan]").forEach((b) => {
    b.addEventListener("click", () => deliver(b.dataset.plan));
  });
  document.getElementById("teardown").addEventListener("click", () => {
    request("ui/resource-teardown", {});
    initialized = false;
    sentToolInput = false;
  });
</script>
</body>
</html>
`;

const sandboxProxy = `<!doctype html>
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
<script>
  // MCP Apps spec §8.4: sandbox proxy.
  //  1. We're on a different origin from the host (the host serves us via cross-port iframe).
  //  2. Host's outer iframe set sandbox="allow-scripts allow-same-origin" on us.
  //  3. On load, send ui/notifications/sandbox-proxy-ready to host.
  //  4. Host responds with ui/notifications/sandbox-resource-ready (html + csp + permissions).
  //  5. We inject CSP into the HTML, create inner iframe with sandbox attr + allow=, srcdoc the HTML.
  //  6. Forward all non-sandbox-* messages between inner iframe and host.

  const HOST = window.parent;
  const HOST_ORIGIN = "http://localhost:${HOST_PORT}";

  function buildCspMeta(csp) {
    const directives = [];
    const connect = (csp.connectDomains || []).join(" ").trim();
    const resource = (csp.resourceDomains || []).join(" ").trim();
    const frame = (csp.frameDomains || []).join(" ").trim();
    const baseUri = (csp.baseUriDomains || []).join(" ").trim();

    directives.push("default-src 'none'");
    // Allow inline + self for scripts/styles since the bundle is inlined.
    directives.push("script-src 'self' 'unsafe-inline'" + (resource ? " " + resource : ""));
    directives.push("style-src 'self' 'unsafe-inline'" + (resource ? " " + resource : ""));
    directives.push("img-src 'self' data:" + (resource ? " " + resource : ""));
    directives.push("font-src 'self' data:" + (resource ? " " + resource : ""));
    directives.push("media-src 'self' data:" + (resource ? " " + resource : ""));
    directives.push("connect-src " + (connect || "'none'"));
    directives.push("frame-src " + (frame || "'none'"));
    directives.push("base-uri " + (baseUri || "'self'"));
    directives.push("object-src 'none'");
    return '<meta http-equiv="Content-Security-Policy" content="' +
      directives.join("; ").replace(/"/g, "&quot;") + '">';
  }

  function buildAllow(permissions) {
    const parts = [];
    if (permissions.camera) parts.push("camera");
    if (permissions.microphone) parts.push("microphone");
    if (permissions.geolocation) parts.push("geolocation");
    if (permissions.clipboardWrite) parts.push("clipboard-write");
    return parts.join("; ");
  }

  function injectCsp(html, csp) {
    const meta = buildCspMeta(csp);
    // Insert immediately after <head>, falling back to top-of-document.
    if (/<head[^>]*>/i.test(html)) {
      return html.replace(/<head[^>]*>/i, (m) => m + meta);
    }
    return meta + html;
  }

  let inner;

  function bootInner(payload) {
    if (!payload || typeof payload.html !== "string" || payload.html.length === 0) {
      return;
    }
    const html = injectCsp(payload.html, payload.csp || {});
    const iframe = document.createElement("iframe");
    iframe.id = "inner";
    iframe.setAttribute(
      "sandbox",
      payload.sandbox || "allow-scripts allow-same-origin",
    );
    const allow = buildAllow(payload.permissions || {});
    if (allow) iframe.setAttribute("allow", allow);
    iframe.setAttribute("srcdoc", html);
    document.body.appendChild(iframe);
    inner = iframe;
  }

  window.addEventListener("message", (e) => {
    if (e.origin !== HOST_ORIGIN && e.source === HOST) return;
    const msg = e.data;
    if (!msg || msg.jsonrpc !== "2.0") return;

    // Host → sandbox proxy (sandbox-resource-ready). Do NOT forward to the view.
    if (e.source === HOST && msg.method === "ui/notifications/sandbox-resource-ready") {
      bootInner(msg.params || {});
      return;
    }

    // Host → view (everything else from host): forward to inner iframe.
    if (e.source === HOST) {
      if (inner && inner.contentWindow) inner.contentWindow.postMessage(msg, "*");
      return;
    }

    // View → host: forward upward, except sandbox-* notifications which are
    // proxy-internal per spec.
    if (inner && e.source === inner.contentWindow) {
      if (typeof msg.method === "string" && msg.method.startsWith("ui/notifications/sandbox-")) return;
      HOST.postMessage(msg, "*");
    }
  });

  // Tell the host we're ready to receive the widget HTML.
  HOST.postMessage(
    { jsonrpc: "2.0", method: "ui/notifications/sandbox-proxy-ready", params: {} },
    "*",
  );
</script>
</body>
</html>
`;

await writeFile(join(HOST_DIR, "index.html"), hostIndex, "utf8");
await writeFile(join(SANDBOX_DIR, "sandbox-proxy.html"), sandboxProxy, "utf8");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".js": "text/javascript",
  ".css": "text/css",
};

function makeServer(rootDir) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://localhost:0`);
      const path = url.pathname === "/" ? "/index.html" : url.pathname;
      const file = join(rootDir, path);
      if (!file.startsWith(rootDir)) {
        res.writeHead(403).end("forbidden");
        return;
      }
      const body = await readFile(file);
      res.writeHead(200, {
        "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
}

const hostServer = makeServer(HOST_DIR);
const sandboxServer = makeServer(SANDBOX_DIR);

hostServer.listen(HOST_PORT, () => {
  console.log(`[mcp-app-demo] host:    http://localhost:${HOST_PORT}/`);
});
sandboxServer.listen(SANDBOX_PORT, () => {
  console.log(`[mcp-app-demo] sandbox: http://localhost:${SANDBOX_PORT}/`);
  console.log(`[mcp-app-demo] ctrl+c to stop`);
});

function shutdown() {
  hostServer.close();
  sandboxServer.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
