# mountly-compose

A model composes one page from many teams' widgets, using what their builds
already publish.

Each team builds its components as custom elements with `defineElementsConfig`
from `mountly-vite-plugin`. The build emits `embed.js` and
`custom-elements.json`, with descriptions and prop types from the component's
own JSDoc and TypeScript. The host lists those two URLs per team in a registry:

```json
{
  "teams": [
    {
      "id": "billing",
      "embed": "https://cdn.acme.com/billing/embed.js",
      "elements": "https://cdn.acme.com/billing/custom-elements.json"
    }
  ]
}
```

```bash
pnpm add mountly-compose
```

## One catalog, every step

```ts
import { loadCatalog, render } from "mountly-compose";

const catalog = await loadCatalog("https://cdn.acme.com/registry.json");

// Server: ask any model. The schema is for providers with constrained decoding.
const reply = await model({
  system: catalog.prompt(),
  user: catalog.turn({ request: "Where's my parcel?", context: "Customer cus_1. Orders: ord_77." }),
  format: catalog.jsonSchema(),
});

// Page: validate, create elements, load each team's code on first use.
render(JSON.parse(reply), document.querySelector("main")!, catalog);
```

| Method                 | What it gives you                                                    |
| ---------------------- | -------------------------------------------------------------------- |
| `catalog.prompt()`     | System prompt: rules, tags, attributes, types, descriptions, actions |
| `catalog.jsonSchema()` | JSON Schema of a valid tree, with each prop's schema                 |
| `catalog.validate(t)`  | Every reason a tree may not render; `{ require }` adds missing ones  |
| `catalog.repair(t)`    | The tree without its invalid parts, and a list of what it removed    |
| `catalog.menu()`       | One line per widget, for a first pass that picks what to use         |
| `catalog.narrow(tags)` | Host layout plus those tags, for the second pass                     |
| `catalog.turn({…})`    | The next user message, with the current page and any action          |
| `catalog.action(e)`    | The host action a widget event takes, with its declared params       |
| `catalog.forAction(a)` | The catalog for answering that action                                |
| `catalog.triggers()`   | The event names a host listens for                                   |
| `render(t, el, c)`     | The tree on the page, changing only what differs                     |
| `parsePartialTree(s)`  | The tree so far, from a reply still streaming in                     |
| `connectView(app, el)` | A composed page inside an MCP Apps view                              |

## Edit the page

Pass the page on screen as `current`. The model changes what the turn calls for
and keeps the rest:

```ts
const user = catalog.turn({ current, request: "Only the overdue ones, please." });
```

## Actions

Teams publish events, and the host decides what each one means. Name an action
for each event the agent answers, with the detail keys it may see and the
widgets the next page must include:

```ts
const catalog = await loadCatalog(registryUrl, {
  actions: {
    "show-invoice": {
      description: "Show that invoice in full next to the list.",
      on: ["billing-invoice-list:pick-invoice"],
      params: ["invoiceId"],
      show: ["billing-invoice-detail"],
    },
  },
});

for (const name of catalog.triggers()) {
  main.addEventListener(name, (e) => {
    const event = { name, tag: e.target.tagName.toLowerCase(), detail: e.detail };
    const action = catalog.action(event);
    if (!action) return;
    const scope = catalog.forAction(action, current);
    // Ask with scope.prompt(), scope.jsonSchema() and catalog.turn({ current, event }),
    // then check with scope.validate(tree, { require: action.show }).
  });
}
```

`forAction` keeps the widgets the action shows, the widgets on the page and the
host's containers. It includes the host's text element (`ui-note`) when the
action lists it, which leaves reporting outcomes to the host. The catalog throws
on an action that names an unknown tag or event.

## Prop schemas

The embed build turns each prop's TypeScript type into a JSON Schema, and JSDoc
tags add constraints: `/** How many. @minimum 1 @maximum 20 */ limit?: number`.
`validate` checks bounds, lengths, patterns, nested objects, arrays and required
keys, and `jsonSchema()` hands the same schema to constrained decoding.
`validate` reads HTML text values (`limit="5"`) the way the element reads them.
Objects and arrays render as JSON attributes, which the element parses.

## Repair

`repair` removes invented tags, stray attributes, out-of-range values and
children of leaf elements, and lists what it removed. When the rest validates,
you skip a model call. Ask the model again when a required widget is missing.

## Containers

A component with `@slot` tags in its JSDoc holds other teams' widgets:

```tsx
/**
 * A titled panel grouping the widgets that explain one problem.
 * @slot - The widgets that explain it.
 * @slot actions - What the user can do next.
 */
export default function CasePanel({ heading }: { heading: string }) { … }
```

A child names the slot it fills (`"slot": "actions"`), and a child without one
goes in the default slot. Slots project through shadow DOM, so build that team
with `shadow: true`. The build warns when you don't.

## Streaming

`parsePartialTree(text)` reads a reply as it arrives. A leaf appears once it is
complete and a container once its children begin, so each element renders with
its final attributes:

```ts
for await (const chunk of stream) {
  text += chunk;
  const partial = catalog.repair(parsePartialTree(text)).tree;
  if (partial) render(partial, main, catalog);
}
```

## Rendering again

`render` into the same target keeps an element when the element at the same
position has the same tag and slot. It updates the kept element's changed
attributes, and the widget stays mounted. Streaming and edit turns rely on this.

Matching goes by position. There are no keys and no move detection:

- Appending, removing from the end, and changing attributes keep widgets mounted.
- Inserting before an element, or reordering, rebuilds every element from that
  position on, and those widgets remount.
- A different tag or slot in a position creates a new element.

Models edit by appending and changing attributes most of the time. Expect moved
widgets to reload when a turn reorders the page.

## In an MCP host

[`mountly-mcp/compose`](../mcp-apps/README.md#compose-from-teams-elements) serves
the catalog through a `show_page` tool. The agent composes the page and the
`ui://` view renders it with `connectView`, which also sends a widget action to
the agent as its next turn:

```ts
import { App } from "@modelcontextprotocol/ext-apps";
import { connectView } from "mountly-compose";

const app = new App({ name: "my-view", version: "1.0.0" });
connectView(app, document.querySelector("main")!, {
  request: "Show the updated page with show_page.",
});
await app.connect();
```

## Big catalogs

With dozens of widgets, one prompt pulls in near misses. Show the model
`catalog.menu()` first and let it pick a handful of tags, then compose with
`catalog.narrow(picked)`. When editing, include the tags already on the page.

## Safety

`render` refuses a tree that fails `validate`, creates elements one at a time
without `innerHTML`, and writes attributes as strings and host layout text as
`textContent`. A model can name only the tags, attributes and values the teams
published.

The host owns layout (`ui-stack`, `ui-grid`, `ui-note`) and styles it with the
page's CSS. Pass your own with `loadCatalog(url, { layout })`.

When several teams' widgets share a page, build them with `peer: true` and map
one React (or Vue, or Svelte) in an import map.

`mountly-compose` has no dependencies. Bring any model client: the catalog
produces strings, a JSON Schema and a validator.

[`docs/examples/ai-compose`](../../docs/examples/ai-compose) has a working
host, four teams and a lab that compares composition strategies.
