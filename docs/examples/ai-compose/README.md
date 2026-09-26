# Generative UI from multi-team embeds

A model composes one page from four teams' widgets. Billing, shipping, support
and cases each ship React components as script-tag custom elements with
`defineElementsConfig`. Each build emits `embed.js` and `custom-elements.json`,
and the JSDoc on every component and prop lands in that file. The host gets a
registry of those URLs and nothing else. `mountly-compose` reads the files into
the catalog the model works from.

The host owns layout (`ui-stack`, `ui-grid`, `ui-note`). `cases` publishes a
panel that holds the other teams' widgets.

```
teams/*/src/*.tsx  →  custom-elements.json (descriptions, types, schemas, slots)
                    →  mountly-compose catalog
                    →  model → validated tree → custom elements on the page
```

## Run

You need [Ollama](https://ollama.com) or a hosted model (`OLLAMA_BASE_URL`,
`MODEL`), and network access for React from esm.sh. From the repository root:

```sh
pnpm install
pnpm --filter mountly --filter mountly-react --filter mountly-vite-plugin --filter mountly-compose build
pnpm --filter ai-compose-example build
pnpm --filter ai-compose-example serve
```

Open <http://localhost:5199/host/>, pick a strategy, and ask "Where's my
parcel?" or "Show only my overdue invoices."

| Strategy      | What the model does                                          | Path         |
| ------------- | ------------------------------------------------------------ | ------------ |
| `shortlist`   | Picks up to 5 tags from one-line descriptions, then composes | **product**  |
| `constrained` | Writes a JSON tree against the catalog's schema              | **product**  |
| `html`        | Writes custom-element markup, which the lab parses           | lab baseline |
| `spec`        | Writes `@json-render/core` spec patches                      | lab baseline |
| `choose`      | Picks among prepared recipes with `@json-render/core`        | lab baseline |

The product path is `mountly-compose` with `shortlist` or `constrained`, and it
has no json-render dependency. The `spec` and `choose` baselines use a build of
`@json-render/core` kept in `lab/vendor/`. `choose` runs with Jev as its
evaluator when you set `MODELS=jev` and `TYPESAFE_API_KEY`.

For a hosted model, `MODELS=opencode/<id>` calls an OpenAI-compatible host
through `HOSTED_BASE_URL` and `HOSTED_API_KEY`. Run with `node --env-file=…` to
keep keys out of the repo.

### Check descriptions

Every component's JSDoc competes with every other component's for the model's
attention. When a team adds or rewords a widget, rerun the prompt suite. It
exits non-zero below the floor:

```sh
pnpm --filter ai-compose-example check:descriptions   # MODELS=…, MIN_CORRECT=…
```

The full lab runs every strategy against every prompt and writes to
`lab/results/`:

```sh
pnpm --filter ai-compose-example lab
# MODELS=… STRATEGIES=html,choose PROMPTS=0,1 pnpm --filter ai-compose-example lab
```

### Inside an MCP host

`mcp/server.mjs` serves the same catalog through the `show_page` tool from
`mountly-mcp/compose`, and the agent composes the page. Keep `pnpm serve`
running, then:

```sh
pnpm --filter ai-compose-example mcp:preview   # mountly-mcp's dev host, real sandbox
pnpm --filter ai-compose-example mcp:stdio     # for Claude Desktop and other hosts
```

The preview's samples call the real tool. Click an invoice in the view and the
host logs the `ui/message` it would post to the agent.

## What to notice

- **Teams share no code.** Descriptions live next to the components as JSDoc,
  and `custom-elements.json` publishes them.
- **One catalog object.** `mountly-compose` builds the prompt, the JSON Schema,
  validation and rendering from the registry. `render` checks every tag,
  attribute and value, creates elements one at a time, and loads a team's embed
  the first time one of its tags appears.
- **A container team.** `<cases-case-panel>` declares `@slot`s, so other teams'
  widgets go inside it. The `cases` build uses `shadow: true`, which slots need.
- **Streaming.** The host renders each partial tree as it arrives and keeps the
  widgets already on the page mounted.
- **Actions.** `actions.json` names the widget events the agent answers
  (`show-invoice`, `dispute-charge`), the params it sees, and the widgets the
  next page must show. Every other event stays inside its widget. On a dispute
  turn the catalog leaves out `ui-note`, so the host reports outcomes.
- **Turns edit the page.** The host sends the tree on screen with each turn.
  Click an invoice and its detail appears next to the list. **Start over**
  clears the page.
- **One React.** Each team builds with `peer: true`. Its `embed.js` weighs about
  2 KB and takes `react` and `mountly-react` from the host's import map.
- **Detail widgets close the loop.** The `pick-invoice` event becomes the next
  turn, and `billing-invoice-detail` gives the model something to show for it.
- **Two passes for big catalogs.** `shortlist` picks five tags at most, then
  composes from those. A single prompt over dozens of widgets pulls in near
  misses.
- **Literal types.** `status?: "paid" | "overdue" | "all"` reaches the catalog
  as three values, which constrained decoding can enumerate.
- **Event names.** Name callbacks after what happened (`onStartReturn`). The
  build warns when a callback shares its event name with a native event such
  as `submit`.
