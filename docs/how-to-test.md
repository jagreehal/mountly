# How to Test mountly-mcp

A practical, layered guide for verifying the MCP Apps adapter family: `mountly-mcp`, `mountly-mcp-react/vue/svelte`, and `mountly-mcp-server`. Walks through what's automated, what isn't, and what each tier actually proves.

**Read this with `docs/protocol-layering.md` for the protocol-level positioning. This doc is the practical runbook.**

---

## TL;DR — three commands

```bash
# Tier 1 — workspace sanity (seconds, no browser)
pnpm -r typecheck && pnpm -r build && pnpm lint && pnpm test:unit

# Tier 2 — MCP automated verification (unit + Playwright e2e)
# needs `pnpm exec playwright install` first
pnpm test:mcp:verify

# Tier 2.5 — runnable MCP Apps demo verification (no external host needed)
pnpm test:mcp:demo

# Tier 3 — real-host smoke tests (manual; no AI key needed for the free hosts)
# See "Real-host smoke tests" below.
```

If you only have ten minutes, run the first command. If you're shipping anything to users, do at least one real-host smoke test against Claude Desktop.

---

## What "it works" actually means

| # | Claim | How verified | Cost |
|---|---|---|---|
| 1 | Code compiles and the workspace builds. | `pnpm -r typecheck && pnpm -r build` | seconds, free |
| 2 | Protocol primitives behave per spec against synthetic event streams. | `pnpm test:unit` | seconds, free |
| 3 | Built widget round-trips through `runBridge` from a real React/Vue/Svelte component. | E2E tests in `pnpm test:unit` | already in 2 |
| 4 | Bridge works inside a real Chromium iframe. | `pnpm test:mcp:e2e` | ~10 sec after one-time Playwright install |
| 5 | A real MCP host (Claude Desktop, VS Code, Goose, ChatGPT) renders the widget. | Manual smoke tests below | manual |

Claims 1-4 are automated. Claim 5 is what makes "ships to users" real, and requires manual testing.

---

## Tier 1 — Workspace sanity

The cheapest gate. Run on every change.

```bash
pnpm install                   # if you haven't yet
pnpm -r typecheck              # all packages
pnpm -r build                  # all packages emit dist/
pnpm lint                      # ESLint boundary rules
```

**What this proves:**
- Every package typechecks with strict TS (`verbatimModuleSyntax`, `noUncheckedIndexedAccess`, ES2020 ESM)
- `tsup` emits valid ESM + `.d.ts`
- ESLint passes

**What it does NOT prove:**
- Anything about runtime correctness

---

## Tier 2 — Vitest unit + story tests

The bulk of the automated coverage. Fast to run locally (typically a couple of seconds) and broad across bridge/build/server + framework adapters.

```bash
pnpm test:unit                 # vitest run — runs every tests/*.story.test.ts
```

Single suite:

```bash
pnpm vitest run tests/mcp-bridge.story.test.ts
```

MCP family only:

```bash
pnpm test:mcp:unit             # glob: tests/mcp-*.story.test.ts
```

### What each suite proves

