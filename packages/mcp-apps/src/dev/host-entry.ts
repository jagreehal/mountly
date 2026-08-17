import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import type { McpUiResourceMeta } from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

interface DevHostConfig {
  toolName: string;
  sandboxOrigin: string;
  fixtures: Record<string, unknown>;
  toolInput: Record<string, unknown>;
  uri: string;
  hasServer: boolean;
  sandboxPath: string;
}

declare global {
  var __mountlyMcpDevHost__: DevHostConfig;
}

const config = globalThis.__mountlyMcpDevHost__;
const sandbox = document.querySelector<HTMLIFrameElement>("#sandbox");
const fixtureBar = document.querySelector<HTMLElement>("#fixtures");
const logElement = document.querySelector<HTMLElement>("#log");
const themeButton = document.querySelector<HTMLButtonElement>("#theme");
const teardownButton = document.querySelector<HTMLButtonElement>("#teardown");
const payloadElement = document.querySelector<HTMLElement>("#payload");
if (
  !config ||
  !sandbox ||
  !fixtureBar ||
  !logElement ||
  !themeButton ||
  !teardownButton ||
  !payloadElement
) {
  throw new Error("mountly-mcp dev: host document is incomplete");
}
const hostSandbox = sandbox;
const hostFixtureBar = fixtureBar;
const hostLog = logElement;
const hostThemeButton = themeButton;
const hostTeardownButton = teardownButton;
const hostPayload = payloadElement;

function log(direction: "in" | "out", message: string): void {
  const line = document.createElement("div");
  line.className = "log-line";
  line.textContent = `${direction === "in" ? "←" : "→"} ${message}`;
  hostLog.prepend(line);
}

function theme(): "light" | "dark" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

const capabilities = {
  openLinks: {},
  logging: {},
  ...(config.hasServer ? { serverTools: {} } : {}),
};
const bridge = new AppBridge(null, { name: "mountly-mcp-dev", version: "1.0.0" }, capabilities, {
  hostContext: {
    theme: theme(),
    platform: "web",
    displayMode: "inline",
    availableDisplayModes: ["inline", "fullscreen"],
    containerDimensions: { maxHeight: 6000 },
  },
});

bridge.onloggingmessage = (params) => log("in", `notifications/message ${params.level}`);
bridge.onopenlink = async ({ url }) => {
  window.open(url, "_blank", "noopener,noreferrer");
  return {};
};
bridge.onsizechange = ({ height }) => {
  if (height !== undefined) hostSandbox.style.height = `${Math.max(80, height)}px`;
};
bridge.oncalltool = async ({ name, arguments: args }) => {
  if (!config.hasServer) throw new Error("No MCP server is connected to this dev session");
  return callDevServer(name, args);
};

let initialized = false;
let selectedFixture: string | undefined;

async function deliverFixture(name: string): Promise<void> {
  selectedFixture = name;
  for (const button of hostFixtureBar.querySelectorAll<HTMLButtonElement>("button")) {
    button.dataset.active = String(button.dataset.fixture === name);
  }
  const sample = config.fixtures[name];
  const args = config.hasServer ? sample : config.toolInput;
  await bridge.sendToolInput({ arguments: (args ?? {}) as Record<string, unknown> });
  log("out", "ui/notifications/tool-input");
  const result = config.hasServer
    ? await callDevServer(config.toolName, sample)
    : { structuredContent: sample };
  hostPayload.textContent = JSON.stringify(result?.structuredContent ?? result, null, 2);
  await bridge.sendToolResult((result ?? { content: [] }) as never);
  log("out", "ui/notifications/tool-result");
}

bridge.oninitialized = () => {
  initialized = true;
  log("in", "ui/notifications/initialized");
  const first = selectedFixture ?? Object.keys(config.fixtures)[0];
  if (first) void deliverFixture(first);
};

bridge.onsandboxready = async () => {
  log("in", "ui/notifications/sandbox-proxy-ready");
  const [html, declaration] = await Promise.all([
    fetch("/widget.html").then((response) => response.text()),
    fetch("/widget.meta.json").then((response) => response.json()) as Promise<{
      _meta?: { ui?: McpUiResourceMeta };
    }>,
  ]);
  await bridge.sendSandboxResourceReady({
    html,
    csp: declaration._meta?.ui?.csp,
    permissions: declaration._meta?.ui?.permissions,
  });
  log("out", "ui/notifications/sandbox-resource-ready");
};

for (const name of Object.keys(config.fixtures)) {
  const button =
    hostFixtureBar.querySelector<HTMLButtonElement>(`button[data-fixture=${CSS.escape(name)}]`) ??
    document.createElement("button");
  if (!button.isConnected) {
    button.className = "btn";
    button.dataset.fixture = name;
    button.textContent = name;
    hostFixtureBar.appendChild(button);
  }
  button.addEventListener("click", () => {
    if (initialized) void deliverFixture(name);
    else selectedFixture = name;
  });
}

hostThemeButton.addEventListener("click", () => {
  const next = theme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  bridge.setHostContext({ theme: next });
  log("out", "ui/notifications/host-context-changed");
});

hostTeardownButton.addEventListener("click", () => {
  void bridge.teardownResource({}).catch((error: unknown) => log("in", String(error)));
});

async function callDevServer(name: string, args: unknown): Promise<CallToolResult> {
  log("in", `tools/call ${name}`);
  const response = await fetch("/call", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, arguments: args ?? {} }),
  });
  if (!response.ok) throw new Error(await response.text());
  const decoded = (await response.json()) as Partial<CallToolResult>;
  return { ...decoded, content: decoded.content ?? [] } as CallToolResult;
}

async function main(): Promise<void> {
  await bridge.connect(
    new PostMessageTransport(hostSandbox.contentWindow!, hostSandbox.contentWindow!),
  );
  hostSandbox.src = `${config.sandboxOrigin}${config.sandboxPath}`;

  let version = await fetch("/version").then((response) => response.text());
  setInterval(() => {
    // Swallowing the failure is the point: the dev server is down between a
    // restart and the next tick, and a rejecting timer would spam the console
    // with noise the developer can do nothing about.
    void (async () => {
      const next = await fetch("/version", { cache: "no-store" }).then((r) => r.text());
      if (next === version) return;
      version = next;
      await bridge.teardownResource({}).catch(() => undefined);
      location.reload();
    })().catch(() => undefined);
  }, 500);
}

// A failed handshake has to say so in the page: the view never renders, and a
// console-only error looks identical to a widget that mounted blank.
void main().catch((error: unknown) => {
  log("in", `host failed to start: ${error instanceof Error ? error.message : String(error)}`);
  hostPayload.textContent = String(error);
});

window.addEventListener("beforeunload", () => {
  if (initialized) void bridge.teardownResource({}).catch(() => undefined);
});
