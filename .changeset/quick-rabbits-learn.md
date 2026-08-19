---
"mountly": patch
"mountly-mcp": patch
"mountly-vite-plugin": patch
"mountly-manifest": patch
"mountly-vue": patch
"mountly-svelte": patch
---

Improve runtime correctness, host safety, and MCP Apps DX across core and adapters.

This patch fixes listener and timer leaks, hardens devtools rendering and controls, improves overlay and prefetch behavior, adds MCP sandbox export and verify JSON output, and aligns bootstrap and manifest validation for non-React hosts.
