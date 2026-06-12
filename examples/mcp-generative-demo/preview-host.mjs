import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDemoServer } from "./demo-core.mjs";

/**
 * Build a static, two-origin MCP Apps HOST harness around the REAL generative
 * `ui://` widget. This is the spec's reference host (SEP-1865 §8.4): host +
 * sandbox-proxy on different origins, the genuine postMessage wire protocol
 * (ui/initialize → ui/notifications/tool-result), CSP-injected inner iframe.
 *
 * Unlike `preview-build.mjs` (which renders json-render directly, no MCP), this
 * loads the actual built widget HTML — bridge and all — receives a generated
 * spec as a real tool-result, and CAPTURES the widget's `sendMessage` (method
 * `ui/message`) at the host when the generated button is clicked. That is the
 * full agent loop running through a real MCP Apps host.
 *
 * Writes static files; serve them with two http servers on the ports below.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "preview-host");
const HOST_DIR = join(OUT, "host");
const SANDBOX_DIR = join(OUT, "sandbox");
const HOST_PORT = 5179;
const SANDBOX_PORT = 5180;

await rm(OUT, { recursive: true, force: true });
await mkdir(HOST_DIR, { recursive: true });
await mkdir(SANDBOX_DIR, { recursive: true });

// Build the real generative ui:// widget (bundles src/widget.tsx + bridge).
const { built, cleanup } = await createDemoServer();
const widgetHtml = await readFile(built.htmlPath, "utf8");
const widgetMeta = JSON.parse(await readFile(`${built.htmlPath}.meta.json`, "utf8"));
await cleanup();

// A REAL model-generated spec (Gemini) becomes the tool-result.
const spec = JSON.parse(
  await readFile(join(__dirname, "fixtures/gemini-generated-spec.json"), "utf8"),
);

const cspMeta = widgetMeta._meta?.ui?.csp ?? {};
const permsMeta = widgetMeta._meta?.ui?.permissions ?? {};

const safe = (v) => JSON.stringify(v).replace(/</g, "\\u003c");

const hostIndex = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>mcp-generative-demo · real MCP Apps host</title>
<style>
  body { margin:0; font:14px/1.5 system-ui, sans-serif; background:#f6f7f9; color:#0b0c0f; display:grid; grid-template-rows:auto 1fr; }
  header { padding:16px 24px; border-bottom:1px solid #dcdfe5; }
  header h1 { margin:0; font-size:15px; } header p { margin:4px 0 0; color:#5c6675; font-size:13px; }
  main { display:grid; grid-template-columns: minmax(420px,1fr) 360px; gap:20px; padding:24px; align-items:start; }
  iframe { width:100%; height:360px; border:1px solid #dcdfe5; border-radius:12px; background:#fff; }
  .panel { border:1px solid #dcdfe5; border-radius:12px; padding:14px; background:#fff; }
  .panel h2 { margin:0 0 8px; font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:#5c6675; }
  #inbox { font:13px/1.5 ui-monospace, monospace; color:#0f172a; min-height:24px; }
  #inbox.hit { background:#dcfce7; padding:8px; border-radius:8px; }
  .log { font:11px/1.5 ui-monospace, monospace; color:#5c6675; white-space:pre-wrap; max-height:240px; overflow:auto; }
</style></head>
<body>
<header>
  <h1>Real MCP Apps host — generative ui:// widget</h1>
  <p>Sandbox proxy on :${SANDBOX_PORT} (separate origin per §8.4). A real model-generated spec is delivered as <code>ui/notifications/tool-result</code>; the widget's button sends <code>ui/message</code> back here.</p>
</header>
<main>
  <iframe id="sandbox" src="http://localhost:${SANDBOX_PORT}/sandbox-proxy.html" sandbox="allow-scripts allow-same-origin" title="sandbox proxy"></iframe>
  <div>
    <div class="panel"><h2>Agent inbox (ui/message from the widget)</h2><div id="inbox" data-count="0">— nothing yet —</div></div>
    <div class="panel" style="margin-top:12px"><h2>Channel log</h2><div class="log" id="log"></div></div>
  </div>
</main>
<script>
  const WIDGET_HTML = ${safe(widgetHtml)};
  const WIDGET_CSP = ${safe(cspMeta)};
  const WIDGET_PERMS = ${safe(permsMeta)};
  const SPEC = ${safe(spec)};
  const SANDBOX_ORIGIN = "http://localhost:${SANDBOX_PORT}";
  const sandbox = document.getElementById("sandbox");
  const logEl = document.getElementById("log");
  const inboxEl = document.getElementById("inbox");
  let initialized = false, requestId = 1, inboxCount = 0;

  const log = (dir,label,extra)=>{ logEl.textContent += (dir==="in"?"iframe → ":"host → ")+label+(extra?" "+JSON.stringify(extra).slice(0,80):"")+"\\n"; logEl.scrollTop=logEl.scrollHeight; };
  const post = (m)=> sandbox.contentWindow.postMessage(m, SANDBOX_ORIGIN);
  const notify = (method,params)=>{ post({jsonrpc:"2.0",method,params}); log("out",method); };
  const reply = (id,result)=>{ post({jsonrpc:"2.0",id,result}); };

  const hostContext = ()=>({ theme:"light", displayMode:"inline", availableDisplayModes:["inline"], locale:navigator.language, platform:"web", styles:{variables:{}} });

  function deliver(){ notify("ui/notifications/tool-result", { structuredContent: { spec: SPEC } }); }

  window.addEventListener("message",(e)=>{
    if (e.origin !== SANDBOX_ORIGIN || e.source !== sandbox.contentWindow) return;
    const msg = e.data; if (!msg || msg.jsonrpc !== "2.0") return;

    if (msg.method === "ui/notifications/sandbox-proxy-ready") {
      log("in","sandbox-proxy-ready");
      notify("ui/notifications/sandbox-resource-ready", { html:WIDGET_HTML, csp:WIDGET_CSP, permissions:WIDGET_PERMS });
      return;
    }
    if (typeof msg.id === "number" && msg.method === "ui/initialize") {
      log("in","ui/initialize");
      reply(msg.id, { protocolVersion:"2026-01-26", hostInfo:{name:"mcp-generative-host",version:"0.0.1"},
        hostCapabilities:{ openLinks:{}, serverTools:{}, serverResources:{}, logging:{} }, hostContext: hostContext() });
      return;
    }
    if (msg.method === "ui/notifications/initialized") { log("in","initialized"); initialized=true; setTimeout(deliver,50); return; }

    // THE agent loop: the widget's button → App.sendMessage → method "ui/message".
    if (typeof msg.id === "number" && msg.method === "ui/message") {
      const text = (msg.params?.content||[]).map(c=>c.text).filter(Boolean).join(" ");
      inboxCount++;
      inboxEl.textContent = "🤖 agent received: " + text;
      inboxEl.className = "hit";
      inboxEl.setAttribute("data-count", String(inboxCount));
      inboxEl.setAttribute("data-text", text);
      log("in","ui/message", { text });
      reply(msg.id, {});   // host ack
      return;
    }
    if (typeof msg.id === "number") { reply(msg.id, {}); log("in", msg.method||"result"); return; }
    if (msg.method) log("in", msg.method);
  });
</script>
</body></html>`;

// Sandbox proxy (§8.4) — identical pattern to mcp-app-demo: inject CSP, srcdoc
// the widget into an inner iframe, forward messages both ways.
const sandboxProxy = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>sandbox proxy</title>
<style>html,body{margin:0;width:100%;height:100%}#inner{width:100%;height:100%;border:0;background:#fff}</style></head>
<body><script>
  const HOST = window.parent;
  const HOST_ORIGIN = "http://localhost:${HOST_PORT}";
  function cspMetaTag(csp){
    const d=["default-src 'none'","script-src 'self' 'unsafe-inline'","style-src 'self' 'unsafe-inline'","img-src 'self' data:","font-src 'self' data:","media-src 'self' data:","connect-src 'none'","frame-src 'none'","base-uri 'self'","object-src 'none'"];
    return '<meta http-equiv="Content-Security-Policy" content="'+d.join("; ")+'">';
  }
  let inner;
  function boot(p){ if(!p||typeof p.html!=="string"||!p.html) return;
    const html = /<head[^>]*>/i.test(p.html) ? p.html.replace(/<head[^>]*>/i,(m)=>m+cspMetaTag(p.csp||{})) : cspMetaTag(p.csp||{})+p.html;
    const f=document.createElement("iframe"); f.id="inner"; f.setAttribute("sandbox","allow-scripts allow-same-origin"); f.setAttribute("srcdoc",html);
    document.body.appendChild(f); inner=f;
  }
  window.addEventListener("message",(e)=>{ const msg=e.data; if(!msg||msg.jsonrpc!=="2.0") return;
    if (e.source===HOST && msg.method==="ui/notifications/sandbox-resource-ready"){ boot(msg.params||{}); return; }
    if (e.source===HOST){ if(inner&&inner.contentWindow) inner.contentWindow.postMessage(msg,"*"); return; }
    if (inner && e.source===inner.contentWindow){ if(typeof msg.method==="string" && msg.method.startsWith("ui/notifications/sandbox-")) return; HOST.postMessage(msg,"*"); }
  });
  HOST.postMessage({jsonrpc:"2.0",method:"ui/notifications/sandbox-proxy-ready",params:{}},"*");
</script></body></html>`;

await writeFile(join(HOST_DIR, "index.html"), hostIndex, "utf8");
await writeFile(join(SANDBOX_DIR, "sandbox-proxy.html"), sandboxProxy, "utf8");
console.log("host harness written:");
console.log("  host:    serve", HOST_DIR, "on", HOST_PORT);
console.log("  sandbox: serve", SANDBOX_DIR, "on", SANDBOX_PORT);
