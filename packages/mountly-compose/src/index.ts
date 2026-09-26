/**
 * Compose one page from many teams' custom elements.
 *
 * The catalog is not written by hand: it is read from each team's
 * `custom-elements.json`, which the mountly embed build emits with the
 * component's JSDoc and its props' types as written. One catalog object then
 * drives everything a host needs — the system prompt, a JSON Schema for
 * constrained decoding, validation of what the model returned, the message for
 * the next turn, and rendering with each team's code loaded on first use.
 */

/** Where each team's embed script and description file live. */

export {
  type ActionDefinition,
  type Actions,
  type Catalog,
  type CatalogAttribute,
  type CatalogElement,
  type CatalogEvent,
  type CatalogOptions,
  type LoadCatalogOptions,
  type PromptOptions,
  type Registry,
  type ResolvedAction,
  type Tree,
  type TurnEvent,
  type TurnOptions,
  createCatalog,
  DEFAULT_LAYOUT,
  elementsFromCem,
  loadCatalog,
  tagsIn,
} from "./catalog.js";
export { parsePartialTree } from "./partial.js";
export { render, type RenderOptions } from "./render.js";
export { connectView, type ConnectViewOptions, type ViewApp, type ViewPayload } from "./view.js";
