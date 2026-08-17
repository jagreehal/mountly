# Which level owns which claim

Four tiers. For every assertion, the question is which one can prove it at the
lowest cost — and whether any tier above loses something by giving it up. A
claim proved twice is a claim you get to fix twice when a name changes.

| Command                                   | Tier                         | Owns                                                                                                                                                                     | Cannot see                          |
| ----------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `pnpm test:unit`                          | Unit (jsdom + node)          | Pure logic: which notifications the bridge acts on, display-mode gating, HTML/sidecar emission, the Vite plugin's output, server registration and capability negotiation | Anything a rendering engine decides |
| `pnpm test:component`                     | Component (real Chromium)    | Every state a widget renders in, per framework — including whether stylesheets actually applied and whether `shadow: true` isolates                                      | Routing, transports, the host       |
| `pnpm test:e2e`                           | Journey (Playwright)         | One full path through the real topology: host, cross-origin sandbox proxy, view — handshake, CSP enforcement, host-context updates, teardown                             | Cheap variations of anything        |
| `pnpm --filter mcp-app-demo verify:stdio` | Integration (out-of-process) | The server over a real stdio transport, driven by a client we didn't write, on both sides of extension negotiation                                                       | Anything rendered                   |

## Why the component tier is a real browser

Two claims can't be made anywhere cheaper:

- **Single-file components need their compiler.** `.vue` and `.svelte` are only
  testable inside a Vite pipeline. That's what turns the Svelte entry point from
  "typed and wired" into "proved".
- **"The styles applied" is a claim about a CSS engine.** jsdom does not resolve
  stylesheet rules the way a browser does, so `getComputedStyle` there proves
  less than production.

The tier also corrected a wrong assumption on its first run: mountly mounts into
the **light DOM** unless a widget passes `shadow: true`. The jsdom test that
preceded it had been asserting against a fallback, not the real path.

## What the journey tier owns exclusively

- The CSP the host actually enforces on the view, including that a domain
  declared at build time survives sidecar → server → host → proxy, and that an
  undeclared one is still refused.
- `ui/notifications/host-context-changed` arriving after a real theme change.
  The bridge reads host context from the transport, so a hand-called handler
  below this tier would assert against a permanently empty context — green, and
  meaningless.

## What no tier here can prove

A real host. Sandbox origin formats (`_meta.ui.domain`), the host's own theme
variables, display-mode switching, whether `visibility: ["app"]` really hides a
tool from the model. Those need Claude or ChatGPT with the server connected.
