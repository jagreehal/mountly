# mountly-compose

## 0.1.0

### Minor Changes

- 490a27f: Compose pages from many teams' custom elements.
  
  - `mountly-vite-plugin`: `custom-elements.json` carries each component's and prop's JSDoc, each prop's type as written, a JSON Schema per prop with constraints from JSDoc tags (`@minimum`, `@maximum`, `@pattern`), and the component's `@slot`s. `peer: true` leaves the framework and runtime to the page's import map, so several distributions share one React. The build warns on callback names that match native events and on slots in light-DOM builds.
  - `mountly`: script-tag elements keep the children the page slots into them and project them through shadow DOM, including children added after mount.
  - `mountly-compose`: `loadCatalog` reads a registry of teams into one catalog for the system prompt, a JSON Schema, validation, repair, two-pass selection and edit turns. Host actions name the widget events an agent answers. `parsePartialTree` renders replies as they stream, `render` updates the page in place, and `connectView` runs a composed page in an MCP Apps view.
  - `mountly-mcp`: `mountly-mcp/compose` registers a `show_page` tool and `ui://` view, so the agent composes pages from the catalog. The dev host answers `ui/message`.
