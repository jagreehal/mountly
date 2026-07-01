/** Base URL for hosted live examples (GitHub Pages or astro dev). */
export const EXAMPLES_BASE = import.meta.env.BASE_URL + "examples/";

export function exampleUrl(path: string): string {
  return EXAMPLES_BASE + path.replace(/^\//, "");
}
