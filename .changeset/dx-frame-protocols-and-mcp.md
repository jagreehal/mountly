---
"mountly": minor
"mountly-manifest": minor
"mountly-mcp": patch
---

Framed verticals become full participants, strict CSP loading works, and MCP scaffolds stop breaking on create.

**Typed cross-frame events** (`channel` on `iframeFeature` / `iframeModule` / `mountAsFrame`) — explicit, validated, versioned events in both directions. Not a bridge over the same-context bus.

**Host-owned routing** (`mountly/router`, `createFeatureRouter`) — URL segments map to features; navigation within a segment calls `update` rather than remounting. Frames emit navigation events; the host stays the only history writer.

**Strict CSP loading** — dynamic import fallback when `eval` is unavailable, so on-demand widgets load under MCP Apps–style CSP without `'unsafe-eval'`.

**Frame failure reporting** — `readyTimeout` (default 10s, `0` disables) and `onError` when a cross-origin frame never handshakes.

**Frame overlay breakout** (`bindFrameOverlay` / `openHostOverlay`) — framed widgets ask the host to open modals in the top document so UI is not clipped by the iframe box.

**Host-owned history protocol** (`history:navigate` / `history:sync`, `bindFrameHistoryToRouter`) — frames never write `window.history`. `FeatureRouter` gains `replace()`.

**Manifest `isolation: "iframe"`** — flip a vertical behind `iframeFeature` with `src`, `iframeTitle`, optional `sandbox` / `allow` / `placeholderUrl`.

**Optional same-origin proxy** (`createSameOriginProxy` on `mountly-manifest/server`) — GET/HEAD prefix forwarder for cookies/relative assets. Never required for embed.

**Pre-activation placeholders** (`placeholder` / `placeholderUrl`, `mountly/placeholder`) — static skeleton until the frame reports ready.

**MCP scaffold fixes** — pin `mountly-mcp` to the generating CLI version (caret could not cross the 4.0 major). Adds `--framework vanilla` template that builds and passes verify.
