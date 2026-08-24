# Mountly MCP glossary

Public vocabulary for `mountly-mcp`. Skills, templates, CLI help, README, and
docs must use these names.

| Term                     | Meaning                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| **App**                  | MCP server plus its Views (SEP-1865 product).                                                |
| **View**                 | Iframe UI for a tool result (`ui://` resource).                                              |
| **`ui://`**              | Required scheme for View resource URIs.                                                      |
| **`createMcpView`**      | Wrap a React / Vue / Svelte component (`mountly-mcp/react` etc.). Vanilla: `publishMcpView`. |
| **`mountlyMcpViews`**    | Vite plugin. Emits View HTML and `dist/mountly-mcp.manifest.json`.                           |
| **`registerMcpApps`**    | Install Views and UI-linked tools on an unconnected `McpServer`.                             |
| **`readMcpAppManifest`** | Load `dist/mountly-mcp.manifest.json` from `mountly-mcp/artifact`.                           |
| **`mcp.fixtures.json`**  | Named samples for `mountly-mcp dev` (tool args with `--server`, else `structuredContent`).   |
| **`create`**             | `mountly-mcp create`: scaffold a greenfield App.                                             |
| **`add`**                | `mountly-mcp add`: add a second View to an existing Mountly Vite project.                    |
| **`build`**              | `mountly-mcp build`: build Views via Vite.                                                   |
| **`dev`**                | `mountly-mcp dev`: local sandboxed AppBridge host with live reload.                          |
| **`verify`**             | `mountly-mcp verify`: conformance (`--strict`, `--render`).                                  |
| **`doctor`**             | `mountly-mcp doctor`: check Node, Vite plugin, Playwright, peer floors.                      |

## Do not put in MCP docs / skills / templates

- Islands vocabulary, HTML island attributes, microfrontends
- Cloning `jagreehal/mountly` or `modelcontextprotocol/ext-apps` for greenfield Views
- Hand-writing View HTML or postMessage for Views
- Calling Mountly the "default view layer" until hosts recommend it

## Happy path

```bash
npx mountly-mcp create my-app --framework react   # react | vue | svelte | vanilla
cd my-app && pnpm install && pnpm dev
pnpm verify
pnpm verify --strict --render   # CI
```
