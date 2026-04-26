import type { AdapterOptions } from "./adapter.js";

const MOUNT_ATTR = "data-mountly-root";
const mountNodes = new WeakMap<Element, HTMLDivElement>();
const warnedTags = new Set<string>();
const warnedContainers = new WeakSet<Element>();
const injectedCss = new Set<string>();

// Cache one CSSStyleSheet per unique CSS string. Constructable stylesheets
// are shared across all shadow roots that adopt them — no duplicate string
// allocations and the browser deduplicates work internally.
const sheetCache = new Map<string, CSSStyleSheet>();

function getOrCreateSheet(css: string): CSSStyleSheet | null {
  if (typeof CSSStyleSheet === "undefined") return null;
  let sheet = sheetCache.get(css);
  if (sheet) return sheet;
  try {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    sheetCache.set(css, sheet);
    return sheet;
  } catch {
    // Some browsers/contexts disallow constructable stylesheets — fall back.
    return null;
  }
}

function injectGlobalStyles(_container: Element, css: string): void {
  if (injectedCss.has(css)) return;
  const style = document.createElement("style");
  style.setAttribute("data-mountly-fallback", "");
  style.textContent = css;
  document.head.append(style);
  injectedCss.add(css);
}

export function attachShadow(
  container: Element,
  options: AdapterOptions,
): HTMLDivElement {
  const existing = mountNodes.get(container);
  if (existing) return existing;

  let root: ShadowRoot;
  try {
    root = container.attachShadow({ mode: options.shadowMode ?? "open" });
  } catch {
    const tag = container.tagName;
    if (!warnedTags.has(tag) && !warnedContainers.has(container)) {
      warnedTags.add(tag);
      warnedContainers.add(container);
      console.warn(
        `[mountly] <${tag.toLowerCase()}> cannot host a shadow root; ` +
          "falling back to light DOM. Styles may leak.",
      );
    }
    if (options.styles) injectGlobalStyles(container, options.styles);
    const lightMount = document.createElement("div");
    lightMount.setAttribute(MOUNT_ATTR, "");
    // Void elements (<img>, <input>, <br>, etc.) cannot host children — insert
    // the mount node as a sibling immediately after the container instead.
    const inserted = container.insertAdjacentElement("afterend", lightMount);
    // If the container has no parent it is detached from the document; the
    // insert is a no-op. Don't cache an unattached mount or future remounts
    // would keep reusing a node that never enters the DOM.
    if (!inserted) return lightMount;
    mountNodes.set(container, lightMount);
    return lightMount;
  }

  if (options.styles) {
    const sheet = getOrCreateSheet(options.styles);
    if (sheet) {
      // Adopted stylesheet: shared instance across all roots using this CSS.
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    } else {
      const style = document.createElement("style");
      style.textContent = options.styles;
      root.append(style);
    }
  }

  const mount = document.createElement("div");
  mount.setAttribute(MOUNT_ATTR, "");
  root.append(mount);
  mountNodes.set(container, mount);
  return mount;
}
