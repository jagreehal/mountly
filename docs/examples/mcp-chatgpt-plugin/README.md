# MCP ChatGPT plugin

One mountly View on several ChatGPT surfaces, plus an MCP Events server that
can wake a ChatGPT conversation when a deploy finishes.

| File                | SDK                               | What it shows                                                                                                                 |
| ------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `server.mjs`        | `@modelcontextprotocol/sdk` v1    | Plugin Extensions: `global` sidebar entrypoint + quick action, `.log` `file` viewer entrypoint, `openai/ui` resource metadata |
| `src/view.tsx`      | `mountly-mcp/react`               | The View. Renders the board or an opened log; reads `deepLink` via `useOpenAIExtensions`                                      |
| `events-server.mjs` | `@modelcontextprotocol/server` v2 | Experimental MCP Events (`mountly-mcp/events`): `deploy.finished`                                                             |

The example runs two servers: `@openai/mcp-extensions` 0.1.0 targets SDK v1, and
ChatGPT's MCP Events use MCP 2.0 (protocol `2026-07-28`).

Claude, VS Code and other MCP Apps hosts ignore `openai/ui` and render the same
View inline.

## Verify (no browser)

```bash
pnpm --filter mcp-chatgpt-plugin verify
```

Builds the View, then checks both servers in-process: the sidebar and file
entrypoints, the resource metadata, `server/discover` advertising `events`, the
subscribe challenge, and an `emit` delivered only to the matching subscription
with a valid Standard Webhooks signature.

## Try it in ChatGPT

```bash
pnpm serve:http      # Plugin Extensions server on :8787/mcp
pnpm serve:events    # Events server on :8788/mcp
```

ChatGPT needs HTTPS: tunnel each port (`cloudflared tunnel --url localhost:8787`).
Then ChatGPT → Settings → Security and login → Developer mode → Plugins → + →
paste the `/mcp` URL.

- **Sidebar:** open "Deploys" from the Desktop sidebar.
- **File viewer:** attach a `.log` file and open it with the plugin.
- **Events:** tunnel 8788 too and add it as its own plugin. In a **Work** chat
  (desktop: Work → Cloud) ask
  _"Subscribe to deploy.finished for app web and tell me the deploy id and
  status"_. ChatGPT creates a monitoring task (pick a model if it asks). Then
  `curl -X POST "localhost:8788/demo/deploy?app=web&status=failed"` returns
  `delivered: true`. ChatGPT processes events asynchronously, in about two
  minutes, and posts the notification to the task chat and the mobile app.
  Run with `DEBUG_WEBHOOKS=1` to log each webhook and OpenAI's response.

Subscriptions live in memory here. For production, pass a persistent `store` and
an `authorize` hook (see the
[package README](../../../packages/mcp-apps/README.md#mcp-events-experimental)).
