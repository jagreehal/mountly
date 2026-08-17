#!/usr/bin/env node
/**
 * `mountly-mcp dev` — build the widget, serve it in a real sandboxed MCP Apps
 * host, and rebuild on change.
 *
 * Config comes from the `mountlyMcpWidget()` plugin already in vite.config.ts,
 * so there is nothing new to configure.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { startDevHost } from "./dev/index.js";
import type { ConnectedMcpServer } from "./dev/connect-server.js";
import type { MountlyMcpViteApi, MountlyMcpWidgetOptions } from "./vite/index.js";

interface Args {
  config?: string;
  fixtures?: string;
  server?: string;
  app?: string;
  port?: number;
  open: boolean;
}

interface VerifyArgs {
  manifest?: string;
  html: string[];
  strict: boolean;
  render: boolean;
}

interface BuildArgs {
  config?: string;
}

function parseArgs(argv: ReadonlyArray<string>): Args {
  const args: Args = { open: true };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = (): string => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`mountly-mcp: ${arg} needs a value`);
      i += 1;
      return value;
    };
    if (arg === "--config" || arg === "-c") args.config = next();
    else if (arg === "--fixtures" || arg === "-f") args.fixtures = next();
    else if (arg === "--server" || arg === "-s") args.server = next();
    else if (arg === "--app" || arg === "-a") args.app = next();
    else if (arg === "--port" || arg === "-p") args.port = Number(next());
    else if (arg === "--no-open") args.open = false;
    else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else throw new Error(`mountly-mcp: unknown option '${arg}'`);
  }
  return args;
}

function parseVerifyArgs(argv: ReadonlyArray<string>): VerifyArgs {
  const args: VerifyArgs = { html: [], strict: false, render: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = (): string => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`mountly-mcp: ${arg} needs a value`);
      i += 1;
      return value;
    };
    if (arg === "--manifest" || arg === "-m") args.manifest = next();
    else if (arg === "--html") args.html.push(next());
    else if (arg === "--strict") args.strict = true;
    else if (arg === "--render") args.render = true;
    else throw new Error(`mountly-mcp: unknown verify option '${arg}'`);
  }
  if (args.manifest && args.html.length > 0) {
    throw new Error("mountly-mcp: verify accepts either --manifest or --html, not both");
  }
  return args;
}

function parseBuildArgs(argv: ReadonlyArray<string>): BuildArgs {
  const args: BuildArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config" || arg === "-c") {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`mountly-mcp: ${arg} needs a value`);
      args.config = value;
      i += 1;
    } else throw new Error(`mountly-mcp: unknown build option '${arg}'`);
  }
  return args;
}

function printUsage(): void {
  process.stdout.write(`mountly-mcp — build, develop, and verify MCP Apps

Usage:
  mountly-mcp build [options]
  mountly-mcp dev [options]
  mountly-mcp verify [options]

Options:
  -c, --config <path>    vite config to read the widget from (default: auto)
  -f, --fixtures <path>  JSON of named samples (default: mcp.fixtures.json)
  -s, --server <path>    module default-exporting your MCP server, to call real tools
  -a, --app <name>       View to develop (required when the manifest has several)
  -p, --port <number>    host port (default: 5179; the sandbox takes the next one)
      --no-open          don't open a browser
  -h, --help             show this

Verify options:
  -m, --manifest <path>  manifest to verify (default: dist/mountly-mcp.manifest.json)
      --html <path>      transitional single-View HTML; repeat for several
      --strict           fail when warnings are present
      --render           require each View to mount with content in Chromium (needs playwright)

The widget's entry, uri and name come from the mountlyMcpWidget() plugin in
your vite config, so there is nothing extra to configure.

Without --server each fixture value is delivered as structuredContent. With
--server it is the tool's arguments instead, the view receives what the real
tool returns, and tool calls the view makes itself are routed to your server.
`);
}

async function buildApps(args: BuildArgs): Promise<void> {
  const { createBuilder } = await import("vite");
  const builder = await createBuilder({ configFile: args.config }, false);
  await builder.buildApp();
}

async function verify(args: VerifyArgs): Promise<void> {
  const { formatConformanceReport, verifyMcpApps } = await import("./testing/index.js");
  const report = await verifyMcpApps({
    manifestPath: args.manifest,
    htmlPaths: args.html.length > 0 ? args.html : undefined,
    render: args.render,
  });
  process.stdout.write(formatConformanceReport(report));
  if (!report.ok || (args.strict && report.diagnostics.length > 0)) process.exitCode = 1;
}

/**
 * Read the widget's options back out of the vite config. The plugin publishes
 * them on `api.mountlyMcp`, so this stays correct if its option shape changes.
 */
