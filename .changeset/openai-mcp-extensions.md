---
"mountly-mcp": minor
---

ChatGPT support through `@openai/mcp-extensions`.

`mountly-mcp` adds typed helpers that import the official OpenAI MCP Extensions SDK: `openaiUi` on Views, `openaiUiToolMeta` / `enableOpenAiExtensions` on the server (`mountly-mcp/openai/server`), and `useOpenAIExtensions` (`mountly-mcp/react/openai`). Resource and tool `_meta["openai/ui"]` flow through build and `registerMcpApps`. Doctor checks the peer when sources use these APIs.
