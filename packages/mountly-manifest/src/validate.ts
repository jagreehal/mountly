import type { MountlyManifest } from "./schema.js";
import { verticalImportEntries } from "./resolve.js";

export type ManifestIssueLevel = "error" | "warning";

export interface ManifestIssue {
  level: ManifestIssueLevel;
  message: string;
}

/** Extract a comparable version (`major.minor.patch` or `major`) from a CDN URL like `https://esm.sh/react@19.2.7`. */
function versionFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  const match = url.match(/@(\d+(?:\.\d+){0,2})/);
  return match?.[1] ?? null;
}

function majorOf(version: string | null): string | null {
  return version ? (version.split(".")[0] ?? null) : null;
}

/**
 * Non-throwing structural + consistency checks beyond `parseManifest`'s schema:
 * duplicate React (the #1 micro-frontend footgun), version skew across the React
 * import-map entries, duplicate vertical ids/aliases, and ambiguous export config.
 *
 * Returns issues sorted error-first. `parseManifest` covers the schema; this covers
 * the cross-field semantics a schema can't express. Used by `bootstrapMountly`
 * (dev warnings) and `mountly manifest validate`.
 */
export function validateManifest(manifest: MountlyManifest): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  const imports = manifest.platform.imports;

  // React presence — manifestToPlatformRuntimeOptions/bootstrap require these.
  for (const key of ["react", "react-dom", "react-dom/client"] as const) {
    if (!imports[key]) {
      issues.push({
        level: "error",
        message: `platform.imports is missing "${key}" — host runtime needs it`,
      });
    }
  }

  // Duplicate-React detection: every React-family entry must pin the same version.
  // Mismatched pins load two React copies → hooks break across verticals.
  const reactEntries: Array<[string, string | null]> = [
    ["react", versionFromUrl(imports.react)],
    ["react-dom", versionFromUrl(imports["react-dom"])],
    ["react/jsx-runtime", versionFromUrl(imports["react/jsx-runtime"])],
    ["react-dom/client", versionFromUrl(imports["react-dom/client"])],
  ];
  const reactMajors = new Set(
    reactEntries.map(([, v]) => majorOf(v)).filter((m): m is string => m !== null),
  );
  if (reactMajors.size > 1) {
    const detail = reactEntries
      .filter(([, v]) => v !== null)
      .map(([k, v]) => `${k}@${v}`)
      .join(", ");
    issues.push({
      level: "error",
      message: `React import-map entries pin different major versions (${detail}) — this loads duplicate React and breaks hooks`,
    });
  } else {
    const reactPatches = new Set(
      reactEntries.map(([, v]) => v).filter((v): v is string => v !== null),
    );
    if (reactPatches.size > 1) {
      const detail = reactEntries
        .filter(([, v]) => v !== null)
        .map(([k, v]) => `${k}@${v}`)
        .join(", ");
      issues.push({
        level: "warning",
        message: `React import-map entries pin different versions (${detail}) — pin one version to avoid a duplicate-React risk`,
      });
    }
  }

  // mountly-manifest needed for bootstrapMountly's define step.
  if (!imports["mountly-manifest"]) {
    issues.push({
      level: "warning",
      message:
        'platform.imports does not map "mountly-manifest" — bootstrapMountly({ define: true }) will fail; map it or define features yourself',
    });
  }

  const seenSpecifiers = new Map<string, string>();
  for (const vertical of manifest.verticals) {
    for (const { specifier } of verticalImportEntries(vertical)) {
      const owner = seenSpecifiers.get(specifier);
      if (owner) {
        issues.push({
          level: "error",
          message: `specifier "${specifier}" is used by both "${owner}" and "${vertical.id}" — ids, aliases, and exports must be unique`,
        });
      } else {
        seenSpecifiers.set(specifier, vertical.id);
      }
    }

    if (vertical.exports) {
      for (const [exportKey, exportPath] of Object.entries(vertical.exports)) {
        if (!exportKey.startsWith("./")) {
          issues.push({
            level: "error",
            message: `vertical "${vertical.id}" export key "${exportKey}" must start with "./"`,
          });
        }
        const isAbsolute =
          exportPath.startsWith("http://") ||
          exportPath.startsWith("https://") ||
          exportPath.startsWith("/");
        if (!isAbsolute && !vertical.baseUrl && !vertical.url.includes("/")) {
          issues.push({
            level: "warning",
            message: `vertical "${vertical.id}" export "${exportKey}" is relative but baseUrl could not be inferred from url "${vertical.url}"`,
          });
        }
      }
    }

    if (vertical.featureExport && vertical.moduleExport) {
      issues.push({
        level: "warning",
        message: `vertical "${vertical.id}" sets both featureExport and moduleExport — featureExport wins; drop one`,
      });
    }
  }

  return issues.sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
}
