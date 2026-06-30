import type { Plugin, UserConfig } from "vite";
import { readFileSync } from "node:fs";
import { exportKeyToSubpath } from "mountly-manifest";
import { mountlyManifestFragmentPlugin } from "./fragment.js";
export { mountlyHostPlugin, type MountlyHostPluginOptions } from "./host.js";
export { mountlyManifestFragmentPlugin, type ManifestFragmentPluginOptions } from "./fragment.js";

export type MountlyWidgetFramework = "react" | "vue" | "svelte";

const PLATFORM_EXTERNALS = ["mountly", /^mountly\//];

const FRAMEWORK_EXTERNALS: Record<MountlyWidgetFramework, string[]> = {
  react: ["react", "react/jsx-runtime", "react-dom", "react-dom/client", "mountly-react"],
  vue: ["vue", "mountly-vue"],
  svelte: ["svelte", "mountly-svelte"],
};

const FRAMEWORK_BUNDLE: Record<MountlyWidgetFramework, string[]> = {
  react: ["react", "react/jsx-runtime", "react-dom", "react-dom/client"],
  vue: ["vue"],
  svelte: ["svelte"],
};

export function getFrameworkPeerExternals(
  framework: MountlyWidgetFramework,
): Array<string | RegExp> {
  return [...PLATFORM_EXTERNALS, ...FRAMEWORK_EXTERNALS[framework]];
}

export function getSelfContainedExternals(
  framework: MountlyWidgetFramework,
): Array<string | RegExp> {
  return [
    ...PLATFORM_EXTERNALS,
    ...FRAMEWORK_EXTERNALS[framework].filter((id) => !FRAMEWORK_BUNDLE[framework].includes(id)),
  ];
}

export function mountlyCssAsText(): Plugin {
  return {
    name: "mountly-css-as-text",
    enforce: "pre",
    load(id) {
      if (!id.endsWith(".css")) return null;
      const source = readFileSync(id, "utf8");
      return {
        code: `export default ${JSON.stringify(source)};`,
        map: { mappings: "" },
      };
    },
  };
}

export interface MountlyWidgetPluginOptions {
  framework?: MountlyWidgetFramework;
}

export function mountlyWidgetPlugin(_options: MountlyWidgetPluginOptions = {}): Plugin[] {
  return [mountlyCssAsText()];
}

export interface MountlyRemotePluginOptions {
  /** Remote id — the bare specifier the host imports (e.g. `"checkout"` → `import("checkout")`). */
  name: string;
  /**
   * Modules this remote exposes, as import-map subpaths → source files.
   * `"."` is the root specifier; `"./Cart"` becomes `import("checkout/Cart")`.
   */
  exposes: Record<string, string>;
  framework?: MountlyWidgetFramework;
  team?: string;
  version?: string;
  /** Named export from the root entry that is an `OnDemandFeature` (enables `<mountly-feature>`). */
  featureExport?: string;
  outDir?: string;
  minify?: boolean;
  sourcemap?: boolean;
}

/**
 * Drop-in Vite plugin for a mountly remote. Add it to `vite.config` and run `vite build` —
 * no separate build script. It builds every `exposes` entry with the framework peers
 * externalized (the host shares React/Vue/Svelte through its import map, so there is no
 * `shared` config to keep in sync) and emits `mountly.manifest.fragment.json` for the host
 * to compose. The host imports each entry as native ESM, fully typed.
 *
 * ```ts
 * // vite.config.ts
 * export default defineConfig({
 *   plugins: [react(), mountlyRemote({
 *     name: "checkout",
 *     exposes: { ".": "src/index.ts", "./Cart": "src/Cart.tsx" },
 *   })],
 * });
 * ```
 */
export function mountlyRemote(options: MountlyRemotePluginOptions): Plugin[] {
  const framework = options.framework ?? "react";
  const outDir = options.outDir ?? "dist";
  const mainEntry = options.exposes["."];
  if (!mainEntry) {
    throw new Error('[mountly:remote] `exposes` must include a "." root entry');
  }

  const entry: Record<string, string> = {};
  const exportManifestPaths: Record<string, string> = {};
  const subpathExposes: Record<string, string> = {};
  for (const [key, src] of Object.entries(options.exposes)) {
    if (key === ".") {
      entry.index = src;
      continue;
    }
    const subpath = exportKeyToSubpath(key);
    entry[subpath] = src;
    exportManifestPaths[key] = `./${subpath}.js`;
    subpathExposes[key] = src;
  }

  return [
    mountlyCssAsText(),
    mountlyManifestFragmentPlugin({
      verticalId: options.name,
      url: "./index.js",
      entry: mainEntry,
      team: options.team,
      version: options.version,
      featureExport: options.featureExport,
      exports: exportManifestPaths,
      exposeEntries: subpathExposes,
      outDir,
    }),
    {
      name: "mountly:remote",
      config() {
        return {
          build: {
            outDir,
            emptyOutDir: true,
            minify: options.minify ?? true,
            sourcemap: options.sourcemap ?? true,
            target: "es2020",
            lib: {
              entry,
              formats: ["es"],
              fileName: (_format, entryName) => `${entryName}.js`,
            },
            rollupOptions: { external: getFrameworkPeerExternals(framework) },
          },
        };
      },
    },
  ];
}

export interface DefineMountlyWidgetConfigOptions {
  framework?: MountlyWidgetFramework;
  entry?: string;
  outDir?: string;
  minify?: boolean;
  sourcemap?: boolean;
  /** Subpath exposes for import-map hosts: `"./Checkout": "src/Checkout.tsx"`. */
  exposes?: Record<string, string>;
  /** Vertical id for emitted manifest fragment (defaults to package name). */
  verticalId?: string;
  team?: string;
  version?: string;
  /** Named export that satisfies FeatureModule when using moduleUrl loading. */
  featureExport?: string;
}

export function defineMountlyWidgetConfig(
  options: DefineMountlyWidgetConfigOptions = {},
): UserConfig[] {
  const {
    framework = "react",
    entry = "src/index.ts",
    outDir = "dist",
    minify = true,
    sourcemap = true,
    exposes = {},
    verticalId = "widget",
    team,
    version,
    featureExport,
  } = options;

  const peerExternals = getFrameworkPeerExternals(framework);
  const selfContainedExternals = getSelfContainedExternals(framework);
  const externalize = (externals: Array<string | RegExp>) => ({
    rollupOptions: { external: externals },
    rolldownOptions: { external: externals },
  });
  const sharedBuild = {
    outDir,
    emptyOutDir: false,
    minify,
    sourcemap,
    target: "es2020" as const,
    lib: {
      entry,
      formats: ["es" as const],
    },
  };

  const exportManifestPaths: Record<string, string> = {};
  for (const exportKey of Object.keys(exposes)) {
    exportManifestPaths[exportKey] = `./${exportKeyToSubpath(exportKey)}.js`;
  }

  const configs: UserConfig[] = [
    {
      plugins: [...mountlyWidgetPlugin({ framework })],
      build: {
        ...sharedBuild,
        emptyOutDir: true,
        lib: {
          entry,
          formats: ["es"],
          fileName: () => "index.js",
        },
        ...externalize(selfContainedExternals),
      },
    },
    {
      plugins: [
        ...mountlyWidgetPlugin({ framework }),
        mountlyManifestFragmentPlugin({
          verticalId,
          url: "./peer.js",
          entry,
          team,
          version,
          featureExport,
          exports: exportManifestPaths,
          exposeEntries: exposes,
          outDir,
        }),
      ],
      build: {
        ...sharedBuild,
        lib: {
          entry,
          formats: ["es"],
          fileName: () => "peer.js",
        },
        ...externalize(peerExternals),
      },
    },
  ];

  for (const [exportKey, exportEntry] of Object.entries(exposes)) {
    const subpath = exportKeyToSubpath(exportKey);
    configs.push({
      plugins: [...mountlyWidgetPlugin({ framework })],
      build: {
        ...sharedBuild,
        lib: {
          entry: exportEntry,
          formats: ["es"],
          fileName: () => `${subpath}.js`,
        },
        ...externalize(peerExternals),
      },
    });
  }

  return configs;
}
