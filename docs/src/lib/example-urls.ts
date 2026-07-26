/** Base URL for hosted live examples (GitHub Pages or astro dev). */
// BASE_URL is "/mountly" on Pages but "/" in dev, so normalise the trailing
// slash rather than assuming one. Concatenating it bare gave /mountlyexamples/.
export const EXAMPLES_BASE =
  import.meta.env.BASE_URL.replace(/\/$/, "") + "/examples/";

export function exampleUrl(path: string): string {
  return EXAMPLES_BASE + path.replace(/^\//, "");
}
