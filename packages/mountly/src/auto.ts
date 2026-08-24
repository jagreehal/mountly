/**
 * Drop-in bootstrap. One script tag, no JavaScript of your own:
 *
 * ```html
 * <script type="module" src="/mountly/auto.js"
 *         data-mountly-urls='{"cart":"/widgets/cart.js"}'></script>
 * ```
 *
 * The URL map is optional — `data-mountly` can hold the URL directly.
 */
import { mountly } from "./core.js";

const tag = document.querySelector<HTMLScriptElement>("script[data-mountly-urls]");
mountly({ urls: tag ? JSON.parse(tag.dataset.mountlyUrls as string) : undefined });
