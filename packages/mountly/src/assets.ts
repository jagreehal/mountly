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