| File | Subject | Key invariants |
|---|---|---|
| `mcp-channel.story.test.ts` | JSON-RPC channel | Request/response correlation, notification dispatch, origin guard (rejects non-parent source), timeout, close rejects pending |
| `mcp-host.story.test.ts` | `createMcpHost` factory | `callTool` round-trip, subscription delivery + unsubscribe, `openLink` fire-and-forget, `requestDisplayMode` + `onDisplayModeChange` |
| `mcp-bridge.story.test.ts` | `runBridge` lifecycle | Initialize handshake, mount on first tool-result, update on subsequent, async queue serialization, teardown, error boundaries (initialize-timeout, mount-throw, missing structuredContent) |
| `mcp-build.story.test.ts` | Build step | `emitMeta` defaults, `emitHtml` self-contained + CDN modes, CSP origin merging, HTML attribute + `</script>` / `</style>` escaping, sidecar `.meta.json` shape |
| `mcp-server.story.test.ts` | `createMcpAppServer` | Resource + tool registration via real `@modelcontextprotocol/sdk` `Server` + in-memory transport pair, URI/sidecar mismatch fails at boot |
| `mcp-react.story.test.ts` + `mcp-react-e2e.story.test.ts` | React adapter | `useMcpHost` context, `useMcpToolResult` subscribe + unsubscribe, `createMcpWidget` mounts React with `mcp` bridged into context, E2E React widget through `runBridge` |
| `mcp-vue.story.test.ts` + `mcp-vue-e2e.story.test.ts` | Vue 3 adapter | Same surface via composables + `provide`/`inject` |
| `mcp-svelte.story.test.ts` + `mcp-svelte-e2e.story.test.ts` | Svelte 5 adapter | Same surface via `mount({ context })` interop and Svelte stores |

**What this layer proves:**
- Every protocol primitive matches its specified contract
- State machines (bridge lifecycle, runtime state) behave correctly against synthetic event streams
- All failure modes from spec §5 are exercised

**What it does NOT prove:**
- JSDOM is not a real browser — module scripts, certain DOM APIs, and full iframe sandbox semantics differ
- The fakes for channels and transports are constructed by us; if our fake is wrong, the test passing means nothing
- Real MCP hosts may have undocumented behaviors not in the spec

---

## Tier 3 — Playwright browser

The bridge actually runs inside Chromium. Closes the "JSDOM vs real browser" gap.

### First-time setup

```bash
pnpm exec playwright install   # downloads Chromium + Firefox + WebKit binaries (~500 MB)
```

Once per machine.

### Run

```bash
pnpm test:mcp:e2e              # runs tests/bridge-pure-ui-libraries.spec.ts
```

Or unified:

```bash
pnpm test:mcp:verify           # test:mcp:unit + test:mcp:e2e
```

For debugging:

```bash
pnpm test:ui                   # Playwright UI mode with timeline scrubbing
pnpm test:headed               # headed Chromium so you can watch
```

### Test file

- `tests/bridge-pure-ui-libraries.spec.ts` — pure framework UI libraries (React, Vue, Svelte) rendered both directly and through the mountly bridge in Chromium. Confirms the bridge pattern doesn't break framework-native rendering.

### What this tier specifically adds over Tier 2

| Concern | Tier 2 (JSDOM) | Tier 3 (Playwright) |
|---|---|---|
| `<script type="module">` execution | Partial (shimmed) | Real ESM module execution |
| Full iframe sandbox | Simulated via two-window pattern | Real cross-origin iframe with CSP enforced by Chromium |
| `postMessage` semantics | JSDOM's simplified impl | Real Chromium implementation |
| `beforeunload` teardown | Synchronous in JSDOM | Real browser event loop |
| Image / font / media in widget | Limited | Full |

If a bug only repros in Tier 3 but not Tier 2, that's a real "browser behaves differently from JSDOM" finding — worth filing.

---

## Real-host smoke tests

This is the layer that makes "actually works in production" real. No automated test in this repo covers it; you have to do it manually.

The good news: **steps 1-3 below need no API keys**. They use locally-runnable hosts.

### Step 1: Claude Desktop (no key — uses your Claude account)

The single highest-value smoke test. If it works here, the MCP Apps path is real.

**Setup:**

1. Install Claude Desktop from claude.ai. Sign in with your existing account.
2. Build the workspace:

   ```bash
   cd /Users/jreehal/dev/js/r/mountly
   pnpm -r build
   ```

