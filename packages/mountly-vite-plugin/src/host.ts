import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { HmrContext, Plugin, ResolvedConfig } from "vite";
import {
  codegenManifestTypes,
  composeManifestFromFragments,
  defaultReactPlatformImports,
  exportKeyToSubpath,
  manifestRemoteSpecifiers,
  manifestToImportMap,
  mergeManifests,
  parseManifest,
  resolveExportUrl,
  resolveRemoteImport,
  type ComposePlatformOptions,
  type MountlyManifest,
  type VerticalEntry,
} from "mountly-manifest";

export type MountlyHostPlatformOptions = ComposePlatformOptions;

export interface MountlyHostFragmentOptions {
  /** Path to a built `mountly.manifest.fragment.json`, relative to the Vite root. */
  fragment: string;
}

export interface MountlyHostPluginOptions {
  /** Path to mountly-manifest v2 JSON (relative to the Vite root). */
  manifest?: string;
  /**
   * Auto-compose a host manifest from built vertical fragments.
   * React platform imports are filled in automatically.
   */
  verticals?: MountlyHostFragmentOptions[];
  /**
   * Declare remotes by published URL (federation-style): `{ checkout: "https://cdn/checkout/" }`.
   * The host fetches each remote's `mountly.manifest.fragment.json` (the file `mountlyRemote`
   * emits), so it auto-discovers the remote's exposes, types, and entry — no local fragment
   * file, no `shared` config. Each key becomes the import specifier (`import("checkout/Cart")`).
   * The value is the directory URL the remote's `dist/` is served from, or a direct fragment URL.
   */
  remotes?: Record<string, string>;
  /** Platform import-map settings used in auto-compose mode. */
  platform?: MountlyHostPlatformOptions;
  /**
   * Dev-only origin overrides per vertical id (e.g. `{ payments: "http://localhost:5001" }`).
   * Subpath exports resolve against this origin when the manifest URL is CDN-relative.
   */
  devOrigins?: Record<string, string>;
  /** Inject `<script type="importmap">` during production HTML transform. Default true. */
  injectImportMap?: boolean;
  /**
   * Generate ambient module declarations for manifest remotes.
   * Default: `src/mountly-remotes.d.ts` when `src/` exists, otherwise `mountly-remotes.d.ts`.
   */
  types?:
    | boolean
    | {
        outFile?: string;
        strict?: boolean;
      };
  /** Throw when a fragment file is missing. Default true. */
  strictFragments?: boolean;
  /** Write the composed manifest JSON to this path (relative to Vite root) for CI or plain HTML hosts. */
  writeManifest?: string;
}

function loadManifest(manifestPath: string, root: string): MountlyManifest {
  const absolute = resolve(root, manifestPath);
  const raw = JSON.parse(readFileSync(absolute, "utf8"));
  return parseManifest(raw);
}

function resolveTypesOutFile(
  root: string,
  manifestPath: string | undefined,
  types: MountlyHostPluginOptions["types"],
): string | null {
  if (types === false) return null;
  if (typeof types === "object" && types.outFile) {
    return resolve(root, types.outFile);
  }

  const srcDir = join(root, "src");
  if (existsSync(srcDir)) return join(srcDir, "mountly-remotes.d.ts");
  if (manifestPath) return join(dirname(resolve(root, manifestPath)), "mountly-remotes.d.ts");
  return join(root, "mountly-remotes.d.ts");
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function extractExportNames(
  value:
    | string[]
    | {
        declaration?: string;
        names?: string[];
      }
    | undefined,
): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : (value.names ?? []);
}

function exportNamesForVertical(
  vertical: MountlyManifest["verticals"][number],
  exportKey?: string,
): string[] {
  if (!exportKey) {
    const names = new Set(vertical.types?.module ?? []);
    if (vertical.featureExport) names.add(vertical.featureExport);
    return [...names];
  }
  return extractExportNames(vertical.types?.exports?.[exportKey]);
}

function extractDeclarationPath(
  vertical: MountlyManifest["verticals"][number],
  exportKey?: string,
): string | null {
  const types = (vertical as { types?: unknown }).types as
    | {
        declaration?: string;
        exports?: Record<string, unknown>;
      }
    | undefined;
  if (!exportKey) return types?.declaration ?? "./types/index.d.ts";
  const value = types?.exports?.[exportKey];
  if (!value || Array.isArray(value)) {
    return `./types/${exportKeyToSubpath(exportKey)}.d.ts`;
  }
  return (
    (value as { declaration?: string }).declaration ??
    `./types/${exportKeyToSubpath(exportKey)}.d.ts`
  );
}

