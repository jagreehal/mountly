# mountly-json-render

**Generative UI for mountly.** Render [`@json-render`](https://github.com/vercel-labs/json-render) specs as MCP Apps widgets — with the agent-action bridge json-render doesn't have. An AI emits a UI spec constrained to a catalog; mountly renders it as **real native components** inside an MCP host, and the rendered UI's actions call back into the **agent**.

Thin wrapper over [`@json-render/*`](https://www.npmjs.com/package/@json-render/core), [`mountly-mcp-react`](https://www.npmjs.com/package/mountly-mcp-react), and the [`ai`](https://www.npmjs.com/package/ai) SDK.

## Install

```bash
npm i mountly-json-render @json-render/core @json-render/react mountly-mcp mountly-mcp-react mountly-react
# server-side generation also needs the AI SDK:
npm i ai
```

## Widget — one call

`createGenerativeWidget` collapses catalog → registry → renderer → `$state` → action-bridge into a single call:

```tsx
import { createGenerativeWidget } from "mountly-json-render";
import { catalog } from "./catalog";       // defineCatalog(schema, {...})
import { components } from "./registry";    // { Card: ..., Metric: ..., Button: ... }
import styles from "./styles.css";

const widget = createGenerativeWidget({ catalog, components, styles, shadow: true });
(globalThis as { __mountlyMcpWidget__?: unknown }).__mountlyMcpWidget__ = widget;
```

The widget reads the spec from the tool result, resolves `$state` bindings from `spec.state`, and routes actions to the MCP host. By default an `ask` action with a string `prompt` sends a follow-up turn via `App.sendMessage`; override with `onAction(name, params, mcp)`.

## Server — `streamSpec`, one function for both

`streamSpec` is **model-agnostic** (pass any AI SDK `LanguageModel`) and returns one handle you can both **await** for the final spec and **iterate** for the live build — the same shape as the AI SDK's own `streamText`:

```ts
import { streamSpec } from "mountly-json-render/server";
import { ollama } from "ai-sdk-ollama"; // or @ai-sdk/google, @ai-sdk/groq, …

// Blocking — e.g. an MCP tool returning structuredContent:
const { spec, issues } = await streamSpec({
  catalog,
  model: ollama("granite4.1:3b"),
  prompt: "a revenue dashboard with 3 KPIs and an 'ask for Q3' button",
}).result;
// return as the tool result: { structuredContent: { spec } }

// Live — watch the UI assemble itself, element by element:
const ui = streamSpec({ catalog, model: ollama("granite4.1:3b"), prompt });
for await (const partial of ui.partialSpecStream) render(partial);
const { spec } = await ui.result;
```

The request starts immediately; `result` / `spec` resolve whether or not you touch the stream. No JSON-mode or tool-calling required (it uses `catalog.prompt()` + JSONL patches + `autoFixSpec`), so a small local model can drive it — keep prompts concise and lean on the catalog `description`s; a tiny model wanders on long, multi-clause prompts.

For an HTTP route, return `streamText(...).toTextStreamResponse()` (JSONL patches) and consume it on the client with `useUIStream` (below). `compileTextStreamToSpecs(textStream)` is the underlying driver — point it at any `AsyncIterable<string>` (a model stream, a saved transcript, a custom transport) to get progressive specs.

## Streaming on the client — two ways

**Replay a known spec** (e.g. one an MCP tool already delivered): `useSpecStream` owns all the ceremony (json-render's compiler, the patch replay, the `loading` flag, cancellation when the spec changes). Feed it a spec; render the result. Self-driving is just swapping the spec in `onAction`:

```tsx
import { createRenderer, useSpecStream } from "mountly-json-render";

const Dashboard = createRenderer(catalog, components);

function App({ specs }) {
  const [view, setView] = useState("overview");
  const { spec, state, loading } = useSpecStream(specs[view]); // streams it in
  return (
    <Dashboard
      spec={spec}
      state={state}
      loading={loading}
      onAction={(_, p) => setView(route(p.prompt))} // a generated button picks the next view
    />
  );
}
```

That's the whole self-navigating generative UI. The hook re-streams (and cancels the prior stream) whenever the spec changes. Pair `specToPatchLines` (replay a known spec as a stream) with `createSpecStreamCompiler` (compile patches back into a spec) if you need the primitives directly.

**Stream live from a model**: `useUIStream` / `useChatUI` are json-render's own client hooks, re-exported here. Point `useUIStream` at an endpoint that streams JSONL patches (your `streamSpec` route) and it renders the spec as it builds:

```tsx
import { useUIStream } from "mountly-json-render";

const { spec, isStreaming, send } = useUIStream({ api: "/api/generate" });
// send("a revenue dashboard with 3 KPIs"); then render <Dashboard spec={spec} />
```

## Native rendering (non-MCP)

`createRenderer` is re-exported for previews/tests or a plain mountly feature:

```tsx
import { createRenderer } from "mountly-json-render";
const Dashboard = createRenderer(catalog, components);
// <Dashboard spec={spec} state={spec.state} />
```

## API

| Export | Entry | Purpose |
|---|---|---|
| `createGenerativeWidget(opts)` | `.` | json-render catalog + components → MCP widget |
| `defineComponents(catalog, map)` | `.` | type a components map once, reuse it |
| `defaultActionRouter` / `ActionRouter` | `.` | the `ask` → `sendMessage` bridge (overridable) |
| `useSpecStream(spec, opts?)` | `.` | **replay** a known spec progressively (compiler + cancellation, included) |
| `useUIStream` / `useChatUI` | `.` | **live** client hooks — stream a spec from an endpoint (json-render's, re-exported) |
| `compileTextStreamToSpecs(stream)` | `.` · `./server` | drive json-render's compiler from any text stream → progressive specs |
| `specToPatchLines` / `createSpecStreamCompiler` / `createJsonRenderTransform` | `.` | streaming primitives (replay / compile / AI-SDK transform) |
| `createRenderer` | `.` | native (non-MCP) renderer (re-export) |
| `streamSpec(opts)` | `./server` | catalog + AI SDK model → a handle: `await .result` (final) or iterate `.partialSpecStream` (live) |

See [`examples/mcp-generative-demo`](../../../examples/mcp-generative-demo) for a full demo (local + hosted models, browser preview, and a real MCP Apps host harness).
