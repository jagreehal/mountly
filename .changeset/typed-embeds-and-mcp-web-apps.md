---
"mountly-vite-plugin": minor
"mountly-mcp": minor
"mountly-react": minor
---

`embed.d.ts` keeps each prop's written type and JSDoc. It copies in the local and relative-import interfaces those types name, and types each event's `detail` from the callback's first argument, Vue `defineEmits` included.

Existing web apps now run as MCP Apps:

- The View build inlines `new Worker(new URL("./w.ts", import.meta.url))` workers, in Vue and Svelte components too.
- `useDownload()` (React, Vue) and `downloadFile(app, file)` save files through the host's `ui/download-file`, with an `<a download>` fallback. `mountly-mcp dev` handles the request.
- `mountlyMcpViews({ module: true })` writes `mountly-mcp.views.js`. Register those Views on Cloudflare Workers, where `mountly-mcp/server` resolves to a filesystem-free build. `artifacts` lists in-memory Views with `html` in place of `htmlPath`.
- `mountly-react` and `mountly-mcp/react` support React 18 and 19.
- `mountly-mcp doctor` lists sandbox issues with file:line and a fix for each: storage, path routers, downloads, workers, remote imports, hostname checks, relative `fetch` and `window.open`. Advisory checks print `warn`.
