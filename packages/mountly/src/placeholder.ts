/**
 * Pre-activation placeholders for features that take a beat to appear —
 * especially framed verticals that pay a second bootstrap.
 *
 * Not SSR hydration: the placeholder is static host- or CDN-supplied markup
 * shown until the feature mounts (or the frame reports ready), then removed.
 */

export type PlaceholderSource = string | HTMLElement | (() => string | HTMLElement);

const PLACEHOLDER_ATTR = "data-mountly-placeholder";

/**
 * Show a placeholder inside `container`. Returns a function that removes it.
 *
 * - String values are inserted as **text** by default (XSS-safe).
 * - Pass `{ html: true }` only for host-authored trusted markup.
 * - An `HTMLElement` is appended as-is.
 * - Inserts before the first `iframe` child when present so skeletons sit above
 *   a framed widget rather than after it.
 */
export function showPlaceholder(
  container: HTMLElement,
  placeholder: PlaceholderSource,
  options: { html?: boolean } = {},
): () => void {
  const resolved = typeof placeholder === "function" ? placeholder() : placeholder;
  const el = document.createElement("div");
  el.setAttribute(PLACEHOLDER_ATTR, "");

  if (typeof resolved === "string") {
    if (options.html) el.innerHTML = resolved;
    else el.textContent = resolved;
  } else {
    el.append(resolved);
  }

  const iframe = container.querySelector("iframe");
  if (iframe) container.insertBefore(el, iframe);
  else container.append(el);

  return () => {
    el.remove();
  };
}

/** Remove every `[data-mountly-placeholder]` descendant of `container`. */
export function clearPlaceholders(container: HTMLElement): void {
  for (const node of container.querySelectorAll(`[${PLACEHOLDER_ATTR}]`)) {
    node.remove();
  }
}

/**
 * Fetch a CDN- or same-origin HTML snippet and show it as a placeholder.
 * The response body is treated as trusted host/CDN markup (`html: true`).
 * Returns the clear function, or `null` when the fetch fails so callers can
 * keep a text stub.
 */
export async function showPlaceholderFromUrl(
  container: HTMLElement,
  url: string,
  options: { signal?: AbortSignal } = {},
): Promise<(() => void) | null> {
  try {
    const response = await fetch(url, { signal: options.signal });
    if (!response.ok) return null;
    const html = await response.text();
    return showPlaceholder(container, html, { html: true });
  } catch {
    return null;
  }
}
