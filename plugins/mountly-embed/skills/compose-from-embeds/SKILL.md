---
name: compose-from-embeds
description: >
  Let a model compose a page from many teams' custom elements, with a catalog
  read from the `custom-elements.json` each team's embed build publishes. Use
  when the user wants an AI or agent to assemble pages from several teams'
  widgets, build an agent-driven dashboard or support page from existing
  components, answer widget events with a new page, show such a page inside
  Claude or ChatGPT, or asks about "generative UI" with mountly embeds. Use
  `mountly-compose`, and `mountly-mcp/compose` for MCP hosts. Keep the catalog
  in the teams' JSDoc and render through `render`, without `innerHTML`.
---

# Compose a page from many teams' custom elements

Each team publishes components as custom elements with `defineElementsConfig`.
The build writes `custom-elements.json` from the components' JSDoc and prop
types. `mountly-compose` reads those files into one catalog that gives the
system prompt, a JSON Schema, validation and rendering. The model returns a
tree of tags. The page checks it, creates the elements, and loads each team's
code the first time one of its tags appears.

## Do not

- Write a catalog by hand or copy descriptions into the host. Descriptions live
  as JSDoc next to each component, and a copy drifts from the source.
- Put model output on the page with `innerHTML`, or render a tree that failed
  `catalog.validate`. Validation stands between the model and the DOM.
- Rebuild the page on every turn. Send the current page.
- Send every DOM event to the model. Name the ones that matter as actions.
- Let a model report outcomes ("your dispute has been filed"). The host knows
  what it did, and `forAction` leaves out free-text elements unless the action
  shows them.
- Bundle a framework per team when several share a page. Build with
  `peer: true` and map one copy in an import map.

## Steps

1. **Every team documents its components.** The model reads the JSDoc on the
   component and on each prop. Say when to use the component as well as what
   it is. Write literal unions for choices (`status?: "paid" | "overdue"`) so
   the schema can enumerate them, and JSDoc tags for limits
   (`@minimum 1 @maximum 20`). Name callbacks after what happened
   (`onPickInvoice`, `onStartReturn`). The build warns when a name such as
   `onSubmit` shares its event with a native one.

   ```tsx
   interface Props {
     /** Customer id, e.g. `cus_1`. */
     customerId: string;
     /** Which invoices to show. Defaults to all of them. */
     status?: "paid" | "overdue" | "all";
     /** How many to show, newest first. @minimum 1 @maximum 20 */
     limit?: number;
     /** Fired when the user picks an invoice. Detail: `{ invoiceId }`. */
     onPickInvoice?: (detail: { invoiceId: string }) => void;
   }

   /** A customer's invoices. Use to find or check a particular charge. */
   export default function InvoiceList(props: Props) { … }
   ```

2. **Every team builds as a peer** when their widgets share a page:
   `defineElementsConfig({ prefix: "billing", elements: "src/*.tsx", peer: true })`.
   Publish `dist/`. The page needs `embed.js` and `custom-elements.json`.

3. **The host lists the teams** in a registry. Paths resolve against it:

   ```json
   {
     "teams": [
       { "id": "billing", "embed": "billing/embed.js", "elements": "billing/custom-elements.json" }
     ]
   }
   ```

4. **The host names its actions**: the widget events the agent answers, what
   each means, the params that pass through, and the widgets the next page
   must show.

   ```json
   {
     "show-invoice": {
       "description": "Show that invoice in full next to the list.",
       "on": ["billing-invoice-list:pick-invoice"],
       "params": ["invoiceId"],
       "show": ["billing-invoice-detail"]
     }
   }
   ```

   The catalog throws on an action that names an unknown tag or event.

5. **Server:** load the catalog and ask any model.

   ```ts
   import { loadCatalog } from "mountly-compose";

   const catalog = await loadCatalog(registryUrl, { actions });
   const action = event && catalog.action(event);
   const scope = action ? catalog.forAction(action, current) : catalog;
   const reply = await model({
     system: scope.prompt(),
     user: catalog.turn({ request, context, current, event }),
     format: scope.jsonSchema(), // constrained decoding, where the provider has it
   });
   const errors = scope.validate(tree, { require: action?.show });
   // On errors, try scope.repair(tree); send what remains back once.
   ```

   `context` holds the facts the model fills ids from: the signed-in customer
   and their orders.

6. **Page:** map the shared framework, render, and keep the tree.

   ```html
   <script type="importmap">
     {
       "imports": {
         "react": "…",
         "react/jsx-runtime": "…",
         "react-dom/client": "…",
         "mountly-react": "…",
         "mountly/embed": "…",
         "mountly-compose": "…"
       }
     }
   </script>
   ```

   ```ts
   import { render } from "mountly-compose";

   render(tree, main, catalog);
   current = tree;
   for (const name of catalog.triggers()) {
     main.addEventListener(name, (e) => {
       const event = { name, tag: e.target.tagName.toLowerCase(), detail: e.detail };
       if (catalog.action(event)) nextTurn({ event, current });
     });
   }
   ```

7. **Style the host layout.** `ui-stack`, `ui-grid` and `ui-note` belong to the
   page, so give them CSS. Pass different ones with
   `loadCatalog(url, { layout })`.

## Containers, streaming and MCP

- **Containers.** A component with `@slot` tags in its JSDoc holds other teams'
  widgets, and a child sets `"slot"` to fill a named one. Build that team with
  `shadow: true` so its slots project.
- **Streaming.** Render `catalog.repair(parsePartialTree(text)).tree` as the
  reply arrives. `render` keeps unchanged elements mounted. It matches by
  position, so a reorder remounts the widgets from that position on.
- **Inside Claude or ChatGPT.** `registerComposeApp` from `mountly-mcp/compose`
  turns the catalog into the `show_page` tool's description, and the agent
  composes. The view runs at a `null` origin, so serve embeds and the runtime
  with CORS.
- **Prop names.** Pick names the element does not already have (`title`,
  `hidden`, `id`). The runtime warns on those, and the browser shows `title` as
  a tooltip.

## Many widgets

Past a dozen widgets, one prompt pulls in near misses. Show the model
`catalog.menu()` first, let it pick five tags at most, then compose with
`catalog.narrow([...picked, ...tagsIn(current)])`. An action with `show`
names its widgets and skips the first pass.

## Descriptions compete

The model reads every component's description against every other one. Two
widgets that both claim "what do I owe" split the answer. A detail widget whose
JSDoc mentions "double charge" gets picked for "I was charged twice" before the
user has chosen an invoice.

- Give each question one owner. When a neighbour comes close, say in the JSDoc
  what the component is for and what it is not for.
- A component that needs an id the user picks (`invoiceId`) says so: "Needs an
  invoice the user has already picked; use the list to find one."
- Keep a suite of real prompts with the widgets each should produce, and rerun
  it whenever a team adds or rewords a component.

## Verify

- Every team's `custom-elements.json` has a `description` on each declaration
  and on each attribute a model fills
- `catalog.validate` rejects a tree with an unknown tag, attribute or value
- A widget event with an action produces an edited page that keeps what was
  there, and an event without one stays in its widget
- The network panel shows each team's `embed.js` once, and one React

[`docs/examples/ai-compose`](../../../../docs/examples/ai-compose) has four
teams, a host, an MCP server and a lab that compares strategies.
