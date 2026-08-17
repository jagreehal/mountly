import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { story } from "executable-stories-vitest";
import { describe, expect, it } from "vite-plus/test";
import { buildMcpResource } from "../packages/mcp-apps/src/build/index";
import {
  connectMcpServer,
  sandboxProxyHtml,
  startDevHost,
} from "../packages/mcp-apps/src/dev/index";
import { escapeInlineScript, serializeInlineScriptValue } from "../packages/mcp-apps/src/html";

async function buildWidget(dir: string): Promise<string> {
  writeFileSync(join(dir, "widget.js"), "globalThis.__mountlyMcpWidget__ = {};", "utf8");
  writeFileSync(join(dir, "bridge.js"), "/* bridge runtime */", "utf8");
  const output = join(dir, "widget.html");
  await buildMcpResource({
    entry: join(dir, "widget.js"),
    uri: "ui://dev-server/quote",
    name: "quote_payment",
    output,
    csp: { connectDomains: ["https://api.example.com"] },
    permissions: { clipboardWrite: true },
    bridgeRuntimePath: join(dir, "bridge.js"),
  });
  return output;
}

describe("mountly-mcp/dev", () => {
  it("serves a built widget from a two-origin sandboxed host", async ({ task }) => {
    story.init(task, { tags: ["mcp", "dev"] });
    const dir = mkdtempSync(join(tmpdir(), "mountly-mcp-dev-"));

    story.given("a built ui:// resource and its sidecar");
    const htmlPath = await buildWidget(dir);

    story.when("the dev host starts");
    const host = await startDevHost({
      htmlPath,
      fixtures: { annual: { total: 99 }, monthly: { total: 12 } },
      hostPort: 5310,
    });

    try {
      story.then("host and sandbox are on different origins, as the spec requires");
      expect(host.hostUrl).not.toBe(host.sandboxUrl);

      story.then("the host page offers a button per fixture and frames the sandbox");
      const page = await fetch(host.hostUrl).then((r) => r.text());
      expect(page).toContain('data-fixture="annual"');
      expect(page).toContain('data-fixture="monthly"');
      // The proxy URL is assembled in boot(), so the page carries the origin
      // and the path rather than one literal string.
      expect(page).toContain(host.sandboxUrl);
      expect(page).toContain("/sandbox-proxy.html");
      expect(page).toContain("quote_payment");

      story.then("the browser host runtime comes from the official AppBridge adapter");
      const hostRuntime = await fetch(`${host.hostUrl}/host.js`).then((r) => r.text());
      expect(hostRuntime).toContain("AppBridge received");

      story.then("the widget and its sidecar are served for the page to fetch");
      const served = await fetch(`${host.hostUrl}/widget.html`).then((r) => r.text());
      expect(served).toContain("__mountlyMcpWidget__");
      const meta = await fetch(`${host.hostUrl}/widget.meta.json`).then((r) => r.json());
      expect(meta.uri).toBe("ui://dev-server/quote");

      story.then("the sandbox proxy enforces the sidecar's CSP without unsafe-eval");
      const proxy = await fetch(`${host.sandboxUrl}/sandbox-proxy.html`).then((r) => r.text());
      expect(proxy).toContain("ui/notifications/sandbox-proxy-ready");
      expect(proxy).toContain("default-src 'none'");
      expect(proxy).not.toContain("unsafe-eval");

      story.then("a rebuild bumps the version the browser polls");
      const before = await fetch(`${host.hostUrl}/version`).then((r) => r.text());
      host.reload();
      const after = await fetch(`${host.hostUrl}/version`).then((r) => r.text());
      expect(after).not.toBe(before);
    } finally {
      await host.close();
    }
  });

  it("routes tool calls to a connected server", async ({ task }) => {
    story.init(task, { tags: ["mcp", "dev"] });
    const dir = mkdtempSync(join(tmpdir(), "mountly-mcp-dev-"));
    const htmlPath = await buildWidget(dir);

    story.given("a dev host wired to a real tool");
    const calls: Array<{ name: string; args: unknown }> = [];
    const host = await startDevHost({
      htmlPath,
      fixtures: { annual: { plan: "annual" } },
      hostPort: 5330,
      callTool: async (name, args) => {
        calls.push({ name, args });
        return { structuredContent: { total: 99 } };
      },
    });

    try {
      story.when("the view calls a tool");
      const result = await fetch(`${host.hostUrl}/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "quote_payment", arguments: { plan: "annual" } }),
      }).then((r) => r.json());

      story.then("it reaches the server and the result comes back");
      expect(calls).toEqual([{ name: "quote_payment", args: { plan: "annual" } }]);
      expect(result.structuredContent).toEqual({ total: 99 });

      story.then("the page treats fixtures as arguments rather than results");
      const page = await fetch(host.hostUrl).then((r) => r.text());
      expect(page).toContain("const HAS_SERVER = true");

      story.then("a throwing tool becomes an error result, not a dead dev server");
      const failing = await startDevHost({
        htmlPath,
        hostPort: 5334,
        callTool: async () => {
          throw new Error("upstream exploded");
        },
      });
      const errored = await fetch(`${failing.hostUrl}/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "quote_payment", arguments: {} }),
      }).then((r) => r.json());
      expect(errored.isError).toBe(true);
      expect(errored.content[0].text).toContain("upstream exploded");
      await failing.close();
    } finally {
      await host.close();
    }
  });

  it("ships the host runtime where the resolver looks for it", async ({ task }) => {
    story.init(task, { tags: ["mcp", "dev", "packaging"] });

    story.given("the dev host resolves its browser runtime as a package export");
    // Running from src, startDevHost falls back to bundling the .ts, so the
    // browser tests stay green even when the packaged path is wrong. This is
    // the only check that fails when dist and the exports map disagree — the
    // shape of bug that shipped a `dev` command which crashed on startup.
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), "packages/mcp-apps/package.json"), "utf8"),
    ) as { exports: Record<string, unknown> };

    story.then("the export is declared");
    const declared = packageJson.exports["./dev/host-entry.js"];
    expect(declared).toBe("./dist/dev/host-entry.js");
    expect(typeof connectMcpServer).toBe("function");

    story.then("and the built file is actually there");
    expect(
      existsSync(join(process.cwd(), "packages/mcp-apps", String(declared))),
      "run `pnpm --filter mountly-mcp build` first",
    ).toBe(true);
  });

  it("escapes the compiled runtime at the inline-script seam", async ({ task }) => {
    story.init(task, { tags: ["mcp", "dev", "security"] });

    story.given("a runtime that contains a script terminator");
    const hostile = `const marker = "</script><img onerror=alert(1)>";`;

    story.then("the terminator cannot close the tag that owns it");
    expect(escapeInlineScript(hostile)).not.toContain("</script");
    expect(escapeInlineScript(hostile)).toContain("<\\/script>");

    story.then("and injected config cannot open a tag at all");
    expect(serializeInlineScriptValue({ hostOrigin: "</script><b>" })).not.toContain("<");

    story.then("so the shipped proxy carries only the two tags its shell owns");
    const html = await sandboxProxyHtml("http://localhost:5179");
    expect(html.match(/<\/script>/gi)).toHaveLength(2);
  });

  it("rejects an invalid server module at the dev seam", async ({ task }) => {
    story.init(task, { tags: ["mcp", "dev", "dx"] });
    const dir = mkdtempSync(join(tmpdir(), "mountly-mcp-server-module-"));
    const modulePath = join(dir, "invalid.mjs");
    writeFileSync(modulePath, "export default 42;", "utf8");

    try {
      await expect(connectMcpServer(modulePath)).rejects.toThrow(
        "must default-export an MCP server",
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("picks a free port instead of failing when one is taken", async ({ task }) => {
    story.init(task, { tags: ["mcp", "dev"] });
    const dir = mkdtempSync(join(tmpdir(), "mountly-mcp-dev-"));
    const htmlPath = await buildWidget(dir);

    story.given("a dev host already holding the default port");
    const first = await startDevHost({ htmlPath, hostPort: 5320 });

    story.when("a second one starts on the same port");
    const second = await startDevHost({ htmlPath, hostPort: 5320 });

    try {
      story.then("it moves up rather than crashing");
      expect(second.hostUrl).not.toBe(first.hostUrl);
      expect(await fetch(second.hostUrl).then((r) => r.status)).toBe(200);
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
  });
});
