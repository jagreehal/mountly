# Protocol Layering: MCP, MCP Apps, mcp-ui

This repo treats MCP-family protocols as complementary layers.

## Layer Map

- `MCP` — agent ↔ tools/data interoperability.
- `MCP Apps` — UI extension for MCP. Tools can return embeddable UI resources and hosts render them, commonly in a sandboxed iframe.
- `mcp-ui` — an implementation/ecosystem project aligned with MCP Apps.

Related protocols at adjacent layers (not implemented in this repo):

- `AG-UI` — app frontend ↔ agent backend event protocol (streaming, state sync, interaction loop).
- `A2A` — agent ↔ agent communication.
- `A2UI` — declarative agent-generated UI trees with a client-side component catalog.

## Is There One UI Standard for AI Apps?

Not yet.

Practical guidance:

- Use `MCP Apps` when tools/services should bring their own UI into MCP-capable hosts.
- Use `AG-UI` when you're building your own product UI and need real-time app ↔ agent communication.
- Use `A2UI`-style declarative payloads for agent-generated component trees instead of embedded tool UIs.

## Wording

- Say: **"MCP Apps is the standards-track extension; mcp-ui is an implementation."**
- Avoid hard-coding governance/version claims unless linking the exact current spec page.
- Describe **OpenAI Apps SDK** as ChatGPT-focused and MCP-based/compatible, not the cross-ecosystem standard by itself.
- Treat **A2UI** as emerging/promising, not dominant.

## Scope in This Repository

This repo implements the **`MCP Apps`** path:

- `mountly-mcp` — build pipeline (`buildMcpResource`) + bridge runtime (wraps `@modelcontextprotocol/ext-apps`'s `App`)
- `mountly-mcp/react` — React widget wrapper (`createMcpWidget`) + hooks (re-exports ext-apps's React hooks plus mountly's context-bound variants)
- `mountly-mcp/server` — opinionated wrapper over `@modelcontextprotocol/sdk` using `@modelcontextprotocol/ext-apps/server`'s `registerAppTool` / `registerAppResource`

For practical verification, see [`docs/how-to-test.md`](./how-to-test.md). For an end-to-end runnable reference, see [`docs/examples/mcp-app-demo/README.md`](../docs/examples/mcp-app-demo/README.md).
