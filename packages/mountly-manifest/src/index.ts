import type { PlatformRuntimeUrls } from "mountly/runtime";
import type { FeatureModuleManifest } from "mountly/elements";
import type { OnDemandFeature } from "mountly";
import { appendImports } from "mountly/runtime";
import { defineMountlyFeature, registerCustomElement } from "mountly/elements";
import type { MountlyManifest, VerticalEntry } from "./schema.js";
import { manifestToImportMap, verticalImportEntries } from "./resolve.js";

export {
  manifestJsonSchema,
  mountlyManifestSchema,
  parseManifest,
  platformImportsSchema,
  triggerTypeSchema,
  verticalEntrySchema,
  type MountlyManifest,
  type PlatformImports,
  type TriggerType,
  type VerticalEntry,
} from "./schema.js";

export { validateManifest, type ManifestIssue, type ManifestIssueLevel } from "./validate.js";

export {
  deriveBaseUrlFromVerticalUrl,
  exportKeyToSubpath,
  manifestRemoteSpecifiers,
  manifestToImportMap,
  resolveExportUrl,
  resolveRemoteImport,
  verticalExportSpecifier,
  verticalImportEntries,
  type VerticalImportEntry,
} from "./resolve.js";

export { codegenManifestTypes, type CodegenOptions } from "./codegen.js";

export {
  composeManifestFromFragments,
  defaultReactPlatformImports,
  type ComposeManifestFromFragmentsOptions,
  type ComposePlatformOptions,
  type ComposedManifestResult,
} from "./compose.js";

export { mergeManifests, renderMountlyHead, createManifestResponse } from "./server.js";
export type { RenderMountlyHeadOptions, ManifestResponseOptions } from "./server.js";

export function manifestToFeatureModules(manifest: MountlyManifest): FeatureModuleManifest {
  const modules: FeatureModuleManifest = {};
  for (const vertical of manifest.verticals) {
    if (vertical.featureExport) continue;
    const specifier = vertical.alias ?? vertical.id;
    modules[vertical.id] = {
      moduleUrl: isBareSpecifier(specifier) ? specifier : vertical.url,
      ...(vertical.moduleExport ? { moduleExport: vertical.moduleExport } : {}),
    };
  }
  return modules;
}

function registerManifestVertical(vertical: VerticalEntry): void {
  const specifier = vertical.alias ?? vertical.id;
  const moduleUrl = isBareSpecifier(specifier) ? specifier : vertical.url;

  registerCustomElement(vertical.id, async () => {
    const mod = (await import(/* @vite-ignore */ moduleUrl)) as Record<string, unknown>;
    const feature = mod[vertical.featureExport as string];
    if (
      !feature ||
      typeof feature !== "object" ||
      typeof (feature as OnDemandFeature).activate !== "function"
    ) {
      throw new Error(
        `[mountly-manifest] vertical "${vertical.id}" featureExport "${vertical.featureExport}" is not an OnDemandFeature`,
      );
    }
    return feature as OnDemandFeature;
  });
}

export function manifestToPlatformRuntimeOptions(manifest: MountlyManifest): PlatformRuntimeUrls {
  const imports = manifest.platform.imports;
  const react = imports.react;
  const reactDom = imports["react-dom"];
  const reactDomClient = imports["react-dom/client"];
  if (!react || !reactDom || !reactDomClient) {
    throw new Error(
      "[mountly-manifest] platform.imports must include react, react-dom, and react-dom/client",
    );
  }
  const verticalImports: Record<string, string> = {};
  for (const vertical of manifest.verticals) {
    for (const { specifier, url } of verticalImportEntries(vertical)) {
      verticalImports[specifier] = url;
    }
  }
  return {
    react,
    reactDom,
    reactDomClient,
    reactJsxRuntime: imports["react/jsx-runtime"],
    imports: {
      ...imports,
      ...verticalImports,
    },
  };
}

export function renderImportMapScript(manifest: MountlyManifest): string {
  const imports = manifestToImportMap(manifest);
  return `<script type="importmap">\n${JSON.stringify({ imports }, null, 2)}\n</script>`;
}

export interface DefineMountlyFeatureFromManifestOptions {
  prefix?: string;
  scan?: boolean;
  aliases?: boolean;
}

export function defineMountlyFeatureFromManifest(
  manifest: MountlyManifest,
  options: DefineMountlyFeatureFromManifestOptions = {},
): void {
  for (const vertical of manifest.verticals) {
    if (vertical.featureExport) {
      registerManifestVertical(vertical);
    }
  }
  defineMountlyFeature({
    modules: manifestToFeatureModules(manifest),
    prefix: options.prefix,
    scan: options.scan,
    aliases: options.aliases,
  });
}

/**
 * Register a single vertical after the host has booted — the runtime equivalent of
 * adding an entry to `manifest.verticals`. Use when the vertical list is fetched
 * asynchronously (e.g. a per-user plugin list) rather than known at boot.
 *
 * Adds the vertical's bare specifier to the import map (if needed) and registers its
 * `<mountly-feature>` element. Safe to call repeatedly; new keys only.
 */
export function setVertical(vertical: VerticalEntry): void {
  const specifier = vertical.alias ?? vertical.id;
  const bare = isBareSpecifier(specifier);
  if (bare) appendImports({ [specifier]: vertical.url });

  if (vertical.featureExport) {
    registerManifestVertical(vertical);
    return;
  }
  defineMountlyFeature({
    modules: {
      [vertical.id]: {
        moduleUrl: bare ? specifier : vertical.url,
        ...(vertical.moduleExport ? { moduleExport: vertical.moduleExport } : {}),
      },
    },
  });
}

/** Dynamically import a remote by bare specifier (import map) or URL. Alias for `loadVertical`. */
export const importRemote = loadVertical;

/**
 * Dynamically import a vertical module and return an export (or the whole module).
 * `idOrUrl` may be a bare specifier already in the import map or an absolute URL.
 */
export async function loadVertical(idOrUrl: string, exportName?: string): Promise<unknown> {
  const mod = (await import(/* @vite-ignore */ idOrUrl)) as Record<string, unknown>;
  return exportName ? mod[exportName] : mod;
}

/** Return a module's `default` export if present, otherwise the module itself. */
export function unwrapDefault(mod: unknown): unknown {
  if (mod && typeof mod === "object" && "default" in (mod as Record<string, unknown>)) {
    return (mod as Record<string, unknown>).default;
  }
  return mod;
}

function isBareSpecifier(value: string): boolean {
  return (
    !value.startsWith("/") &&
    !value.startsWith("./") &&
    !value.startsWith("../") &&
    !value.startsWith("http://") &&
    !value.startsWith("https://") &&
    !value.endsWith(".js")
  );
}
