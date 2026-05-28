# MCP App Demo

A spec-compliant MCP Apps demo (SEP-1865, 2026-01-26) showing how a real
mountly React widget — the `payment-breakdown` component from
`examples/payment-breakdown/` — renders inline in an MCP Apps host.

Built on:

- [`@modelcontextprotocol/ext-apps`](https://www.npmjs.com/package/@modelcontextprotocol/ext-apps)
  — the official MCP Apps SDK (View-side `App`, transport, schemas, React hooks).
- `mountly-mcp` — thin wrapper that bundles a mountly widget into a
  `text/html;profile=mcp-app` resource and surfaces ext-apps's App via mountly's
  `WidgetModule` lifecycle.
- `mountly-mcp-react` — wraps `createMcpWidget` + spec-aware hooks
  (`useToolInput`, `useToolResult`, `useHostStyleVariables`, …).
- `mountly-mcp-server` — registers the `ui://` resource and tool on top of
  ext-apps's `registerAppResource` / `registerAppTool`, advertising the
  `io.modelcontextprotocol/ui` extension.

## What it proves

- The full **2026-01-26 wire protocol** flows end-to-end:
  `ui/initialize` → `ui/notifications/initialized` →
  `ui/notifications/tool-input` → `ui/notifications/tool-result` →
  `ui/notifications/host-context-changed` → `ui/notifications/size-changed`
  → `ui/resource-teardown`.
- The **web sandbox proxy** (spec §8.4) — host and sandbox are served on
  distinct origins (`:5179` vs `:5180`), the sandbox forwards messages and
  applies a CSP-enforced inner iframe.
- A second tool call with different args exercises the bridge's `update()`
  path — the React widget re-renders without remounting.

## Prerequisites

From the repo root:

```bash
pnpm install
pnpm -r build
```

## Verify end-to-end (no browser)

```bash
pnpm --filter mcp-app-demo verify
```

Boots an in-process MCP server + client, asserts:

- the tool is registered with `_meta.ui.resourceUri` (modern key),
- the resource's `mimeType` is `text/html;profile=mcp-app`,
- the bundled HTML contains the full spec wire protocol
  (`ui/initialize`, `ui/notifications/initialized`,
  `ui/notifications/tool-input`, `ui/notifications/tool-result`,
  `ui/notifications/host-context-changed`, `size-changed`),
- the widget bundle registers `__mountlyMcpWidget__` and contains the
  `PaymentBreakdown` component,
- the tool returns the right `structuredContent` for both `plan: "annual"`
  and `plan: "monthly"`,
- the sidecar declares `protocolVersion: "2026-01-26"` and `awaitToolResult: true`.

## Preview in a browser (with sandbox proxy)

```bash
pnpm --filter mcp-app-demo preview
```

Boots two HTTP servers:

- **Host** (`http://localhost:5179/`) — index page + MCP host implementation.
- **Sandbox proxy** (`http://localhost:5180/sandbox-proxy.html`) — different
  origin per spec §8.4.1. Forwards messages, injects CSP into the inner HTML,
  applies permission `allow` attribute.

The host page auto-delivers an annual payment; click **Monthly** to drive a
fresh `ui/notifications/tool-input` + `ui/notifications/tool-result`. The
right column shows the live `structuredContent` and a channel log of every
postMessage frame on the wire.

## CI: real-browser round-trip

`tests/mcp-demo-preview.story.spec.ts` boots the preview (both ports) via
Playwright's `webServer`, then in chromium asserts:

1. The widget renders the annual payload after the full handshake.
2. Clicking Monthly drives the bridge's `update()` path correctly.
3. The host (5179) and sandbox proxy (5180) sit on distinct origins, with
   the inner widget loading via `srcdoc`.

```bash
pnpm run test:mcp:e2e
```

## Use from Claude Desktop / VS Code MCP

```bash
pnpm --filter mcp-app-demo serve:stdio
```

Register in your host config:

```jsonc
// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "mountly-payment-demo": {
      "command": "pnpm",
      "args": ["--filter", "mcp-app-demo", "serve:stdio"],
      "cwd": "/absolute/path/to/mountly"
    }
  }
}
```

Restart your MCP host; it lists the `quote_payment` tool. Call it with
`{ "plan": "annual" }` and the host renders the `payment-breakdown` widget
inline using the `ui://mountly-demo/payment-breakdown` resource.

## Files

- `src/widget.tsx` — `createMcpWidget(PaymentWidget)`. PaymentWidget reads
  the result via the `useToolResult()` hook from `mountly-mcp-react`.
- `demo-core.mjs` — esbuilds `src/widget.tsx`, calls `buildMcpResource` with
  the public `getBridgeRuntimePath()` API, registers tool + widget on
  `createMcpAppServer`. Exports `SAMPLE_PAYMENTS`.
- `verify.mjs` — deterministic in-process verification with spec markers.
- `preview.mjs` — dual-port host + sandbox proxy; embeds the widget HTML via
  `ui/notifications/sandbox-resource-ready`.
- `serve-stdio.mjs` — stdio entry for real MCP hosts.
