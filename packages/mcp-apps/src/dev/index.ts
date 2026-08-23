/**
 * A local MCP Apps host, so a View can be developed without installing a
 * real host and restarting it on every change.
 *
 * It is a genuine host, not a preview shim: two origins as the spec requires
 * (§8.4), a sandbox proxy that injects the sidecar's CSP and permissions, the
 * full `ui/initialize` handshake, and tool-input/tool-result delivery. A View
 * that works here works in Claude, and one that reaches for `eval` fails here
 * for the same reason it would fail there.
 *
 * ```ts
 * const host = await startDevHost({ htmlPath: "dist/view.html", fixtures });
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
  /** Built View HTML. Its `.meta.json` sidecar is read alongside. */
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
  // View HTML is read per request rather than baked into the page, so a
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
      if (path === "/view.html")
        return send(200, "text/plain; charset=utf-8", await readFile(htmlPath, "utf8"));
      if (path === "/view.meta.json")
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
        `<button class="chip" type="button" data-fixture="${escapeHtml(name)}"${index === 0 ? ' data-active="true"' : ""}>${escapeHtml(name)}</button>`,
    )
    .join("\n");
  const firstFixture = Object.keys(fixtures)[0] ?? "sample";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(toolName)} · Mountly MCP</title>
<style>
  :root {
    color-scheme: light;
    --bg: #f5f5f5;
    --bg-chat: #efefef;
    --fg: #171717;
    --muted: #737373;
    --accent: #0f766e;
    --accent-soft: #ccfbf1;
    --border: #e5e5e5;
    --surface: #ffffff;
    --user-bg: #171717;
    --user-fg: #fafafa;
    --assistant-fg: #171717;
    --composer: #ffffff;
    --shadow: 0 1px 2px rgb(0 0 0 / 4%), 0 8px 24px rgb(0 0 0 / 6%);
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --bg: #0a0a0a;
    --bg-chat: #111111;
    --fg: #f5f5f5;
    --muted: #a3a3a3;
    --accent: #2dd4bf;
    --accent-soft: #134e4a;
    --border: #262626;
    --surface: #171717;
    --user-bg: #e5e5e5;
    --user-fg: #0a0a0a;
    --assistant-fg: #f5f5f5;
    --composer: #171717;
    --shadow: 0 1px 2px rgb(0 0 0 / 35%), 0 12px 32px rgb(0 0 0 / 35%);
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font: 15px/1.5 "Segoe UI", "Helvetica Neue", system-ui, sans-serif;
  }
  .app {
    display: grid;
    grid-template-rows: auto 1fr auto;
    min-height: 100%;
    max-width: 880px;
    margin: 0 auto;
  }
  .topbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 18px;
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    backdrop-filter: blur(10px);
    position: sticky;
    top: 0;
    z-index: 3;
  }
  .model {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .avatar {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background:
      linear-gradient(135deg, var(--accent-soft), transparent 60%),
      var(--surface);
    border: 1px solid var(--border);
    flex: 0 0 auto;
  }
  .model h1 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -0.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .model .sub {
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .spacer { flex: 1; }
  .icon-btn {
    appearance: none;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--fg);
    width: 34px;
    height: 34px;
    border-radius: 10px;
    font: inherit;
    cursor: pointer;
  }
  .icon-btn:hover { border-color: var(--accent); color: var(--accent); }
  .chat {
    background:
      radial-gradient(900px 420px at 50% -8%, var(--accent-soft), transparent 55%),
      var(--bg-chat);
    padding: 28px 18px 18px;
    display: flex;
    flex-direction: column;
    gap: 22px;
    overflow: auto;
  }
  .turn {
    display: grid;
    grid-template-columns: 32px 1fr;
    gap: 12px;
    align-items: start;
    max-width: 720px;
    width: 100%;
  }
  .turn.user {
    margin-left: auto;
    grid-template-columns: 1fr 32px;
  }
  .turn.user .who { order: 2; }
  .turn.user .body { order: 1; text-align: right; }
  .who {
    width: 32px;
    height: 32px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--muted);
  }
  .turn.user .who {
    background: var(--user-bg);
    color: var(--user-fg);
    border-color: transparent;
  }
  .bubble {
    display: inline-block;
    text-align: left;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 12px 14px;
    box-shadow: var(--shadow);
    color: var(--assistant-fg);
  }
  .turn.user .bubble {
    background: var(--user-bg);
    color: var(--user-fg);
    border-color: transparent;
  }
  .bubble p { margin: 0; }
  .artifact {
    margin-top: 10px;
    border: 1px solid var(--border);
    border-radius: 16px;
    overflow: hidden;
    background: var(--surface);
    box-shadow: var(--shadow);
    text-align: left;
  }
  .artifact-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--bg-chat) 55%, var(--surface));
    color: var(--muted);
    font-size: 12px;
  }
  .artifact-bar .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
  }
  iframe {
    display: block;
    width: 100%;
    height: 420px;
    border: 0;
    background: #fff;
  }
  .composer {
    border-top: 1px solid var(--border);
    background: color-mix(in srgb, var(--composer) 94%, transparent);
    backdrop-filter: blur(10px);
    padding: 12px 18px 16px;
    position: sticky;
    bottom: 0;
  }
  .composer-box {
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: 18px;
    padding: 10px 12px 12px;
    box-shadow: var(--shadow);
  }
  .composer-hint {
    color: var(--muted);
    font-size: 13px;
    margin: 0 0 10px;
  }
  .samples {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .samples .label {
    color: var(--muted);
    font-size: 12px;
    margin-right: 2px;
  }
  #fixtures { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .chip {
    appearance: none;
    border: 1px solid var(--border);
    background: color-mix(in srgb, var(--bg-chat) 40%, var(--surface));
    color: var(--fg);
    padding: 7px 12px;
    border-radius: 999px;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  .chip:hover { border-color: var(--accent); color: var(--accent); }
  .chip[data-active="true"] {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
  :root[data-theme="dark"] .chip[data-active="true"] { color: #042f2e; }
  details.debug {
    margin-top: 10px;
    border: 1px dashed var(--border);
    border-radius: 14px;
    background: transparent;
    overflow: hidden;
  }
  details.debug > summary {
    cursor: pointer;
    list-style: none;
    padding: 10px 12px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
  }
  details.debug > summary::-webkit-details-marker { display: none; }
  .debug-body {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0;
    border-top: 1px solid var(--border);
  }
  .panel { padding: 12px; min-width: 0; }
  .panel + .panel { border-left: 1px solid var(--border); }
  .panel h2 {
    margin: 0 0 8px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  pre {
    margin: 0;
    padding: 10px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--bg-chat) 80%, transparent);
    font: 12px/1.45 ui-monospace, Menlo, Consolas, monospace;
    overflow: auto;
    max-height: 180px;
  }
  .log {
    font: 11px/1.5 ui-monospace, Menlo, Consolas, monospace;
    color: var(--muted);
    white-space: pre-wrap;
    max-height: 180px;
    overflow: auto;
  }
  @media (max-width: 720px) {
    .debug-body { grid-template-columns: 1fr; }
    .panel + .panel { border-left: 0; border-top: 1px solid var(--border); }
    .turn, .turn.user { grid-template-columns: 28px 1fr; }
    .turn.user .who { order: 0; }
    .turn.user .body { order: 0; text-align: left; }
  }
</style>
</head>
<body>
<div class="app">
  <header class="topbar">
    <div class="model">
      <div class="avatar" aria-hidden="true"></div>
      <div>
        <h1>Mountly · ${escapeHtml(toolName)}</h1>
        <div class="sub">${escapeHtml(uri)}</div>
      </div>
    </div>
    <span class="spacer"></span>
    <button class="icon-btn" id="theme" type="button" title="Toggle theme" aria-label="Toggle theme">◐</button>
    <button class="icon-btn" id="teardown" type="button" title="Teardown" aria-label="Teardown">×</button>
  </header>

  <main class="chat">
    <div class="turn user">
      <div class="who" aria-hidden="true">You</div>
      <div class="body">
        <div class="bubble">
          <p>Call <strong>${escapeHtml(toolName)}</strong> with sample “${escapeHtml(firstFixture)}”.</p>
        </div>
      </div>
    </div>

    <div class="turn assistant">
      <div class="who" aria-hidden="true">AI</div>
      <div class="body">
        <div class="bubble">
          <p>Here’s the interactive result from that tool.</p>
          <div class="artifact">
            <div class="artifact-bar"><span class="dot" aria-hidden="true"></span> MCP App · inline</div>
            <iframe id="sandbox" sandbox="allow-scripts allow-same-origin" title="mountly-mcp sandbox proxy"></iframe>
          </div>
        </div>
      </div>
    </div>
  </main>

  <footer class="composer">
    <div class="composer-box">
      <p class="composer-hint">Ask another sample — same as switching fixtures in a real host.</p>
      <div class="samples">
        <span class="label">Samples</span>
        <div id="fixtures">${buttons || '<span class="label">No fixtures — add mcp.fixtures.json</span>'}</div>
      </div>
      <details class="debug">
        <summary>Protocol debug</summary>
        <div class="debug-body">
          <section class="panel">
            <h2>Last structuredContent</h2>
            <pre id="payload">(none yet)</pre>
          </section>
          <section class="panel">
            <h2>Channel log</h2>
            <div class="log" id="log"></div>
          </section>
        </div>
      </details>
    </div>
  </footer>
</div>
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