3. Create a test MCP server script. Save as `~/mcp-test/server.mjs`:

   ```js
   import { createMcpAppServer } from "mountly-mcp-server";
   import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
   import { fileURLToPath } from "node:url";
   import { dirname, resolve } from "node:path";

   const __dirname = dirname(fileURLToPath(import.meta.url));

   const server = createMcpAppServer({
     name: "mountly-test",
     version: "0.0.1",
     widgets: [
       {
         uri: "ui://mountly-test/hello",
         htmlPath: resolve(__dirname, "hello.html"),
         tool: {
           name: "say_hello",
           description: "Render a hello widget",
           inputSchema: {
             type: "object",
             properties: { name: { type: "string" } },
           },
           handler: async ({ name }) => ({
             structuredContent: { greeting: `Hello, ${name}!` },
           }),
         },
       },
     ],
   });

   await server.listen(new StdioServerTransport());
   ```

   Build a `hello.html` widget alongside it using one of the framework adapters and `buildMcpResource` (see "Setting up an example widget" below).

4. Open Claude Desktop's config:

   ```bash
   # macOS
   open ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

5. Register the server:

   ```json
   {
     "mcpServers": {
       "mountly-test": {
         "command": "node",
         "args": ["/Users/<you>/mcp-test/server.mjs"]
       }
     }
   }
   ```

6. Restart Claude Desktop. Open a new conversation. Ask: "Use the say_hello tool with name='world'".

**What to verify:**

- Claude calls the tool (tool invocation appears in the conversation UI)
- The widget renders inline in the chat (the load-bearing visual proof)
- The widget receives `{ greeting: "Hello, world!" }` as props
- Clicking buttons fires `mcp.callTool` / `mcp.openLink` back to the server (check server logs)

If the widget never appears:
- `_meta.ui.resourceUri` not attached to the tool registration → check `mountly-mcp-server` logs
- Claude Desktop's MCP Apps support is version-gated → make sure you're on the latest build
- CSP rejecting inlined content → check Chromium devtools (right-click widget → Inspect)

### Step 2: VS Code MCP support (no key)

Same server, register in VS Code's MCP config. Useful for cross-host portability — if it renders in both Claude Desktop and VS Code, you're hitting the standard, not host-specific behavior.

### Step 3: Goose (no key — open source MCP host)

```bash
brew install goose-cli         # or per their install docs
goose configure                # add the mountly-test server
goose session
```

Same drill — invoke the tool, check the widget renders.

### Step 4: ChatGPT via OpenAI Apps SDK (OpenAI dev account required)

ChatGPT's Apps SDK builds on MCP Apps and accepts the same `_meta.ui.resourceUri` linkage:

1. Sign up for the OpenAI Apps SDK developer program
2. Register your MCP server endpoint
3. Test from your ChatGPT account

The Apps SDK adds some ChatGPT-specific extensions (e.g. display-mode constraints). If something works in Claude Desktop but not ChatGPT, it's likely one of those — see `developers.openai.com/apps-sdk/mcp-apps-in-chatgpt`.

---

## Setting up an example widget

You need a real built widget to register with hosts. Build pattern:

```bash
mkdir -p ~/mcp-test/widget-src
cd ~/mcp-test/widget-src

# React shown; Vue and Svelte work the same way with their respective adapters
pnpm init -y
pnpm add react react-dom mountly mountly-react mountly-mcp mountly-mcp-react
```

`~/mcp-test/widget-src/index.tsx`:

```tsx
import { createMcpWidget, useMcpHost } from "mountly-mcp-react";

function Hello({ greeting }: { greeting: string }) {
  const mcp = useMcpHost();
  return (
    <div>
      <h1>{greeting}</h1>
      <button onClick={() => mcp.openLink("https://example.com")}>
        Open link
      </button>
      <button onClick={() => mcp.callTool("say_hello", { name: "again" })}>
        Re-greet
      </button>
    </div>
  );
}

