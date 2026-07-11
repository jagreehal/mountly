# mcp-generative-demo

**A generative UI that builds itself, then navigates itself, inside an agent.**

An AI emits a UI spec constrained to a catalog. [`@json-render`](https://github.com/vercel-labs/json-render)'s streaming compiler assembles it live, native components and all. Click a generated button and it drives the agent to generate the _next_ view, which streams in over the last. No iframe-runtime, no generated code, no arbitrary HTML, and almost no app code, because [`mountly-mcp/json-render`](../../packages/adapters/mountly-mcp) owns the ceremony.

Built with **Geist** (hi, Vercel) on a dark, OKLCH palette.

## See it

```bash
sandbox pnpm --filter mcp-generative-demo preview:stream     # build the hero demo
python3 -m http.server 5193 --directory docs/examples/mcp-generative-demo/preview/stream-dist
# open http://localhost:5193 — the dashboard streams in, then click "Break down Q3 by region →"
```

The whole self-driving app, after the library absorbs the streaming:

```tsx
function App({ specs }) {
  const [view, setView] = useState("overview");
  const { spec, state, loading } = useSpecStream(specs[view]); // ← json-render streams it in
  return (
    <GeneratedUI
      spec={spec}
      state={state}
      loading={loading}
      onAction={(_, p) => setView(p.prompt.includes("overview") ? "overview" : "q3")}
    />
  );
}
```

`useSpecStream` is the library doing the work: json-render's `createSpecStreamCompiler`, the patch replay, the `loading` flag, and stream cancellation when you navigate, all inside the hook.

## How little you write

| You write                                                       | The library does                                                                                   |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `catalog.ts`, the vocabulary (zod)                              | `catalog.prompt()` → the system prompt for the model                                               |
| `registry.tsx`, `defineComponents(catalog, {...})`              | types the map, builds the renderer                                                                 |
| `widget.tsx`, `createGenerativeWidget({ catalog, components })` | read tool result · resolve `$state` · stream · bridge actions to the agent · MCP `ui://` packaging |
| `useSpecStream(spec)` in the preview                            | the compiler, replay, loading, cancellation                                                        |

## Deeply json-render

Everything generative is json-render's machinery, used directly: `defineCatalog` · `createRenderer` · `createSpecStreamCompiler` / `compileSpecStream` · `autoFixSpec` · `$state` data-binding · the action system. `mountly-mcp/json-render` adds only what json-render doesn't have: **MCP delivery** (render inside an agent host) and **the agent loop** (a generated button → `App.sendMessage` → the model generates the next view).

## Also in here

```bash
sandbox pnpm --filter mcp-generative-demo verify        # in-process MCP loop + actions bridge
sandbox pnpm --filter mcp-generative-demo test          # native render · $state · action bridge
sandbox pnpm --filter mcp-generative-demo preview:host   # the real two-origin MCP Apps host harness
node docs/examples/mcp-generative-demo/generate-live.mjs "..."  # a real model generates a spec (blocking)
node docs/examples/mcp-generative-demo/stream-live.mjs "..."    # watch it build LIVE, element by element
```

`generate-live.mjs` / `stream-live.mjs` switch model with `GEN_PROVIDER` (`ollama`/`groq`/`google`/`mistral`); keys come from env. `stream-live.mjs` is the real token → JSONL patch → spec path (`streamSpec` → json-render's stream compiler). You watch the element count climb as the model emits each patch (≈10s, 5 elements on Granite-3B locally). A 3B local model drives it, and catalog clarity matters more than model size (one paragraph of catalog `description` made Granite-3B, Gemini, and Groq-70B all produce fully agent-wired UIs).

## Share kit

If this is worth showing off, lead with json-render. It's the star:

> Generative UI that **builds itself and then navigates itself.**
> @json-render emits the spec, its streaming compiler assembles it live, and clicking a generated button drives the model to generate the next view, all inside an MCP agent host.
> ~15 lines of app code; the streaming + agent loop is a hook.

Attach: `preview/stream-dist/generative-ui.webm` (the recorded loop) or the overview/Q3 screenshots. The honest one-liner: json-render does the generative UI; this puts it inside an agent and lets it answer back.
