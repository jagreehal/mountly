/**
 * A props object Svelte 5 tracks.
 *
 * `mount()` reads its `props` once; a plain object handed to it is inert, so a
 * host updating a prop later would change nothing on screen. Runes only exist
 * in files the Svelte compiler processes, which is why this one is `.svelte.js`.
 */
export function reactiveProps(initial) {
  const props = $state({ ...initial });
  return props;
}