async function loadWidgetOptions(
  configFile: string | undefined,
  appName: string | undefined,
): Promise<{ options: MountlyMcpWidgetOptions; outDir: string; root: string }> {
  const { loadConfigFromFile } = await import("vite");
  const loaded = await loadConfigFromFile({ command: "build", mode: "development" }, configFile);
  if (!loaded) {
    throw new Error(
      "mountly-mcp: no vite config found. Pass --config, or add mountlyMcpWidget() to vite.config.ts.",
    );
  }
  // Flattened as unknown[]: vite's PluginOption is recursively nested, and
  // asking TS to flatten it by its own type sends the checker infinite.
  const plugins = ((loaded.config.plugins ?? []) as unknown[]).flat(
    Number.POSITIVE_INFINITY,
  ) as Array<{ name?: string; api?: { mountlyMcp?: MountlyMcpViteApi } } | null>;
  const plugin = plugins.find((p) => p?.api?.mountlyMcp);
  if (!plugin?.api?.mountlyMcp) {
    throw new Error(
      `mountly-mcp: no mountlyMcpWidget() plugin in ${loaded.path}. Add it to the plugins array.`,
    );
  }
  const apps = plugin.api.mountlyMcp.apps;
  if (apps.length > 1 && appName === undefined) {
    throw new Error(
      `mountly-mcp: this build contains several Views; pass --app <name>. Available: ${apps.map((app) => app.name).join(", ")}`,
    );
  }
  const selected = appName === undefined ? apps[0] : apps.find((app) => app.name === appName);
  if (!selected) {
    throw new Error(
      `mountly-mcp: no View named '${String(appName)}'. Available: ${apps.map((app) => app.name).join(", ")}`,
    );
  }
  return {
    options: selected,
    outDir: (loaded.config.build?.outDir as string | undefined) ?? "dist",
    root: (loaded.config.root as string | undefined) ?? process.cwd(),
  };
}

/**
 * Vite empties the out dir at the start of every build and the plugin writes
 * the resource in `closeBundle`, so the watcher's END event can arrive while
 * the files are still missing. Wait for the artifact rather than trusting the
 * event ordering — this also covers a build that failed and wrote nothing.
 */
async function waitForFile(path: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await readFile(path);
      return;
    } catch {
      if (Date.now() > deadline) throw new Error(`mountly-mcp: timed out waiting for ${path}`);
      await new Promise((done) => setTimeout(done, 50));
    }
  }
}

async function loadFixtures(path: string | undefined): Promise<Record<string, unknown>> {
  const file = path ?? "mcp.fixtures.json";
  try {
    return JSON.parse(await readFile(resolve(file), "utf8")) as Record<string, unknown>;
  } catch (error) {
    // An explicit --fixtures that doesn't load is a mistake worth reporting;
    // the default one simply being absent is not.
    if (path) throw new Error(`mountly-mcp: could not read fixtures '${file}': ${String(error)}`);
    return {};
  }
}

