/**
 * A local MCP Apps host, so a widget can be developed without installing a
 * real host and restarting it on every change.
 *
 * It is a genuine host, not a preview shim: two origins as the spec requires
 * (§8.4), a sandbox proxy that injects the sidecar's CSP and permissions, the
 * full `ui/initialize` handshake, and tool-input/tool-result delivery. A widget
 * that works here works in Claude, and one that reaches for `eval` fails here
 * for the same reason it would fail there.
 *
 * ```ts
 * const host = await startDevHost({ htmlPath: "dist/widget.html", fixtures });
 * console.log(host.hostUrl);
 * ```
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import type { McpResourceDeclaration } from "../types.js";
import { escapeInlineScript, serializeInlineScriptValue } from "../html.js";

export interface DevHostOptions {
  /** Built widget HTML. Its `.meta.json` sidecar is read alongside. */
  htmlPath: string;
  /**
   * Named samples, each becoming a button in the host chrome.
   *
   * Without `callTool` the value is delivered straight through as
   * `structuredContent`. With `callTool` it is the tool's *arguments*, and
   * what the view receives is whatever the real tool returns.
   */
  fixtures?: Record<string, unknown>;
  /**
   * Run a real tool. Supplied when the developer points `dev` at their server,
   * and used both for the fixture buttons and for `tools/call` requests the
   * view makes itself — so app-only tools behave as they will in production.
   */
  callTool?: (name: string, args: unknown) => Promise<unknown>;
  /** Arguments delivered as `ui/notifications/tool-input`. */
  toolInput?: Record<string, unknown>;
  /** Shown in the host chrome. Defaults to the sidecar's resource name. */
  toolName?: string;
  /** Defaults to 5179, incrementing until a free port is found. */
  hostPort?: number;
  /** Defaults to `hostPort + 1`, incrementing until a free port is found. */
  sandboxPort?: number;
}

export interface DevHost {
  hostUrl: string;
  sandboxUrl: string;
  /** Tell connected browsers to reload — call after a rebuild. */
  reload(): void;
  close(): Promise<void>;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
}

const runtimeCache = new Map<string, Promise<string>>();

/**
 * Load one of the browser-side runtimes (`host-entry`, `sandbox-entry`) as a
 * string to inline into a page.
 *
 * Installed, the built IIFE is a declared package export, so ask the module
 * resolver for it. Walking from `import.meta.url` breaks the moment a bundler
 * hoists this module into a shared chunk at a different depth — which is what
 * tsup does, leaving it looking in dist/ while the file sits in dist/dev/.
 */
function loadRuntime(name: "host-entry" | "sandbox-entry"): Promise<string> {
  const cached = runtimeCache.get(name);
  if (cached) return cached;
  const loading = (async () => {
    try {
      return await readFile(
        fileURLToPath(import.meta.resolve(`mountly-mcp/dev/${name}.js`)),
        "utf8",
      );
    } catch {
      // Running from source in this repo, where nothing is built yet.
    }
    const entry = fileURLToPath(new URL(`./${name}.ts`, import.meta.url));
    if (!existsSync(entry)) {
      throw new Error(
        `mountly-mcp dev: ${name} runtime missing. Expected the packaged 'mountly-mcp/dev/${name}.js' export, or ${entry} when running from source.`,
      );
    }
    const { build } = await import("vite");
    const result = await build({
      configFile: false,
      logLevel: "silent",
      build: {
        write: false,
        target: "es2022",
        minify: false,
        lib: { entry, formats: ["iife"], name: "__mountlyMcpDevRuntime" },
      },
    });
    const outputs = Array.isArray(result) ? result : [result];
    const chunk = outputs
      .flatMap((output) => ("output" in output ? output.output : []))
      .find((item) => item.type === "chunk");
    if (!chunk || chunk.type !== "chunk")
      throw new Error(`mountly-mcp dev: failed to bundle ${name}`);
    return chunk.code;
  })();
  runtimeCache.set(name, loading);
  return loading;
}

function listenOnFreePort(server: Server, port: number): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const attempt = (candidate: number): void => {
      // Listeners are paired and torn down together: `listen()`'s callback form
      // leaves a stale one attached across retries, which then resolves with
      // the port that was already taken.
      const onError = (error: NodeJS.ErrnoException): void => {
        server.removeListener("listening", onListening);
        // ponytail: linear probe, fine for a dev tool on a developer's laptop.
        if (error.code === "EADDRINUSE" && candidate < port + 50) attempt(candidate + 1);
        else reject(error);
      };
      const onListening = (): void => {
        server.removeListener("error", onError);
        const address = server.address();
        resolvePort(typeof address === "object" && address !== null ? address.port : candidate);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(candidate);
    };
    attempt(port);
  });
}

