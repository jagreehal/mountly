import { parseManifest, type MountlyManifest } from "./schema.js";
import { validateManifest, type ManifestIssue } from "./validate.js";

export { parseManifest, validateManifest };
export type { MountlyManifest, ManifestIssue };

export {
  composeManifestFromFragments,
  defaultReactPlatformImports,
  type ComposeManifestFromFragmentsOptions,
  type ComposePlatformOptions,
  type ComposedManifestResult,
} from "./compose.js";

/**
 * Server-side composition: merge a base manifest with environment- or tenant-specific
 * overrides. Platform imports merge (later wins); verticals dedupe by `id` (later wins),
 * so an override can replace a base vertical or append new ones.
 *
 * Use in a registry endpoint to assemble a per-request manifest from a shared base plus
 * the verticals a given user/tenant is entitled to.
 */
export function mergeManifests(
  base: MountlyManifest,
  ...overrides: Array<Partial<MountlyManifest>>
): MountlyManifest {
  let imports = { ...base.platform.imports };
  const byId = new Map(base.verticals.map((v) => [v.id, v]));

  for (const override of overrides) {
    if (override.platform?.imports) {
      imports = { ...imports, ...override.platform.imports };
    }
    for (const vertical of override.verticals ?? []) {
      byId.set(vertical.id, vertical);
    }
  }

  return {
    version: base.version,
    platform: { imports },
    verticals: [...byId.values()],
  };
}

function importMapFor(manifest: MountlyManifest): Record<string, string> {
  const imports: Record<string, string> = { ...manifest.platform.imports };
  for (const vertical of manifest.verticals) {
    imports[vertical.alias ?? vertical.id] = vertical.url;
  }
  return imports;
}

export interface RenderMountlyHeadOptions {
  /** `nonce` attribute applied to the emitted <script> tags (for a strict CSP). */
  nonce?: string;
  /** Bare specifier used for the define module. Default `"mountly-manifest"`. */
  manifestSpecifier?: string;
}

/**
 * SSR island story: render the `<head>` markup a server-rendered host needs — a **static**
 * import map plus a tiny module that defines `<mountly-feature>` elements from the inlined
 * manifest. Because the import map is emitted directly in the HTML, there is no runtime
 * injection and no bare-specifier ordering problem, and no client round-trip to fetch the
 * manifest. Widgets still mount on intent, client-side.
 *
 * Drop the result into your framework's head (Next `<Head>`, Astro, Remix, plain string).
 *
 * ```ts
 * const head = renderMountlyHead(manifest);
 * // inject `head` into the served HTML <head>
 * ```
 */
export function renderMountlyHead(
  manifest: MountlyManifest,
  options: RenderMountlyHeadOptions = {},
): string {
  const nonceAttr = options.nonce ? ` nonce="${options.nonce}"` : "";
  const specifier = options.manifestSpecifier ?? "mountly-manifest";
  const importMap = JSON.stringify({ imports: importMapFor(manifest) }, null, 2);
  // Inline the manifest so the define step needs no fetch. JSON is XSS-safe inside a
  // module script once `<` is escaped to prevent breaking out of the tag.
  const inlined = JSON.stringify(manifest).replace(/</g, "\\u003c");

  return `<script type="importmap"${nonceAttr}>
${importMap}
</script>
<script type="module"${nonceAttr}>
  import { defineMountlyFeatureFromManifest, parseManifest } from "${specifier}";
  defineMountlyFeatureFromManifest(parseManifest(${inlined}));
</script>`;
}

export interface ManifestResponseOptions {
  /** Run consistency checks and return 422 with the issues if any error-level issue is found. Default `true`. */
  validate?: boolean;
  /** Extra response headers (merged over the defaults). */
  headers?: Record<string, string>;
}

/**
 * Manifest registry endpoint helper: turn a manifest object into a Web `Response`.
 * Returns `200` with the JSON manifest, or `422` with `{ issues }` when validation finds
 * an error. Framework-free — works in any Web-standard handler (Next route handler, Hono,
 * Deno, Cloudflare Workers, Bun).
 *
 * ```ts
 * export function GET(request: Request) {
 *   const manifest = mergeManifests(base, tenantOverride(request));
 *   return createManifestResponse(manifest);
 * }
 * ```
 */
export function createManifestResponse(
  manifest: MountlyManifest,
  options: ManifestResponseOptions = {},
): Response {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    ...options.headers,
  };

  if (options.validate !== false) {
    const issues = validateManifest(manifest);
    const errors = issues.filter((i) => i.level === "error");
    if (errors.length > 0) {
      return new Response(JSON.stringify({ issues }, null, 2), {
        status: 422,
        headers,
      });
    }
  }

  return new Response(JSON.stringify(manifest), { status: 200, headers });
}
