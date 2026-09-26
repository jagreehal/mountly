/** Running a composed page inside an MCP Apps view. */
import { type Actions, type CatalogElement, createCatalog, type Tree } from "./catalog.js";
import { render } from "./render.js";

/**
 * The parts of an MCP Apps `App` (`@modelcontextprotocol/ext-apps`) a composed
 * view uses. Typed structurally, so this package does not depend on it.
 */
export interface ViewApp {
  ontoolresult?: ((params: { structuredContent?: unknown }) => void) | undefined;
  sendMessage(message: { role: "user"; content: Array<{ type: "text"; text: string }> }): unknown;
  sendLog?(params: { level: "error"; data: string }): unknown;
}

/** What a compose tool returns as `structuredContent`. */
export interface ViewPayload {
  page: Tree;
  elements: CatalogElement[];
  actions?: Actions;
}

export interface ConnectViewOptions {
  /** Appended to each turn sent to the agent, e.g. "Show the updated page with show_page." */
  request?: string;
}

/**
 * Render each tool result into `target`, and turn a widget action into the
 * agent's next message, with the page as it is now. Call before
 * `app.connect()` so the first result is not missed.
 *
 * A result that cannot be rendered is reported through `sendLog`: a blank
 * iframe says nothing, the host's log says why.
 */
export function connectView(app: ViewApp, target: Element, options: ConnectViewOptions = {}): void {
  let catalog: ReturnType<typeof createCatalog> | undefined;
  let current: Tree | undefined;
  const listening = new Set<string>();

  const listen = () => {
    for (const name of catalog?.triggers() ?? []) {
      if (listening.has(name)) continue;
      listening.add(name);
      target.addEventListener(name, (event) => {
        if (!catalog || !(event.target instanceof Element)) return;
        const turn = {
          name,
          tag: event.target.tagName.toLowerCase(),
          detail: (event as CustomEvent).detail,
        };
        if (!catalog.action(turn)) return;
        const text = catalog.turn({ current, event: turn, request: options.request });
        void app.sendMessage({ role: "user", content: [{ type: "text", text }] });
      });
    }
  };

  app.ontoolresult = ({ structuredContent }) => {
    const payload = structuredContent as Partial<ViewPayload> | undefined;
    if (!payload?.page) return;
    try {
      catalog = createCatalog(payload.elements ?? [], { actions: payload.actions });
      render(payload.page, target, catalog);
      current = payload.page;
      listen();
    } catch (error) {
      void app.sendLog?.({
        level: "error",
        data: String(error instanceof Error ? error.message : error),
      });
    }
  };
}
