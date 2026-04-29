export interface CssAutoLoadOptions {
  css?: "auto" | "none" | string | string[];
  crossorigin?: string;
}

const loadedCssUrls = new Set<string>();

function toAbsoluteUrl(url: string): string {
  return new URL(url, document.baseURI).href;
}

function ensureStylesheet(url: string, crossorigin?: string): Promise<void> {
  const href = toAbsoluteUrl(url);
  if (loadedCssUrls.has(href)) return Promise.resolve();
  const existing = document.querySelector(`link[rel="stylesheet"][href="${href}"]`) as HTMLLinkElement | null;
  if (existing) {
    loadedCssUrls.add(href);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    if (crossorigin) link.crossOrigin = crossorigin;
    link.onload = () => {
      loadedCssUrls.add(href);
      resolve();
    };
    link.onerror = () => reject(new Error(`[mountly] failed to load stylesheet: ${href}`));
    document.head.appendChild(link);
  });
}

function normalizeCssList(moduleUrl: string, css: CssAutoLoadOptions["css"]): string[] {
  if (!css || css === "auto") {
    return [moduleUrl.replace(/\.js($|\?)/, ".css$1")];
  }
  if (css === "none") return [];
  return Array.isArray(css) ? css : [css];
}

export function createModuleLoader(moduleUrl: string, options: CssAutoLoadOptions = {}): () => Promise<unknown> {
  const cssUrls = normalizeCssList(moduleUrl, options.css);
  return async () => {
    await Promise.all(cssUrls.map((url) => ensureStylesheet(url, options.crossorigin)));
    return import(/* @vite-ignore */ moduleUrl);
  };
}

// Cache one in-flight or resolved CSS load per URL. Storing the promise
// rather than the resolved string is what dedupes concurrent mounts: when a
// bundle fires three feature mounts on click, all three see the same pending
// fetch and share one network request.
const cssTextCache = new Map<string, Promise<string | null>>();

/**
 * Fetch a CSS file as raw text, suitable for shadow-DOM `adoptedStyleSheets`.
 *
 * Sends `Accept: text/css` so dev servers (e.g., Vite) return the raw
 * stylesheet instead of the JS module they emit by default for HMR. Returns
 * `null` on network errors or non-2xx responses; adapters should treat that as
 * "no styles" rather than failing the mount.
 */
export function loadCssText(url: string): Promise<string | null> {
  const cached = cssTextCache.get(url);
  if (cached) return cached;
  const promise = (async () => {
    try {
      const res = await fetch(url, { headers: { Accept: "text/css" } });
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  })();
  cssTextCache.set(url, promise);
  // Drop the cache entry on rejection so a later mount can retry. Resolved
  // null (404 etc.) stays cached — the user's URL won't suddenly start
  // working within a page session.
  promise.catch(() => cssTextCache.delete(url));
  return promise;
}

/**
 * Resolve which CSS URL an adapter should fetch, given the various override
 * sources. Order: explicit `cssUrl` (option or prop), then `.js → .css`
 * derived from a `moduleUrl` (option or prop). Props always win over options
 * when both are provided.
 */
export function resolveCssUrl(sources: {
  cssUrlOption?: string;
  moduleUrlOption?: string;
  cssUrlProp?: string;
  moduleUrlProp?: string;
}): string | null {
  const fromModule = (m?: string): string | null =>
    m ? m.replace(/\.js(\?.*)?$/, ".css$1") : null;
  return (
    sources.cssUrlProp ||
    sources.cssUrlOption ||
    fromModule(sources.moduleUrlProp) ||
    fromModule(sources.moduleUrlOption) ||
    null
  );
}

/** Test-only: clear the in-memory CSS cache so unit/integration tests are isolated. */
export function __clearCssTextCache(): void {
  cssTextCache.clear();
}

