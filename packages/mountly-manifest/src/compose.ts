import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { mergeManifests } from "./server.js";
import { parseManifest, type MountlyManifest } from "./schema.js";

export interface ComposePlatformOptions {
  /** CDN origin for default React imports. Default `https://esm.sh`. */
  cdn?: string;
  /** Pinned React version. Default `19.2.7`. */
  reactVersion?: string;
  /** Pinned React DOM version. Defaults to `reactVersion`. */
  reactDomVersion?: string;
  /** Extra import-map entries merged over the React defaults. */
  imports?: Record<string, string>;
}

export interface ComposeManifestFromFragmentsOptions {
  /** Host root used to resolve fragment paths and absolutize vertical URLs. */
  root: string;
  /** Paths to built `mountly.manifest.fragment.json` files (relative to `root` or absolute). */
  fragments: string[];
  /** Platform import-map settings for the composed manifest. */
  platform?: ComposePlatformOptions;
  /**
   * Optional base manifest (or path to JSON) merged after fragment composition.
   * Base `platform.imports` win on conflict; verticals from fragments replace by `id`.
   */
  base?: MountlyManifest | string;
  /** When true (default), throw if a fragment file is missing. */
  strict?: boolean;
}

export interface ComposedManifestResult {
  manifest: MountlyManifest;
  fragmentFiles: string[];
}

export function defaultReactPlatformImports(
  platform: ComposePlatformOptions | undefined,
): Record<string, string> {
  const cdn = platform?.cdn ?? "https://esm.sh";
  const reactVersion = platform?.reactVersion ?? "19.2.7";
  const reactDomVersion = platform?.reactDomVersion ?? reactVersion;
  return {
    react: `${cdn}/react@${reactVersion}`,
    "react/jsx-runtime": `${cdn}/react@${reactVersion}/jsx-runtime`,
    "react/jsx-dev-runtime": `${cdn}/react@${reactVersion}/jsx-dev-runtime`,
    "react-dom": `${cdn}/react-dom@${reactDomVersion}`,
    "react-dom/client": `${cdn}/react-dom@${reactDomVersion}/client`,
    ...(platform?.imports ?? {}),
  };
}

function slashPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function absolutizeRelativePath(root: string, fromFile: string, value: string): string {
  if (value.startsWith("/") || value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  const absolute = resolve(dirname(fromFile), value);
  const rel = slashPath(relative(root, absolute));
  return rel.startsWith(".") ? rel : `/${rel}`;
}

function absolutizeVertical(
  root: string,
  fragmentFile: string,
  vertical: MountlyManifest["verticals"][number],
): MountlyManifest["verticals"][number] {
  const next: MountlyManifest["verticals"][number] = {
    ...vertical,
    url: absolutizeRelativePath(root, fragmentFile, vertical.url),
  };

  if (vertical.exports) {
    next.exports = Object.fromEntries(
      Object.entries(vertical.exports).map(([key, value]) => [
        key,
        absolutizeRelativePath(root, fragmentFile, value),
      ]),
    );
  }

  if (vertical.types) {
    next.types = {
      ...vertical.types,
      ...(vertical.types.declaration
        ? {
            declaration: absolutizeRelativePath(root, fragmentFile, vertical.types.declaration),
          }
        : {}),
      ...(vertical.types.exports
        ? {
            exports: Object.fromEntries(
              Object.entries(vertical.types.exports).map(([key, value]) => [
                key,
                Array.isArray(value)
                  ? value
                  : {
                      ...value,
                      ...(value.declaration
                        ? {
                            declaration: absolutizeRelativePath(
                              root,
                              fragmentFile,
                              value.declaration,
                            ),
                          }
                        : {}),
                    },
              ]),
            ),
          }
        : {}),
    };
  }

  return next;
}

function loadBaseManifest(base: MountlyManifest | string, root: string): MountlyManifest {
  if (typeof base !== "string") return parseManifest(base);
  const absolute = resolve(root, base);
  return parseManifest(JSON.parse(readFileSync(absolute, "utf8")));
}

/**
 * Compose a host manifest from one or more vertical build fragments.
 * Fills default React platform imports when no base manifest is supplied.
 */
export function composeManifestFromFragments(
  options: ComposeManifestFromFragmentsOptions,
): ComposedManifestResult {
  const { root, fragments, platform, strict = true } = options;
  if (fragments.length === 0) {
    throw new Error(
      "[mountly-manifest] composeManifestFromFragments requires at least one fragment",
    );
  }

  const fragmentFiles = fragments.map((fragment) => resolve(root, fragment));
  const fragmentPayloads: Array<{ verticals?: MountlyManifest["verticals"] }> = [];

  for (const file of fragmentFiles) {
    if (!existsSync(file)) {
      const hint = file.includes("dist")
        ? " Build the remote vertical first (e.g. pnpm run build:remote)."
        : "";
      const message = `[mountly-manifest] fragment not found: ${file}.${hint}`;
      if (strict) throw new Error(message);
      console.warn(message);
      continue;
    }
    fragmentPayloads.push(JSON.parse(readFileSync(file, "utf8")));
  }

  const verticals = fragmentFiles.flatMap((file, index) => {
    if (!existsSync(file)) return [];
    const raw = fragmentPayloads[index];
    return (raw?.verticals ?? []).map((vertical) => absolutizeVertical(root, file, vertical));
  });

  if (verticals.length === 0) {
    throw new Error(
      "[mountly-manifest] no verticals found in fragments — build remotes and check fragment paths",
    );
  }

  let manifest: MountlyManifest;
  if (options.base) {
    manifest = mergeManifests(loadBaseManifest(options.base, root), { verticals });
  } else {
    manifest = parseManifest({
      version: "2",
      platform: {
        imports: {
          ...defaultReactPlatformImports(platform),
          ...(platform?.imports ?? {}),
        },
      },
      verticals,
    });
  }

  return { manifest, fragmentFiles };
}
