#!/usr/bin/env node
/**
 * `mountly-mcp` — create, add, build, develop, doctor, and verify MCP Apps.
 *
 * Config for build/dev comes from `mountlyMcpViews()` in vite.config.ts.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { startDevHost } from "./dev/index.js";
import type { ConnectedMcpServer } from "./dev/connect-server.js";
import { CLI_ERROR_CODES, cliError } from "./errors.js";
import type { MountlyMcpViteApi, MountlyMcpViewOptions } from "./vite/index.js";

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
  json: boolean;
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
      if (value === undefined) {
        throw cliError(
          CLI_ERROR_CODES.UNKNOWN_OPTION,
          `${arg} needs a value`,
          "See: mountly-mcp --help",
        );
      }
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
    } else {
      throw cliError(
        CLI_ERROR_CODES.UNKNOWN_OPTION,
        `unknown option '${arg}'`,
        "See: mountly-mcp --help",
      );
    }
  }
  return args;
}

function parseVerifyArgs(argv: ReadonlyArray<string>): VerifyArgs {
  const args: VerifyArgs = { html: [], strict: false, render: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = (): string => {
      const value = argv[i + 1];
      if (value === undefined) {
        throw cliError(
          CLI_ERROR_CODES.UNKNOWN_OPTION,
          `${arg} needs a value`,
          "See: mountly-mcp --help",
        );
      }
      i += 1;
      return value;
    };
    if (arg === "--manifest" || arg === "-m") args.manifest = next();
    else if (arg === "--html") args.html.push(next());
    else if (arg === "--strict") args.strict = true;
    else if (arg === "--render") args.render = true;
    else if (arg === "--json") args.json = true;
    else {
      throw cliError(
        CLI_ERROR_CODES.UNKNOWN_OPTION,
        `unknown verify option '${arg}'`,
        "Options: --manifest --html --strict --render --json",
      );
    }
  }
  if (args.manifest && args.html.length > 0) {
    throw cliError(
      CLI_ERROR_CODES.UNKNOWN_OPTION,
      "verify accepts either --manifest or --html, not both",
      "Use: mountly-mcp verify   OR   mountly-mcp verify --html dist/dashboard.html",
    );
  }
  return args;
}

function parseBuildArgs(argv: ReadonlyArray<string>): BuildArgs {
  const args: BuildArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config" || arg === "-c") {
      const value = argv[i + 1];
      if (value === undefined) {
        throw cliError(
          CLI_ERROR_CODES.UNKNOWN_OPTION,
          `${arg} needs a value`,
          "Example: mountly-mcp build --config ./vite.config.ts",
        );
      }
      args.config = value;
      i += 1;
    } else {
      throw cliError(
        CLI_ERROR_CODES.UNKNOWN_OPTION,
        `unknown build option '${arg}'`,
        "Options: --config",
      );
    }
  }
  return args;
}

function printUsage(): void {
  process.stdout.write(`mountly-mcp — create, add, build, develop, doctor, and verify MCP Apps

Usage:
  mountly-mcp create <name> [options]
  mountly-mcp add <name> [options]
  mountly-mcp build [options]
  mountly-mcp dev [options]
  mountly-mcp verify [options]
  mountly-mcp doctor

Create options:
  -f, --framework <name>  react | vue | svelte | vanilla (default: react)
      --dir <path>        output directory (default: ./<name>)

Add options (second View in an existing project):
  -f, --framework <name>  react | vue | svelte | vanilla (default: detect)
      --entry <path>      View entry (default: src/<name>.tsx|ts)
      --uri <ui://...>    resource URI (default: ui://app/<name>)
  -c, --config <path>     vite config (default: auto)

Dev / build options:
  -c, --config <path>    vite config to read the View from (default: auto)
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
      --json             output the conformance report as JSON

Greenfield: prefer \`mountly-mcp create\` — do not clone the Mountly monorepo.

The View's entry, uri and name come from the mountlyMcpViews() plugin in
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
  process.stdout.write(
    args.json ? JSON.stringify(report, null, 2) : formatConformanceReport(report),
  );
  if (!report.ok || (args.strict && report.diagnostics.length > 0)) process.exitCode = 1;
}

/**
 * Read the View's options back out of the vite config. The plugin publishes
 * them on `api.mountlyMcp`, so this stays correct if its option shape changes.
 */
async function loadViewOptions(
  configFile: string | undefined,
  appName: string | undefined,
): Promise<{ options: MountlyMcpViewOptions; outDir: string; root: string }> {
  const { loadConfigFromFile } = await import("vite");
  const loaded = await loadConfigFromFile({ command: "build", mode: "development" }, configFile);
  if (!loaded) {
    throw cliError(
      CLI_ERROR_CODES.NO_VITE_CONFIG,
      "no vite config found",
      "Pass --config, or add mountlyMcpViews() to vite.config.ts. Or: npx mountly-mcp create my-app",
    );
  }
  // Flattened as unknown[]: vite's PluginOption is recursively nested, and
  // asking TS to flatten it by its own type sends the checker infinite.
  const plugins = ((loaded.config.plugins ?? []) as unknown[]).flat(
    Number.POSITIVE_INFINITY,
  ) as Array<{ name?: string; api?: { mountlyMcp?: MountlyMcpViteApi } } | null>;
  const plugin = plugins.find((p) => p?.api?.mountlyMcp);
  if (!plugin?.api?.mountlyMcp) {
    throw cliError(
      CLI_ERROR_CODES.MISSING_VITE_PLUGIN,
      `no mountlyMcpViews() plugin in ${loaded.path}`,
      `Add mountlyMcpViews({ apps: [...] }) from "mountly-mcp/vite" to ${loaded.path}`,
    );
  }
  const apps = plugin.api.mountlyMcp.apps;
  if (apps.length > 1 && appName === undefined) {
    throw cliError(
      CLI_ERROR_CODES.MULTI_VIEW_NEEDS_APP,
      "this build contains several Views",
      `Pass --app <name>. Available: ${apps.map((app) => app.name).join(", ")}`,
    );
  }
  const selected = appName === undefined ? apps[0] : apps.find((app) => app.name === appName);
  if (!selected) {
    throw cliError(
      CLI_ERROR_CODES.UNKNOWN_VIEW,
      `no View named '${String(appName)}'`,
      `Available: ${apps.map((app) => app.name).join(", ")}`,
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
  const { options, outDir, root } = await loadViewOptions(args.config, args.app);
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
  // View exists on disk and the host has something to serve.
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
          throw cliError(
            CLI_ERROR_CODES.NO_TOOL_FOR_VIEW,
            `server '${args.server}' has no tool linked to View '${options.uri}'`,
            `In registerMcpApps tools[], set resourceUri: "${options.uri}" on a model-visible tool`,
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
          `  view     ${htmlPath}\n` +
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
  if (command === "create") {
    const { createProject, parseCreateArgs } = await import("./create.js");
    return createProject(parseCreateArgs(rest));
  }
  if (command === "add") {
    const { addView, parseAddArgs } = await import("./add.js");
    return addView(parseAddArgs(rest));
  }
  if (command === "doctor") {
    const { doctorCommand } = await import("./doctor.js");
    return doctorCommand();
  }
  if (command === "dev") return dev(parseArgs(rest));
  if (command === "build") return buildApps(parseBuildArgs(rest));
  if (command === "verify") return verify(parseVerifyArgs(rest));
  throw cliError(
    CLI_ERROR_CODES.UNKNOWN_COMMAND,
    `unknown command '${command}'`,
    "Try: mountly-mcp create | add | build | dev | verify | doctor",
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