export async function startDevHost(options: DevHostOptions): Promise<DevHost> {
  const { htmlPath, fixtures = {}, toolInput = {}, callTool } = options;

  const metaPath = `${htmlPath}.meta.json`;
  const initialMeta = JSON.parse(await readFile(metaPath, "utf8")) as McpResourceDeclaration;
  const toolName = options.toolName ?? initialMeta.name;
  const [hostRuntime, sandboxRuntime] = await Promise.all([
    loadRuntime("host-entry"),
    loadRuntime("sandbox-entry"),
  ]);

  // Bumped on reload(); the browser polls it and reloads when it changes. The
  // widget HTML is read per request rather than baked into the page, so a
  // rebuild is picked up with no server restart.
  let version = 1;

  // The two servers reference each other's origin, and each only needs the
  // other's once a request arrives — so the sandbox reads this after the host
  // has bound its port.
  let hostOrigin = "";

  const sandboxServer = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(sandboxProxyShell(hostOrigin, sandboxRuntime));
  });
  const sandboxPort = await listenOnFreePort(
    sandboxServer,
    options.sandboxPort ?? (options.hostPort ?? 5179) + 1,
  );
  const sandboxOrigin = `http://localhost:${sandboxPort}`;

  const hostServer = createServer(async (req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    const send = (status: number, type: string, body: string | Buffer): void => {
      res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
      res.end(body);
    };
    try {
      if (path === "/call" && req.method === "POST") {
        if (!callTool) return send(400, "text/plain", "no server connected");
        const body = await new Promise<string>((done, fail) => {
          let raw = "";
          req.on("data", (chunk) => (raw += chunk));
          req.on("end", () => done(raw));
          req.on("error", fail);
        });
        const { name, arguments: args } = JSON.parse(body) as { name: string; arguments?: unknown };
        // Tool failures are the view's problem to render, not the dev server's
        // to crash on, so they come back as a normal result.
        const result = await callTool(name, args).catch((error: unknown) => ({
          isError: true,
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }],
        }));
        return send(200, "application/json", JSON.stringify(result));
      }
      if (path === "/") return send(200, "text/html; charset=utf-8", hostPage());
      if (path === "/host.js") return send(200, "text/javascript; charset=utf-8", hostRuntime);
      if (path === "/version") return send(200, "application/json", String(version));
      if (path === "/widget.html")
        return send(200, "text/plain; charset=utf-8", await readFile(htmlPath, "utf8"));
      if (path === "/widget.meta.json")
        return send(200, "application/json", await readFile(metaPath, "utf8"));
      send(404, "text/plain", "not found");
    } catch (error) {
      // A rebuild in flight can briefly leave the file missing; say so rather
      // than crashing the dev server.
      send(500, "text/plain", error instanceof Error ? error.message : String(error));
    }
  });
  let hostPort: number;
  try {
    hostPort = await listenOnFreePort(hostServer, options.hostPort ?? 5179);
  } catch (caught) {
    await new Promise<void>((done) => sandboxServer.close(() => done()));
    throw caught;
  }
  hostOrigin = `http://localhost:${hostPort}`;

  function hostPage(): string {
    return devHostHtml({
      toolName,
      sandboxOrigin,
      fixtures,
      toolInput,
      uri: initialMeta.uri,
      hasServer: callTool !== undefined,
    });
  }

  return {
    hostUrl: hostOrigin,
    sandboxUrl: sandboxOrigin,
    reload() {
      version += 1;
    },
    async close() {
      await Promise.all([
        new Promise<void>((done) => hostServer.close(() => done())),
        new Promise<void>((done) => sandboxServer.close(() => done())),
      ]);
    },
  };
}

interface HostPageOptions {
  toolName: string;
  sandboxOrigin: string;
  fixtures: Record<string, unknown>;
  toolInput: Record<string, unknown>;
  uri: string;
  hasServer: boolean;
}

