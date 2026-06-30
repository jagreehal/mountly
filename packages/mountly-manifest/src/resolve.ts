import type { MountlyManifest, VerticalEntry } from "./schema.js";

/** Turn `./Checkout` into `Checkout` for import-map specifiers. */
export function exportKeyToSubpath(exportKey: string): string {
  return exportKey.replace(/^\.\//, "");
}

/** Build bare specifier for a vertical export: `payments/Checkout`. */
export function verticalExportSpecifier(vertical: VerticalEntry, exportKey: string): string {
  const root = vertical.alias ?? vertical.id;
  const subpath = exportKeyToSubpath(exportKey);
  return subpath ? `${root}/${subpath}` : root;
}

function joinUrl(base: string, segment: string): string {
  const normalizedBase = base.replace(/\/+$/, "");
  const normalizedSegment = segment.replace(/^\.?\/+/, "");
  return `${normalizedBase}/${normalizedSegment}`;
}

/** Derive a directory base from a vertical entry URL (e.g. peer.js → its directory). */
export function deriveBaseUrlFromVerticalUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const parsed = new URL(url);
    parsed.pathname = parsed.pathname.replace(/\/[^/]*$/, "");
    return parsed.toString().replace(/\/$/, "");
  }
  const slash = url.lastIndexOf("/");
  return slash >= 0 ? url.slice(0, slash) : "";
}

/**
 * Resolve an export path to a loadable URL.
 * Absolute URLs and root-relative paths pass through; relative paths join baseUrl or vertical.url dir.
 */
export function resolveExportUrl(vertical: VerticalEntry, exportPath: string): string {
  if (
    exportPath.startsWith("http://") ||
    exportPath.startsWith("https://") ||
    exportPath.startsWith("/")
  ) {
    return exportPath;
  }
  const base = vertical.baseUrl ?? deriveBaseUrlFromVerticalUrl(vertical.url);
  if (!base) {
    throw new Error(
      `[mountly-manifest] vertical "${vertical.id}" export "${exportPath}" is relative but no baseUrl could be derived`,
    );
  }
  return joinUrl(base, exportPath);
}

export interface VerticalImportEntry {
  specifier: string;
  url: string;
}

/** All import-map entries contributed by one vertical (widget + subpath exports). */
export function verticalImportEntries(vertical: VerticalEntry): VerticalImportEntry[] {
  const entries: VerticalImportEntry[] = [
    {
      specifier: vertical.alias ?? vertical.id,
      url: vertical.url,
    },
  ];

  if (vertical.exports) {
    for (const [exportKey, exportPath] of Object.entries(vertical.exports)) {
      entries.push({
        specifier: verticalExportSpecifier(vertical, exportKey),
        url: resolveExportUrl(vertical, exportPath),
      });
    }
  }

  return entries;
}

/** Flatten manifest verticals into import-map entries. Later entries must not override platform keys. */
export function manifestToImportMap(manifest: MountlyManifest): Record<string, string> {
  const imports: Record<string, string> = { ...manifest.platform.imports };
  for (const vertical of manifest.verticals) {
    for (const { specifier, url } of verticalImportEntries(vertical)) {
      imports[specifier] = url;
    }
  }
  return imports;
}

/** Collect all remote specifiers declared in a manifest (for host Vite plugin externalization). */
export function manifestRemoteSpecifiers(manifest: MountlyManifest): string[] {
  const specifiers = new Set<string>();
  for (const vertical of manifest.verticals) {
    for (const { specifier } of verticalImportEntries(vertical)) {
      specifiers.add(specifier);
    }
  }
  return [...specifiers];
}

/** Match an import id against manifest remotes; returns URL if matched. */
export function resolveRemoteImport(manifest: MountlyManifest, id: string): string | null {
  const imports = manifestToImportMap(manifest);
  return imports[id] ?? null;
}
