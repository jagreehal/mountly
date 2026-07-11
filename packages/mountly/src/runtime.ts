import { importBySpecifier } from "./dynamic-import.js";

const RUNTIME_MARK = "data-mountly-runtime";
let installed = false;

export interface RuntimeUrls {
  react: string;
  reactDom: string;
  reactDomClient: string;
  reactJsxRuntime?: string;
}

export interface PlatformRuntimeUrls extends RuntimeUrls {
  /** Additional bare-specifier → URL mappings (mountly, mountly/*, adapters, vertical aliases). */
  imports?: Record<string, string>;
}

function deriveReactJsxRuntimeUrl(reactUrl: string): string {
  try {
    const url = new URL(reactUrl);
    if (url.pathname.endsWith("/jsx-runtime")) return url.toString();
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/jsx-runtime`;
    return url.toString();
  } catch {
    if (reactUrl.endsWith("/jsx-runtime")) return reactUrl;
    return `${reactUrl.replace(/\/+$/, "")}/jsx-runtime`;
  }
}

function buildReactImports(urls: RuntimeUrls): Record<string, string> {
  const reactJsxRuntime = urls.reactJsxRuntime ?? deriveReactJsxRuntimeUrl(urls.react);
  return {
    react: urls.react,
    "react/jsx-runtime": reactJsxRuntime,
    "react-dom": urls.reactDom,
    "react-dom/client": urls.reactDomClient,
  };
}

function injectImportMap(imports: Record<string, string>): void {
  if (typeof document === "undefined") {
    throw new Error("[mountly] installRuntime() requires a browser document.");
  }
  const firstModuleScript = document.querySelector("script[type=module]");
  if (
    firstModuleScript &&
    firstModuleScript.compareDocumentPosition(document.head) === Node.DOCUMENT_POSITION_PRECEDING
  ) {
    console.warn(
      "[mountly] installRuntime detected module scripts before runtime import map; bare-specifier imports may fail.",
    );
  }

  if (installed) {
    const existing = document.querySelector<HTMLScriptElement>(`script[${RUNTIME_MARK}]`);
    const prev = existing ? JSON.parse(existing.textContent ?? "{}") : null;
    const prevImports = (prev?.imports ?? {}) as Record<string, string>;
    const mismatch = Object.entries(imports).some(([key, value]) => prevImports[key] !== value);
    if (mismatch) {
      console.warn("[mountly] installRuntime called twice with different URLs; first call wins.");
    }
    return;
  }

  if (document.readyState !== "loading" && document.querySelector("script[type=module]")) {
    console.warn(
      "[mountly] installRuntime called after module loading may have started. " +
        "Call it from an inline <script> in <head>, before any module imports.",
    );
  }
  const preExistingImportMap = document.querySelector(
    "script[type=importmap]:not([data-mountly-runtime])",
  );
  if (preExistingImportMap) {
    console.warn(
      "[mountly] existing import map detected; ensure runtime imports are defined before widget module imports.",
    );
  }

  const script = document.createElement("script");
  script.type = "importmap";
  script.setAttribute(RUNTIME_MARK, "");
  script.textContent = JSON.stringify({ imports });
  document.head.prepend(script);
  installed = true;
}

export function installRuntime(urls: RuntimeUrls): void {
  injectImportMap(buildReactImports(urls));
}

export function installPlatformRuntime(urls: PlatformRuntimeUrls): void {
  injectImportMap({
    ...buildReactImports(urls),
    ...(urls.imports ?? {}),
  });
}

/**
 * Add new bare-specifier → URL mappings after the runtime import map is installed.
 * Used to register verticals discovered at runtime (e.g. fetched plugin lists).
 *
 * Only **new** keys are added — browsers merge multiple import maps but later maps
 * cannot override keys an earlier map already defined. Keys that already resolve are
 * skipped (with a warn on URL mismatch). Safe because a runtime-added vertical id has
 * never been imported before, so no module graph depends on the old value.
 */
export function appendImports(imports: Record<string, string>): void {
  if (typeof document === "undefined") {
    throw new Error("[mountly] appendImports() requires a browser document.");
  }
  const mapped = new Map<string, string>();
  for (const el of document.querySelectorAll("script[type=importmap]")) {
    try {
      const parsed = JSON.parse(el.textContent ?? "{}") as {
        imports?: Record<string, string>;
      };
      for (const [k, v] of Object.entries(parsed.imports ?? {})) mapped.set(k, v);
    } catch {
      /* ignore malformed maps */
    }
  }

  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(imports)) {
    const existing = mapped.get(key);
    if (existing === undefined) {
      next[key] = value;
    } else if (existing !== value) {
      console.warn(
        `[mountly] appendImports: "${key}" already mapped to a different URL; keeping the first. ` +
          `(existing: ${existing}, ignored: ${value})`,
      );
    }
  }
  if (Object.keys(next).length === 0) return;

  const script = document.createElement("script");
  script.type = "importmap";
  script.textContent = JSON.stringify({ imports: next });
  document.head.appendChild(script);
}

const MOUNTLY_SUBPATHS = [
  "triggers", "gestures", "attach", "elements", "island",
  "host", "host/auto", "bundle", "cache", "mount", "shadow",
  "assets", "adapter", "analytics", "prefetch", "devtools",
  "overlays", "data", "url", "bus", "contracts", "test", "runtime",
] as const;

const MOUNTLY_FILE_MAP: Record<string, string> = {
  "": "index.js",
  "host/auto": "host-entry.js",
  "overlays": "positioning.js",
  "data": "data-source.js",
  "url": "url-state.js",
  "test": "test-utils.js",
};

function deriveMountlySubpathImports(mountlyUrl: string): Record<string, string> {
  const base = mountlyUrl.replace(/\/[^/]+\.js$/, "/");
  const imports: Record<string, string> = { mountly: mountlyUrl };
  for (const sub of MOUNTLY_SUBPATHS) {
    const file = MOUNTLY_FILE_MAP[sub] ?? `${sub}.js`;
    imports[`mountly/${sub}`] = `${base}${file}`;
  }
  return imports;
}

/** Minimal shape `bootstrapMountly` needs; the full manifest is validated by `parseManifest`. */
export interface BootstrapManifestLike {
  platform: { imports: Record<string, string> };
  verticals?: Array<{ id: string; url: string; alias?: string }>;
}

export interface BootstrapMountlyOptions {
  /** Define `<mountly-feature>` elements from the manifest. Default `true`. */
  define?: boolean;
  /** Forwarded to `defineMountlyFeatureFromManifest` when `define` is enabled. */
  defineOptions?: { prefix?: string; scan?: boolean; aliases?: boolean };
  /**
   * Log consistency warnings (duplicate React, version skew, ambiguous exports)
   * to the console. Default `true`. Set `false` in production to stay silent.
   */
  validate?: boolean;
}

/**
 * One-call host bootstrap. Resolves the manifest, injects the platform import map,
 * then defines features — in the order that avoids the bare-specifier race.
 *
 * Load this from `mountly/runtime` by absolute URL (it has no bare-specifier deps),
 * call it first, and never worry about ordering again:
 *
 * ```js
 * import { bootstrapMountly } from "/path/to/mountly/dist/runtime.js";
 * await bootstrapMountly("/manifest.json");
 * ```
 *
 * @param source Manifest URL (fetched) or an already-loaded manifest object.
 * @returns The parsed manifest (when `define` runs) or the raw manifest.
 */
export async function bootstrapMountly(
  source: string | BootstrapManifestLike,
  options: BootstrapMountlyOptions = {},
): Promise<unknown> {
  const manifest: BootstrapManifestLike =
    typeof source === "string"
      ? await fetch(source).then((r) => {
          if (!r.ok) {
            throw new Error(
              `[mountly] bootstrapMountly: failed to fetch manifest "${source}" (${r.status})`,
            );
          }
          return r.json();
        })
      : source;

  const imports = manifest?.platform?.imports ?? {};

  if (imports["mountly"]) {
    const derived = deriveMountlySubpathImports(imports["mountly"]);
    for (const [key, value] of Object.entries(derived)) {
      if (imports[key] === undefined) {
        imports[key] = value;
      }
    }
  }

  const react = imports.react;
  const reactDom = imports["react-dom"];
  const reactDomClient = imports["react-dom/client"];
  if (!react || !reactDom || !reactDomClient) {
    throw new Error(
      "[mountly] bootstrapMountly: manifest.platform.imports must include react, react-dom, and react-dom/client",
    );
  }

  const verticalImports: Record<string, string> = {};
  for (const vertical of manifest.verticals ?? []) {
    verticalImports[vertical.alias ?? vertical.id] = vertical.url;
  }

  installPlatformRuntime({
    react,
    reactDom,
    reactDomClient,
    reactJsxRuntime: imports["react/jsx-runtime"],
    imports: { ...imports, ...verticalImports },
  });

  if (options.define === false) return manifest;

  if (!imports["mountly-manifest"]) {
    throw new Error(
      '[mountly] bootstrapMountly: manifest.platform.imports must map "mountly-manifest" to define features ' +
        "(or call with { define: false } and define them yourself).",
    );
  }

  // Bare specifiers resolve only now that the import map is installed. The specifier
  // is held in a variable so the type build does not try to resolve mountly-manifest
  // (which depends on mountly — a circular type reference).
  const manifestPkg = "mountly-manifest";
  const mod = (await importBySpecifier(manifestPkg)) as {
    parseManifest: (input: unknown) => unknown;
    validateManifest: (manifest: unknown) => Array<{ level: "error" | "warning"; message: string }>;
    defineMountlyFeatureFromManifest: (
      manifest: unknown,
      options?: { prefix?: string; scan?: boolean; aliases?: boolean },
    ) => void;
  };
  const parsed = mod.parseManifest(manifest);

  if (options.validate !== false) {
    for (const issue of mod.validateManifest(parsed)) {
      const log = issue.level === "error" ? console.error : console.warn;
      log(`[mountly] manifest ${issue.level}: ${issue.message}`);
    }
  }

  mod.defineMountlyFeatureFromManifest(parsed, options.defineOptions ?? {});
  return parsed;
}