function devHostHtml(options: HostPageOptions): string {
  const { toolName, sandboxOrigin, fixtures, toolInput, uri, hasServer } = options;
  const buttons = Object.keys(fixtures)
    .map(
      (name, index) =>
        `<button class="btn" data-fixture="${escapeHtml(name)}"${index === 0 ? ' data-active="true"' : ""}>${escapeHtml(name)}</button>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>mountly-mcp dev · ${escapeHtml(toolName)}</title>
<style>
  :root { color-scheme:light; --bg:#f6f7f9; --fg:#0b0c0f; --muted:#5c6675; --accent:#1d4ed8; --border:#dcdfe5; }
  :root[data-theme="dark"] { color-scheme:dark; --bg:#0b0c0f; --fg:#e6e9ef; --muted:#9aa3b2; --accent:#7aa2ff; --border:#252a33; }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100vh; background:var(--bg); color:var(--fg); font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif; }
  header { padding:18px 24px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
  header h1 { margin:0; font-size:16px; font-weight:600; }
  header code { color:var(--muted); font-size:12px; }
  #fixtures { display:flex; gap:8px; flex-wrap:wrap; }
  .spacer { flex:1; }
  .btn { appearance:none; border:1px solid var(--border); background:transparent; color:var(--fg); padding:6px 12px; border-radius:6px; font:inherit; cursor:pointer; }
  .btn:hover { border-color:var(--accent); color:var(--accent); }
  .btn[data-active="true"] { background:var(--accent); color:white; border-color:var(--accent); }
  main { display:grid; grid-template-columns:minmax(420px,1fr) 360px; gap:20px; padding:24px; align-items:start; }
  iframe { width:100%; height:460px; border:1px solid var(--border); border-radius:12px; background:white; }
  .panel { border:1px solid var(--border); border-radius:12px; padding:16px; }
  .panel + .panel { margin-top:12px; }
  .panel h2 { margin:0 0 8px; font-size:13px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); }
  pre { margin:0; padding:10px; border-radius:8px; font:12px/1.45 ui-monospace,Menlo,Consolas,monospace; overflow:auto; max-height:200px; }
  .log { font:11px/1.5 ui-monospace,Menlo,Consolas,monospace; color:var(--muted); white-space:pre-wrap; max-height:280px; overflow:auto; }
  @media (max-width:880px) { main { grid-template-columns:1fr; padding:16px; } }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(toolName)}</h1>
  <code>${escapeHtml(uri)}</code>
  <span class="spacer"></span>
  <div id="fixtures">${buttons}</div>
  <button class="btn" id="theme" type="button">Theme</button>
  <button class="btn" id="teardown" type="button">Teardown</button>
</header>
<main>
  <iframe id="sandbox" sandbox="allow-scripts allow-same-origin" title="mountly-mcp sandbox proxy"></iframe>
  <div>
    <section class="panel">
      <h2>Last structuredContent</h2>
      <pre id="payload">(none yet)</pre>
    </section>
    <section class="panel">
      <h2>Channel log</h2>
      <div class="log" id="log"></div>
    </section>
  </div>
</main>
<script>
globalThis.__mountlyMcpDevHost__ = ${serializeInlineScriptValue({
    toolName,
    sandboxOrigin,
    fixtures,
    toolInput,
    uri,
    hasServer,
    sandboxPath: "/sandbox-proxy.html",
  })};
const HAS_SERVER = ${hasServer ? "true" : "false"};
</script>
<script src="/host.js"></script>
</body>
</html>
`;
}
/**
 * The proxy document: a shell around the compiled sandbox runtime.
 *
 * Kept separate from {@link sandboxProxyHtml} so the dev server can load the
 * runtime once at startup and still stamp in the host origin per request,
 * which it only learns after binding a port.
 */
function sandboxProxyShell(hostOrigin: string, runtime: string): string {
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

/**
 * The MCP Apps sandbox proxy document (spec §8.4), ready to serve from an
 * origin distinct from the host page.
 *
 * Exported because this is the security boundary — it builds the CSP from the
 * sidecar and decides what the view may execute and reach. Anything standing
 * up a host, including the example harnesses in this repo, should serve this
 * rather than keep a copy that drifts from it.
 */
export async function sandboxProxyHtml(hostOrigin: string): Promise<string> {
  return sandboxProxyShell(hostOrigin, await loadRuntime("sandbox-entry"));
}

export { connectMcpServer, type ConnectedMcpServer } from "./connect-server.js";
