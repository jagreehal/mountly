import { loadCatalog, render as renderTree } from "mountly-compose";

/**
 * The page side. `render` re-validates the tree against the catalog, creates
 * elements one by one (never innerHTML), and adds a team's embed script the
 * first time one of its tags appears.
 */
export const catalog = await loadCatalog(new URL("../registry.json", import.meta.url), {
  actions: await fetch(new URL("../actions.json", import.meta.url)).then((r) => r.json()),
});

export function render(tree, target) {
  renderTree(tree, target, catalog, { onLoad: (el) => log(`loaded ${el.team} embed`) });
}

/** The widget events the host has named an action for. Anything else stays in the widget. */
export const EVENTS = catalog.triggers();

const logEl = document.querySelector("#log");
export function log(line) {
  logEl.textContent = `${line}\n${logEl.textContent}`.slice(0, 2000);
}
