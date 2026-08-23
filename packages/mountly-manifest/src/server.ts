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

export interface SameOriginProxyRoute {
  /**
   * Path prefix on the host, e.g. `/__mountly/billing`. Incoming requests under
   * this prefix are forwarded to {@link upstream}.
   */
  prefix: string;
  /** Upstream origin or base URL, e.g. `https://billing.acme.com`. */
  upstream: string;
}

export interface SameOriginProxyOptions {
  routes: SameOriginProxyRoute[];
  /**
   * Extra request headers forwarded upstream. Defaults include forwarding
   * `accept` and stripping hop-by-hop headers.
   */
  forwardHeaders?: string[];
}

/**
 * Optional same-origin asset/cookie convenience — **not** a Fragment Gateway.
 *
 * Mountly's happy path is CDN + CORS/import maps with no middleware. Use this
 * only when a framed vertical needs first-party cookies or relative asset paths
 * under the host origin. Wire it into whatever middleware you already run
 * (Workers, Hono, Express adapters, etc.).
 *
 * Designed for **GET/HEAD** asset and document fetches. Non-GET methods are
 * rejected with 405 so this stays a thin proxy recipe, not an app gateway.
 *
 * ```ts
 * const proxy = createSameOriginProxy({
 *   routes: [{ prefix: "/__mountly/billing", upstream: "https://billing.acme.com" }],
 * });
 * // in your fetch handler:
 * const proxied = await proxy(request);
 * if (proxied) return proxied;
 * ```
 *
 * Returns `null` when the request path does not match any route.
 */
export function createSameOriginProxy(
  options: SameOriginProxyOptions,
): (request: Request) => Promise<Response | null> {
  const routes = options.routes.map((route) => ({
    prefix: route.prefix.replace(/\/$/, "") || "/",
    upstream: new URL(route.upstream),
  }));
  const defaultForwardHeaders = [
    "accept",
    "accept-language",
    "cookie",
    "if-none-match",
    "if-modified-since",
  ];
  const forward = new Set(
    [...defaultForwardHeaders, ...(options.forwardHeaders ?? [])].map((h) => h.toLowerCase()),
  );

  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url);
    const match = routes.find(
      (route) => url.pathname === route.prefix || url.pathname.startsWith(`${route.prefix}/`),
    );
    if (!match) return null;

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { allow: "GET, HEAD" },
      });
    }

    const suffix = url.pathname.slice(match.prefix.length) || "/";
    const target = new URL(match.upstream);
    const basePath = target.pathname.replace(/\/+$/, "");
    target.pathname = `${basePath}${suffix}` || "/";
    target.search = url.search;
    target.hash = "";

    const headers = new Headers();
    for (const [key, value] of request.headers) {
      if (forward.has(key.toLowerCase())) headers.set(key, value);
    }
    headers.set("host", target.host);

    const upstream = await fetch(target, {
      method: request.method,
      headers,
      redirect: "manual",
    });
    const responseHeaders = new Headers(upstream.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
    responseHeaders.delete("transfer-encoding");

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  };
}