function applyRemoteOrigin(url: string, remoteOrigin: string | undefined): string {
  if (!remoteOrigin) return url;
  if (url.startsWith("/")) {
    return `${remoteOrigin.replace(/\/$/, "")}${url}`;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const parsed = new URL(url);
      return `${remoteOrigin.replace(/\/$/, "")}${parsed.pathname}${parsed.search}`;
    } catch {
      return url;
    }
  }
  return `${remoteOrigin.replace(/\/$/, "")}/${url.replace(/^\/+/, "")}`;
}

function tryResolveWorkspaceFile(root: string, value: string): string | null {
  if (!value.startsWith("/")) return null;
  let current = root;
  const suffix = value.replace(/^\/+/, "");
  for (;;) {
    const candidate = join(current, suffix);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function readTypeSource(root: string, source: string): Promise<string> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(
        `[mountly:host] failed to fetch remote types from ${source} (${response.status})`,
      );
    }
    return await response.text();
  }

  const file = source.startsWith("/")
    ? (tryResolveWorkspaceFile(root, source) ?? resolve(root, `.${source}`))
    : resolve(root, source);
  return readFileSync(file, "utf8");
}

function resolveReferencedTypeSource(source: string, specifier: string): string {
  const normalizedSpecifier = specifier.replace(/\.(?:[cm]?js|jsx)$/i, ".d.ts");
  if (source.startsWith("http://") || source.startsWith("https://")) {
    return new URL(normalizedSpecifier, source).toString();
  }
  return resolve(dirname(source), normalizedSpecifier);
}

function localPathForRemoteType(cacheDir: string, verticalId: string, source: string): string {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const url = new URL(source);
    return join(
      cacheDir,
      sanitizePathSegment(verticalId),
      url.hostname,
      url.pathname.replace(/^\/+/, ""),
    );
  }
  return join(
    cacheDir,
    sanitizePathSegment(verticalId),
    source.startsWith("/") ? source.replace(/^\/+/, "") : source,
  );
}

