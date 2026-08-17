import { rm } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import type { BuildEnvironment, Plugin, UserConfig } from "vite";
import { MCP_APP_MANIFEST_FILE, writeMcpAppManifest } from "../artifact/index.js";
import type { McpAppArtifact } from "../artifact/index.js";
import { buildMcpResourceFromSource } from "../build/index.js";
import type { BuildSelfContainedOptions } from "../build/index.js";

export interface MountlyMcpWidgetOptions extends Omit<
  BuildSelfContainedOptions,
  "entry" | "output" | "cssEntry"
> {
  entry: string;
  output?: string;
  cleanIntermediate?: boolean;
}

export interface MountlyMcpWidgetsOptions {
  apps: ReadonlyArray<MountlyMcpWidgetOptions>;
  /** Defaults to `<outDir>/mountly-mcp.manifest.json`; false disables it. */
  manifest?: string | false;
}

export type MountlyMcpViteOptions = MountlyMcpWidgetOptions | MountlyMcpWidgetsOptions;

export interface MountlyMcpViteApi {
  apps: ReadonlyArray<MountlyMcpWidgetOptions>;
  manifest?: string | false;
}

function isCollection(options: MountlyMcpViteOptions): options is MountlyMcpWidgetsOptions {
  return "apps" in options;
}

function safeBuildName(name: string, index: number): string {
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `mountly_mcp_${index}_${safe || "app"}`;
}

function outputPath(root: string, outDir: string, app: MountlyMcpWidgetOptions): string {
  if (!app.output) return join(outDir, `${basename(app.name)}.html`);
  return isAbsolute(app.output) ? app.output : resolve(root, app.output);
}

/**
 * Build one or many independent MCP Apps Views. Each View is a Vite build
 * environment, so frameworks and CSS remain isolated while callers configure
 * the collection once.
 */
