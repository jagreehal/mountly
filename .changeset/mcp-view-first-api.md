---
"mountly-mcp": major
---

Phase 3: View-first API, one-package React install, chat-shaped host.

`mountly-mcp` now speaks the MCP Apps spec's vocabulary throughout. The spec
(Final, 2026-01-26) calls the whole server + UI product an **App**, and the
iframe side of it a **View** — so "widget" is gone from this package's public
surface. Core `mountly` is a general-purpose UI platform and keeps its own
`WidgetModule` vocabulary; `mountly-mcp` re-exports it as `McpView`, so the word
never crosses the boundary.

Breaking:

- Renamed: `createMcpWidget` → `createMcpView`, `createGenerativeWidget` →
  `createGenerativeView`, `mountlyMcpWidget` → `mountlyMcpViews`, `McpWidgetProps`
  → `McpViewProps`, `McpWidgetToolResult` → `McpAppToolResult`, bridge key
  `__mountlyMcpWidget__` → `__mountlyMcpView__`.
- `useMcpHost()` → `useMcpApp()` (React and Vue). It returns the ext-apps `App`,
  which is what the official SDK's `useApp()` returns — the old name claimed it
  was the host. `use*Host*` now consistently means host-side data
  (`useHostContext`, `useHostStyles`, `useHostFonts`).
- `runBridge({ widget })` → `runBridge({ view })`.
- Error code `mountly-mcp/widget-mount-threw` → `mountly-mcp/view-mount-threw`
  (`MCP_ERROR_CODES.WIDGET_MOUNT_THREW` → `VIEW_MOUNT_THREW`). This is
  wire-visible in `notifications/message` params.
- Scaffold entry is `src/view.tsx` / `src/view.ts` (was `src/widget.*`); built
  bundles are `view-<n>-<name>.{js,css}` (was `widget-<n>-…`); the dev host
  serves `/view.html` and `/view.meta.json`.
- New public type `McpView` — the `mount`/`update`/`unmount` module the bridge
  drives. `createMcpView` and `publishMcpView` return it.

Also:

- `mountly` + `mountly-react` are dependencies of `mountly-mcp` — React apps
  install `mountly-mcp` + React only.
- `mountly-mcp create --framework react` no longer lists `mountly-react` in the
  scaffold.
- Dev host uses a conversation chrome (topbar, turns, artifact card, bottom
  composer) while keeping `#sandbox` / `#fixtures` / `#theme` / `#teardown`.

No back-compat aliases: `mountly-mcp` has no users on 3.x yet, and an alias for
every renamed symbol is exactly the translation layer this release removes.