async function materializeTypeGraph(
  root: string,
  verticalId: string,
  source: string,
  cacheDir: string,
  seen: Map<string, string>,
): Promise<string> {
  const cached = seen.get(source);
  if (cached) return cached;

  const text = await readTypeSource(root, source);
  const localFile = localPathForRemoteType(cacheDir, verticalId, source);
  seen.set(source, localFile);
  mkdirSync(dirname(localFile), { recursive: true });
  writeFileSync(localFile, text);

  const importRegex = /(?:from\s+|import\s*\(\s*|<reference\s+path=)["'](\.[^"']+)["']/g;
  for (const match of text.matchAll(importRegex)) {
    const ref = match[1];
    if (!ref) continue;
    await materializeTypeGraph(
      root,
      verticalId,
      resolveReferencedTypeSource(source, ref),
      cacheDir,
      seen,
    );
  }

  return localFile;
}

async function writeTypesFile(
  manifest: MountlyManifest,
  outFile: string | null,
  root: string,
  remotes: Record<string, string>,
  strict: boolean,
): Promise<void> {
  if (!outFile) return;
  const cacheDir = join(dirname(outFile), ".mountly", "remotes");
  const declarationModules = new Map<string, string>();
  const seen = new Map<string, string>();

  for (const vertical of manifest.verticals) {
    const rootSpecifier = vertical.alias ?? vertical.id;
    const remoteOrigin = remotes[vertical.id];
    const entries: Array<{ specifier: string; exportKey?: string }> = [
      { specifier: rootSpecifier },
    ];
    for (const exportKey of Object.keys(vertical.exports ?? {})) {
      entries.push({ specifier: `${rootSpecifier}/${exportKey.replace(/^\.\//, "")}`, exportKey });
    }

    for (const entry of entries) {
      const declarationPath = extractDeclarationPath(vertical, entry.exportKey);
      if (!declarationPath) continue;
      try {
        const resolved = applyRemoteOrigin(
          resolveExportUrl(vertical, declarationPath),
          remoteOrigin,
        );
        const localFile = await materializeTypeGraph(root, vertical.id, resolved, cacheDir, seen);
        let modulePath = relative(dirname(outFile), localFile).replace(/\\/g, "/");
        modulePath = modulePath.replace(/\.d\.ts$/i, "");
        if (!modulePath.startsWith("./") && !modulePath.startsWith("../")) {
          modulePath = `./${modulePath}`;
        }
        declarationModules.set(entry.specifier, modulePath);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (strict) {
          throw new Error(
            `[mountly:host] remote types unavailable for "${entry.specifier}": ${message}`,
          );
        }
        console.warn(
          `[mountly:host] remote types unavailable for "${entry.specifier}": ${message}`,
        );
      }
    }
  }

  const next = codegenManifestTypes(manifest, {
    resolveDeclarationModule: ({ specifier }) => declarationModules.get(specifier) ?? null,
    resolveExportNames: ({ vertical, exportKey }) => exportNamesForVertical(vertical, exportKey),
  });
  mkdirSync(dirname(outFile), { recursive: true });
  const prev = existsSync(outFile) ? readFileSync(outFile, "utf8") : null;
  if (prev === next) return;
  writeFileSync(outFile, next);
}

function verticalIdFromSpecifier(manifest: MountlyManifest, specifier: string): string | null {
  for (const vertical of manifest.verticals) {
    const roots = [vertical.id, vertical.alias].filter(Boolean) as string[];
    for (const root of roots) {
      if (specifier === root || specifier.startsWith(`${root}/`)) {
        return vertical.id;
      }
    }
  }
  return null;
}

function resolveDevUrl(
  manifest: MountlyManifest,
  specifier: string,
  remotes: Record<string, string>,
): string | null {
  const manifestUrl = resolveRemoteImport(manifest, specifier);
  if (!manifestUrl) return null;

  const verticalId = verticalIdFromSpecifier(manifest, specifier);
  const remoteOrigin = verticalId ? remotes[verticalId] : undefined;
  if (!remoteOrigin) return manifestUrl;

  if (manifestUrl.startsWith("/")) {
    return `${remoteOrigin.replace(/\/$/, "")}${manifestUrl}`;
  }
  if (manifestUrl.startsWith("http://") || manifestUrl.startsWith("https://")) {
    try {
      const parsed = new URL(manifestUrl);
      return `${remoteOrigin.replace(/\/$/, "")}${parsed.pathname}${parsed.search}`;
    } catch {
      return manifestUrl;
    }
  }

  return `${remoteOrigin.replace(/\/$/, "")}/${manifestUrl.replace(/^\/+/, "")}`;
}

function isRemoteSpecifier(manifest: MountlyManifest, id: string): boolean {
  if (resolveRemoteImport(manifest, id)) return true;
  return manifest.verticals.some((vertical) => {
    const roots = [vertical.id, vertical.alias].filter(Boolean) as string[];
    return roots.some((root) => id.startsWith(`${root}/`));
  });
}

function joinRemoteUrl(base: string, segment: string): string {
  return `${base.replace(/\/+$/, "")}/${segment.replace(/^\.?\/+/, "")}`;
}

/**
 * Fetch each URL-declared remote's `mountly.manifest.fragment.json` and turn it into vertical
 * entries keyed by the remote name, with asset URLs absolutized against the remote base.
 */
async function fetchRemoteFragments(remotes: Record<string, string>): Promise<VerticalEntry[]> {
  const verticals: VerticalEntry[] = [];
  for (const [name, urlRaw] of Object.entries(remotes)) {
    const trimmed = urlRaw.replace(/\/+$/, "");
    const isFragmentUrl = trimmed.endsWith(".json");
    const fragmentUrl = isFragmentUrl ? trimmed : `${trimmed}/mountly.manifest.fragment.json`;
    const base = isFragmentUrl ? trimmed.replace(/\/[^/]*$/, "") : trimmed;

    const response = await fetch(fragmentUrl);
    if (!response.ok) {
      throw new Error(
        `[mountly:host] remote "${name}": failed to fetch ${fragmentUrl} (${response.status}) — is the remote built and served?`,
      );
    }
    const fragment = (await response.json()) as { verticals?: VerticalEntry[] };
    const fragmentVerticals = fragment.verticals ?? [];
    for (const vertical of fragmentVerticals) {
      const absolute =
        /^https?:\/\//.test(vertical.url) || vertical.url.startsWith("/")
          ? vertical.url
          : joinRemoteUrl(base, vertical.url);
      verticals.push({
        ...vertical,
        // A `mountlyRemote` build emits one vertical; key it by the host's remote name.
        id: fragmentVerticals.length === 1 ? name : vertical.id,
        url: absolute,
      });
    }
  }
  return verticals;
}

export function mountlyHostPlugin(options: MountlyHostPluginOptions): Plugin {
  const devOrigins = options.devOrigins ?? {};
  const injectImportMap = options.injectImportMap ?? true;
  let urlRemoteVerticals: VerticalEntry[] = [];
  let urlRemotesFetched = false;
  const ensureUrlRemotes = async (): Promise<void> => {
    if (urlRemotesFetched) return;
    urlRemotesFetched = true;
    if (options.remotes && Object.keys(options.remotes).length > 0) {
      urlRemoteVerticals = await fetchRemoteFragments(options.remotes);
    }
  };
  const strictTypes =
    options.types !== false && typeof options.types === "object"
      ? (options.types.strict ?? true)
      : options.types !== false;
  let manifest!: MountlyManifest;
  let root = process.cwd();
  let isProduction = false;
  let sourceFiles: string[] = [];
  let typesOutFile: string | null = null;

  const withUrlRemotes = (base: MountlyManifest): MountlyManifest =>
    urlRemoteVerticals.length > 0 ? mergeManifests(base, { verticals: urlRemoteVerticals }) : base;

  const loadCurrentManifest = (): MountlyManifest => {
    if (options.verticals?.length) {
      const composed = composeManifestFromFragments({
        root,
        fragments: options.verticals.map(({ fragment }) => fragment),
        platform: options.platform,
        base: options.manifest,
        strict: options.strictFragments ?? true,
      });
      sourceFiles = composed.fragmentFiles;
      if (options.manifest) {
        sourceFiles.push(resolve(root, options.manifest));
      }
      return withUrlRemotes(composed.manifest);
    }
    if (options.manifest) {
      sourceFiles = [resolve(root, options.manifest)];
      return withUrlRemotes(loadManifest(options.manifest, root));
    }
    if (urlRemoteVerticals.length > 0) {
      // Remotes-only host: the import map is the React defaults plus the fetched remotes.
      return parseManifest({
        version: "2",
        platform: { imports: defaultReactPlatformImports(options.platform) },
        verticals: urlRemoteVerticals,
      });
    }
    throw new Error(
      "[mountly:host] provide `manifest`, `verticals`, or `remotes` to mountlyHostPlugin()",
    );
  };

  const maybeWriteManifest = (manifestToWrite: MountlyManifest) => {
    if (!options.writeManifest) return;
    const out = resolve(root, options.writeManifest);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(manifestToWrite, null, 2)}\n`);
  };

  return {
    name: "mountly:host",
    enforce: "pre",

    async config(_config, env) {
      isProduction = env.command === "build";
      await ensureUrlRemotes();
      manifest = loadCurrentManifest();
      maybeWriteManifest(manifest);
      typesOutFile = resolveTypesOutFile(root, options.manifest, options.types);
      void writeTypesFile(manifest, typesOutFile, root, devOrigins, false);
      const external = manifestRemoteSpecifiers(manifest);

      return {
        build: {
          rollupOptions: {
            external,
          },
        },
        optimizeDeps: {
          exclude: external,
        },
      };
    },

    async configResolved(config: ResolvedConfig) {
      root = config.root;
      await ensureUrlRemotes();
      manifest = loadCurrentManifest();
      typesOutFile = resolveTypesOutFile(root, options.manifest, options.types);
      void writeTypesFile(manifest, typesOutFile, root, devOrigins, false);
    },

    async buildStart() {
      await ensureUrlRemotes();
      manifest = loadCurrentManifest();
      maybeWriteManifest(manifest);
      await writeTypesFile(manifest, typesOutFile, root, devOrigins, strictTypes);
      for (const file of sourceFiles) this.addWatchFile(file);
    },

    configureServer(server) {
      server.watcher.add(sourceFiles);
    },

    handleHotUpdate(ctx: HmrContext) {
      if (!sourceFiles.includes(ctx.file)) return;
      manifest = loadCurrentManifest();
      void writeTypesFile(manifest, typesOutFile, root, devOrigins, false);
    },

    resolveId(id) {
      if (!isRemoteSpecifier(manifest, id)) return null;
      const url = isProduction ? null : resolveDevUrl(manifest, id, devOrigins);
      if (url) {
        return { id: url, external: true };
      }
      return { id, external: true };
    },

    transformIndexHtml: {
      order: "pre",
      handler(html) {
        let next = html;

        if (injectImportMap) {
          const imports = Object.fromEntries(
            Object.entries(manifestToImportMap(manifest)).map(([specifier, url]) => [
              specifier,
              isProduction ? url : (resolveDevUrl(manifest, specifier, devOrigins) ?? url),
            ]),
          );
          const snippet = `<script type="importmap">\n${JSON.stringify({ imports }, null, 2)}\n</script>`;
          if (!next.includes('type="importmap"')) {
            next = next.replace("<head>", `<head>\n    ${snippet}`);
          }
        }

        return next;
      },
    },
  };
}