globalThis.__mountlyMcpWidget__ = createMcpWidget(Hello);
```

Build to a bundled JS file (`tsup`, `esbuild`, or `vite build --lib`), then:

```bash
node -e "
import('mountly-mcp/build').then(async ({ buildMcpResource }) => {
  await buildMcpResource({
    entry: './dist/widget.js',
    uri: 'ui://mountly-test/hello',
    name: 'hello',
    output: '../hello.html',
  });
});
"
```

This emits `~/mcp-test/hello.html` + `~/mcp-test/hello.html.meta.json`. Point your `mountly-mcp-server` config at `hello.html`.

---

## Troubleshooting

### "Tests pass but the widget doesn't render in Claude Desktop"

Most likely the bridge runtime isn't being inlined as IIFE. Verify:

```bash
head -1 packages/adapters/mountly-mcp/dist/bridge/iframe-entry.js
```

Should NOT start with `import` statements. If it does, the tsup config regressed — see `packages/adapters/mountly-mcp/tsup.config.ts`; the second config block must use `format: ["iife"]` with `bundle: true, noExternal: [/.*/]`.

### "CSP error in Chromium devtools"

The host enforces CSP based on `_meta.ui.csp` from the sidecar. If your widget fetches from `https://api.example.com`, you must declare it:

```ts
await buildMcpResource({
  ...,
  csp: { connectDomains: ["https://api.example.com"] },
});
```

### "Tool call from widget never reaches the server"

Check the iframe in Chromium devtools:

1. Inspect the iframe → Console
2. Type `window.parent` — should be different from `window` (different origin)
3. Listen for postMessage: `window.addEventListener("message", e => console.log("incoming", e.data))`

If `window.parent === window`, the host isn't sandboxing properly — likely a host bug, not a mountly bug.

### "Vitest fails after upgrading React versions"

Root `package.json` has a `pnpm.overrides` block forcing single React copies. If you upgrade React, also bump the override. Mismatched copies produce "Invalid hook call" errors.

### "Svelte tests throw `lifecycle_function_unavailable`"

Root `vitest.config.ts` has `resolve.conditions: ["browser"]` and `server.deps.inline: ["svelte"]`. Without those, Svelte 5's `mount()` throws.

---

## CI considerations

```yaml
# Phase 1 — fast (every commit)
- pnpm install --frozen-lockfile
- pnpm -r typecheck
- pnpm lint
- pnpm test:unit

# Phase 2 — browser (every PR)
- pnpm exec playwright install --with-deps chromium
- pnpm test:mcp:e2e

# Phase 3 — build (every PR)
- pnpm -r build
```

Total: ~90 seconds. Real-host smoke tests aren't appropriate for CI — they require host installations and real conversations.

The project uses `executable-stories-vitest`. Test runs emit Markdown + HTML reports under `docs/evidence/` if you want test runs as PR artifacts.

---

## What's intentionally NOT tested

For honesty:

1. **Real LLM tool execution** — handlers return canned data. Behavior under malformed real-LLM tool arguments is undefined.
2. **Network failure** — `mountly-mcp-server` doesn't test stdio breakage mid-stream or HTTP transport frame drops.
3. **High concurrency** — the async mount queue is tested for two-event-deep ordering, not for race conditions under load.
4. **Long-running sessions** — short event sequences only.
5. **Multi-widget bundle** — `buildMcpResource` doesn't yet support it.
6. **Accessibility** — no a11y assertions on rendered widget output.
7. **Internationalization** — no Unicode / RTL / locale tests.

If any of these matter for your use case, they need their own test layer.

---

## Summary

| You want to verify... | Run this |
|---|---|
| The repo builds | `pnpm -r typecheck && pnpm -r build` |
| Every protocol primitive works against fakes | `pnpm test:unit` |
| The bridge works inside a real browser | `pnpm test:mcp:verify` (after `pnpm exec playwright install`) |
| Claude renders the widget | Real-host smoke test step 1 (manual, no key) |
| ChatGPT renders the widget | Real-host smoke test step 4 (manual, OpenAI dev account) |

The free, no-key path takes you through Claude Desktop + VS Code + Goose. That's the most useful single thing to do before declaring victory.
