---
name: create-mcp-app
description: >
  Create an MCP App, MCP Apps View, interactive MCP UI, or scaffold a greenfield
  Mountly MCP Apps project. Use when the user says create an MCP App, scaffold an
  MCP App, build an interactive MCP View, add a UI to an MCP tool, or MCP Apps
  quickstart. Prefer mountly-mcp create over cloning repos or raw
  @modelcontextprotocol/ext-apps for Views.
---

# Create an MCP App with Mountly

Mountly is the View kit for MCP Apps (SEP-1865). Keep
`@modelcontextprotocol/ext-apps` for protocol work. Do not hand-write View HTML
or clone the Mountly / ext-apps monorepos for greenfield apps.

Canonical names: `createMcpView`, `mountlyMcpViews`, `registerMcpApps`,
`readMcpAppManifest`, `mcp.fixtures.json`, `dist/mountly-mcp.manifest.json`,
commands `create` / `add` / `build` / `dev` / `verify` / `doctor`.

## Preferred path (always try first)

```bash
npx mountly-mcp create my-app --framework react   # or vue | svelte | vanilla
cd my-app
pnpm install
pnpm dev
pnpm verify
```

That scaffold emits:

- Vite + `mountlyMcpViews({ apps: [...] })`
- View entry that calls `createMcpView(...)` (or `publishMcpView` for vanilla)
- `server.mjs` using `registerMcpApps` + one model tool + one app-only tool
- `mcp.fixtures.json` for `mountly-mcp dev --server`
- `serve-stdio.mjs` for Claude Desktop / VS Code

## Forbidden

- Clone `jagreehal/mountly` or `modelcontextprotocol/ext-apps` for greenfield Views
- Hand-write `ui://` HTML / postMessage protocol
- Mention islands vocabulary (HTML island attributes)

## Manual path (only if create is unavailable)

### 1. Install

```bash
npm install mountly-mcp @modelcontextprotocol/sdk react react-dom
npm install -D vite @vitejs/plugin-react
```

`mountly` and `mountly-react` ship inside `mountly-mcp` for React. Do not add
them separately.

### 2. View entry

```ts
import { createMcpView } from "mountly-mcp/react";
import Dashboard from "./Dashboard";

createMcpView(Dashboard);
```

Hooks: `useMcpApp()`, `useToolResult<T>()`, `useHostContext()`.

### 3. Vite + build

```ts
import { mountlyMcpViews } from "mountly-mcp/vite";
// mountlyMcpViews({ apps: [{ entry, uri: "ui://…", name, … }] })
```

```bash
npx mountly-mcp build
```

### 4. Server registration

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readMcpAppManifest } from "mountly-mcp/artifact";
import { registerMcpApps } from "mountly-mcp/server";

export default async function createServer() {
  const server = new McpServer(
    { name: "my-server", version: "1.0.0" },
    { capabilities: { tools: {}, resources: {} } },
  );
  const { artifacts } = await readMcpAppManifest("dist/mountly-mcp.manifest.json");

  await registerMcpApps(server, {
    views: artifacts.map((artifact) => ({ artifact })),
    tools: [
      {
        name: "show_dashboard",
        resourceUri: "ui://my-server/dashboard",
        config: {
          description: "Show the dashboard",
          inputSchema: {
            type: "object",
            properties: { topic: { type: "string" } },
          },
        },
        handler: async ({ topic }) => ({
          structuredContent: { topic, cards: [] },
        }),
      },
    ],
  });

  return server;
}
```

## Rules

- `ui://` only for resource URIs
- Log to stderr in a stdio server (stdout is JSON-RPC)
- App-only tools: `visibility: ["app"]` (string or array)
- Second View: `npx mountly-mcp add settings --framework react`

## Verify

```bash
npx mountly-mcp doctor
npx mountly-mcp verify
npx mountly-mcp verify --render --strict
```