async function dev(args: Args): Promise<void> {
  const { options, outDir, root } = await loadWidgetOptions(args.config, args.app);
  const fixtures = await loadFixtures(args.fixtures);

  // Connected after the first build, not here: a server module typically reads
  // the View it serves, which does not exist yet on a cold checkout.
  let server: ConnectedMcpServer | undefined;
  let toolName: string | undefined;

  const { build } = await import("vite");
  const htmlPath = options.output
    ? resolve(root, options.output)
    : resolve(root, outDir, `${options.name}.html`);

  // A watching build: vite rebuilds on change, and each rebuild bumps the
  // version the browser is polling, which reloads it.
  let host: Awaited<ReturnType<typeof startDevHost>> | undefined;
  let started = false;

  const previousSelectedApp = process.env.MOUNTLY_MCP_SELECTED_APP;
  process.env.MOUNTLY_MCP_SELECTED_APP = options.name;
  const watcher = await build({
    configFile: args.config ?? undefined,
    build: { watch: {} },
    logLevel: "warn",
  }).finally(() => {
    if (previousSelectedApp === undefined) delete process.env.MOUNTLY_MCP_SELECTED_APP;
    else process.env.MOUNTLY_MCP_SELECTED_APP = previousSelectedApp;
  });

  // `build({ watch })` returns a rollup watcher; the first BUNDLE_END means the
  // widget exists on disk and the host has something to serve.
  const rollupWatcher = watcher as unknown as {
    on(event: "event", cb: (e: { code: string; error?: Error }) => void): void;
    close(): Promise<void>;
  };

  rollupWatcher.on("event", (event) => {
    if (event.code === "ERROR") {
      process.stderr.write(`mountly-mcp: build failed — ${event.error?.message ?? "unknown"}\n`);
      return;
    }
    if (event.code !== "END") return;
    if (started) {
      void waitForFile(`${htmlPath}.meta.json`).then(
        () => {
          host?.reload();
          process.stdout.write("mountly-mcp: rebuilt\n");
        },
        (error: unknown) => process.stderr.write(`${String(error)}\n`),
      );
      return;
    }
    started = true;
    void (async () => {
      await waitForFile(`${htmlPath}.meta.json`);
      if (args.server) {
        const { connectMcpServer } = await import("./dev/connect-server.js");
        server = await connectMcpServer(args.server);
        toolName = await server.toolFor(options.uri);
        if (!toolName) {
          throw new Error(
            `mountly-mcp: server '${args.server}' has no tool linked to View '${options.uri}'`,
          );
        }
      }
      host = await startDevHost({
        htmlPath,
        fixtures,
        toolInput: {},
        toolName,
        callTool: server?.callTool,
        hostPort: args.port,
      });
      process.stdout.write(
        `\n  mountly-mcp dev\n` +
          `  host     ${host.hostUrl}\n` +
          `  sandbox  ${host.sandboxUrl}\n` +
          `  widget   ${htmlPath}\n` +
          `  fixtures ${Object.keys(fixtures).length || "none — pass --fixtures"}\n` +
          `  server   ${server ? `${args.server} → ${toolName ?? "no tool bound to " + options.uri}` : "none — fixtures deliver directly"}\n\n` +
          `  watching for changes; ctrl+c to stop\n\n`,
      );
      if (args.open) {
        const { spawn } = await import("node:child_process");
        const opener =
          process.platform === "darwin"
            ? "open"
            : process.platform === "win32"
              ? "start"
              : "xdg-open";
        spawn(opener, [host.hostUrl], { stdio: "ignore", detached: true, shell: true }).unref();
      }
    })().catch((error: unknown) => {
      // Startup runs inside a watcher callback, where a rejection would
      // otherwise be silent and leave the process alive with no host.
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      void Promise.all([rollupWatcher.close(), server?.close()]).finally(() => process.exit(1));
    });
  });

  const shutdown = (): void => {
    void (async () => {
      await rollupWatcher.close();
      await host?.close();
      await server?.close();
      process.exit(0);
    })();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  if (command === undefined || command === "--help" || command === "-h") {
    printUsage();
    process.exit(command === undefined ? 1 : 0);
  }
  if (command === "dev") return dev(parseArgs(rest));
  if (command === "build") return buildApps(parseBuildArgs(rest));
  if (command === "verify") return verify(parseVerifyArgs(rest));
  process.stderr.write(`mountly-mcp: unknown command '${command}'. Try 'mountly-mcp --help'.\n`);
  process.exit(1);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
