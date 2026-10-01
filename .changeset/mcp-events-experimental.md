---
"mountly-mcp": minor
---

Add `mountly-mcp/events` (experimental), MCP Events over webhooks for MCP 2.0 servers, tested end to end with ChatGPT. `defineEvents()` returns `events/list`, `events/subscribe` and `events/unsubscribe` handlers plus `emit()`, with Standard Webhooks signing, callback verification, retries, and per-delivery authorization.

Document every ChatGPT Plugin Extensions entrypoint (`global`, `thread`, `file`, `settings`) and add the `mcp-chatgpt-plugin` example.

`mountly-mcp doctor` finds `@openai/mcp-extensions` in the project's `node_modules`.

`mountly-mcp create` templates use TypeScript 7 and add `pnpm lint` with type-aware oxlint.