export function mountlyMcpWidget(options: MountlyMcpViteOptions): Plugin {
  const configuredApps = isCollection(options) ? [...options.apps] : [options];
  const selectedForDev = process.env.MOUNTLY_MCP_SELECTED_APP;
  const apps = selectedForDev
    ? configuredApps.filter((app) => app.name === selectedForDev)
    : configuredApps;
  const manifestOption = isCollection(options) ? options.manifest : undefined;
  if (apps.length === 0) throw new Error("mountly-mcp: apps must contain at least one View");

  const names = new Set<string>();
  const uris = new Set<string>();
  for (const app of apps) {
    if (!app.uri.startsWith("ui://")) {
      throw new Error(
        `mountly-mcp: UI resource uri must use the 'ui://' scheme (received '${app.uri}')`,
      );
    }
    if (names.has(app.name)) throw new Error(`mountly-mcp: duplicate app name '${app.name}'`);
    if (uris.has(app.uri)) throw new Error(`mountly-mcp: duplicate app uri '${app.uri}'`);
    names.add(app.name);
    uris.add(app.uri);
  }

  const environments = apps.map((app, index) => ({
    app,
    name: safeBuildName(app.name, index),
    jsFile: `widget-${index}-${basename(app.name)}.js`,
    cssFile: `widget-${index}-${basename(app.name)}.css`,
  }));
  const byEnvironment = new Map(environments.map((environment) => [environment.name, environment]));
  const emitted = new Map<
    string,
    { js?: string; css?: string; jsFile?: string; cssFile?: string; names: string[] }
  >();
  const artifacts = new Map<string, McpAppArtifact>();
  let root = process.cwd();
  let outDir = resolve(root, "dist");
  let manifestWritten = false;

  function currentEnvironment(context: unknown) {
    const name = (context as { environment?: { name?: string } }).environment?.name;
    return (
      (name ? byEnvironment.get(name) : undefined) ??
      (environments.length === 1 ? environments[0] : undefined)
    );
  }

  const plugin: Plugin = {
    name: "mountly-mcp-widget",
    api: {
      // The CLI consumes this documented plugin interface instead of scraping
      // Vite's resolved build settings.
      mountlyMcp: { apps: configuredApps, manifest: manifestOption } satisfies MountlyMcpViteApi,
    },
    // After Vite core plugins: css-post writes the stylesheet in its own
    // closeBundle, and this plugin has to see the file to inline it.
    enforce: "post",
    // Only meaningful during `vite build`; a dev server has no bundle to emit.
    apply: "build",

    config(_config, env): UserConfig {
      const first = environments[0];
      if (!first) throw new Error("mountly-mcp: configure at least one app");
      return {
        // Vite's lib mode leaves `process.env.NODE_ENV` for a consuming bundler
        // to replace. There isn't one — the bundle is inlined into HTML and run
        // in a sandboxed iframe, where `process` is undefined and React and Vue
        // throw on their first environment check.
        define: { "process.env.NODE_ENV": JSON.stringify(env.mode) },
        // Legacy `vite build` builds one environment. Preserve that zero-config
        // path for single-View projects; multi-View projects use
        // `mountly-mcp build`, which drives the environments below.
        build: {
          lib: {
            entry: first.app.entry,
            // IIFE so the bundle inlines into a single <script> with no import
            // graph left to resolve inside the sandboxed iframe.
            formats: ["iife"] as const,
            name: "__mountlyMcpEntry0",
            fileName: () => first.jsFile,
            // Named explicitly: otherwise a lib build derives the stylesheet
            // name from package.json and fails outright when there isn't one.
            cssFileName: first.cssFile.replace(/\.css$/, ""),
          },
          // One stylesheet to inline; per-chunk CSS would strand imports.
          cssCodeSplit: false,
        },
        builder: {
          sharedPlugins: true,
          async buildApp(builder) {
            for (const environment of environments) {
              const target = builder.environments[environment.name] as BuildEnvironment | undefined;
              if (!target)
                throw new Error(`mountly-mcp: missing Vite environment '${environment.name}'`);
              await builder.build(target);
            }
          },
        },
        environments: Object.fromEntries(
          environments.map((environment, index) => [
            environment.name,
            {
              // A custom environment defaults to a server consumer, which
              // externalizes node_modules — React and Vue would become bare
              // globals and the view would die on `vue is not defined`. A
              // `ui://` resource has no import graph at runtime, so everything
              // must be bundled in.
              consumer: "client" as const,
              resolve: { noExternal: true as const },
              build: {
                emptyOutDir: index === 0,
                lib: {
                  entry: environment.app.entry,
                  formats: ["iife"] as const,
                  name: `__mountlyMcpEntry${index}`,
                  fileName: () => environment.jsFile,
                  cssFileName: environment.cssFile.replace(/\.css$/, ""),
                },
                cssCodeSplit: false,
              },
            },
          ]),
        ),
      };
    },

    configResolved(config) {
      root = config.root;
      outDir = resolve(config.root, config.build.outDir);
    },

    buildStart() {
      const name = (this as { environment?: { name?: string } }).environment?.name;
      if (apps.length > 1 && !byEnvironment.has(String(name))) {
        this.error(
          "mountly-mcp: multi-View builds require 'mountly-mcp build' (or 'vite build --app') so Vite builds every environment",
        );
      }
    },

    generateBundle: {
      order: "post",
      handler(_outputOptions, bundle) {
        const environment = currentEnvironment(this);
        if (!environment) return;
        const chunk =
          bundle[environment.jsFile] ??
          Object.values(bundle).find((item) => item.type === "chunk" && item.isEntry);
        const cssAsset =
          bundle[environment.cssFile] ??
          Object.values(bundle).find(
            (item) => item.type === "asset" && item.fileName.endsWith(".css"),
          );
        emitted.set(environment.name, {
          js: chunk && "code" in chunk ? chunk.code : undefined,
          css: cssAsset && "source" in cssAsset ? cssAsset.source.toString() : undefined,
          jsFile: chunk?.fileName,
          cssFile: cssAsset?.fileName,
          names: Object.keys(bundle),
        });
      },
    },

    async closeBundle() {
      const environment = currentEnvironment(this);
      if (!environment || artifacts.has(environment.name)) return;
      const source = emitted.get(environment.name);
      if (source?.js === undefined) {
        this.error(
          `mountly-mcp: the build emitted no ${environment.jsFile} for '${environment.app.entry}'. Emitted: ${source?.names.join(", ") || "nothing"}`,
        );
        return;
      }
      const {
        entry: _entry,
        output: _output,
        cleanIntermediate = true,
        ...resourceOptions
      } = environment.app;
      const result = await buildMcpResourceFromSource({
        ...resourceOptions,
        js: source.js,
        css: source.css,
        output: outputPath(root, outDir, environment.app),
      });
      artifacts.set(environment.name, result.artifact);
      if (cleanIntermediate) {
        if (source.jsFile) await rm(join(outDir, source.jsFile), { force: true });
        if (source.cssFile) await rm(join(outDir, source.cssFile), { force: true });
      }
      this.info?.(`mountly-mcp: ${environment.app.uri} → ${result.htmlPath}`);

      if (!manifestWritten && artifacts.size === environments.length && manifestOption !== false) {
        manifestWritten = true;
        const path = manifestOption
          ? isAbsolute(manifestOption)
            ? manifestOption
            : resolve(root, manifestOption)
          : join(outDir, MCP_APP_MANIFEST_FILE);
        await writeMcpAppManifest(
          path,
          environments.map((item) => artifacts.get(item.name) as McpAppArtifact),
        );
        this.info?.(`mountly-mcp: manifest → ${path}`);
      }
    },
  };

  return plugin;
}
