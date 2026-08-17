import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { story } from "executable-stories-vitest";
import { describe, expect, it } from "vite-plus/test";
import { buildMcpResource } from "../packages/mcp-apps/src/build/index";
import { emitHtml } from "../packages/mcp-apps/src/build/emit-html";
import { emitMeta } from "../packages/mcp-apps/src/build/emit-meta";
import { MCP_APPS_MIME, MCP_APPS_PROTOCOL_VERSION } from "../packages/mcp-apps/src/schema";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "mountly-mcp-test-"));
}

describe("emitMeta", () => {
  it("produces a sidecar declaration with required fields and defaults", ({ task }) => {
    story.init(task);
    story.given("a minimal emit input");

    const result = emitMeta({
      uri: "ui://weather-server/dashboard",
      name: "weather_dashboard",
    });

    story.then("required fields are present with sensible defaults");
    expect(result).toEqual({
      protocolVersion: MCP_APPS_PROTOCOL_VERSION,
      uri: "ui://weather-server/dashboard",
      name: "weather_dashboard",
      mimeType: MCP_APPS_MIME,
      awaitToolResult: true,
      displayModes: ["inline"],
      _meta: { ui: {} },
    });
  });

  it("includes csp and displayModes when provided", ({ task }) => {
    story.init(task);
    const result = emitMeta({
      uri: "ui://weather-server/dashboard",
      name: "weather_dashboard",
      displayModes: ["inline", "fullscreen"],
      csp: { connectDomains: ["https://api.weather.com"] },
      awaitToolResult: false,
    });
    expect(result.displayModes).toEqual(["inline", "fullscreen"]);
    expect(result._meta.ui.csp).toEqual({ connectDomains: ["https://api.weather.com"] });
    expect(result.awaitToolResult).toBe(false);
  });

  it("rejects non-ui schemes for resource uri", ({ task }) => {
    story.init(task);
    expect(() =>
      emitMeta({
        uri: "https://example.com/weather",
        name: "weather_dashboard",
      }),
    ).toThrow(/must use the 'ui:\/\/' scheme/i);
  });
});

describe("emitHtml — self-contained", () => {
  it("inlines js and css and embeds protocol + uri meta tags", ({ task }) => {
    story.init(task);
    const html = emitHtml({
      mode: "self-contained",
      uri: "ui://weather-server/dashboard",
      js: 'console.log("hi");',
      css: "h1 { color: red; }",
      bridgeRuntimeJs: "self.__mountlyMcpBoot = () => {};",
    });

    story.then("the HTML carries protocol + uri meta tags and inlined assets");
    expect(html).toContain('<meta name="mountly-mcp-protocol" content="2026-01-26">');
    expect(html).toContain('<meta name="mountly-mcp-uri" content="ui://weather-server/dashboard">');
    expect(html).toContain("<style>h1 { color: red; }</style>");
    expect(html).toContain('console.log("hi");');
    expect(html).toContain("self.__mountlyMcpBoot");
    expect(html).toContain('<div id="mountly-mcp-root"></div>');
  });
});

describe("emitHtml — cdn", () => {
  it("references external js and css, omits inlined content", ({ task }) => {
    story.init(task);
    const html = emitHtml({
      mode: "cdn",
      uri: "ui://weather-server/dashboard",
      jsUrl: "https://cdn.example.com/weather.js",
      cssUrl: "https://cdn.example.com/weather.css",
      bridgeRuntimeJs: "self.__bootBridge();",
    });

    story.then("html points to the external URLs");
    expect(html).toContain('<link rel="stylesheet" href="https://cdn.example.com/weather.css">');
    expect(html).toContain(
      '<script type="module" src="https://cdn.example.com/weather.js"></script>',
    );
    expect(html).toContain("self.__bootBridge();");
  });

  it("loads the widget bundle before the bridge (module scripts run in order)", ({ task }) => {
    story.init(task);
    const html = emitHtml({
      mode: "cdn",
      uri: "ui://weather-server/dashboard",
      jsUrl: "https://cdn.example.com/weather.js",
      cssUrl: "https://cdn.example.com/weather.css",
      bridgeRuntimeJs: "self.__bootBridge();",
    });

    story.then("the widget's src script precedes the inlined bridge, or the bridge boots first");
    expect(html.indexOf("https://cdn.example.com/weather.js")).toBeLessThan(
      html.indexOf("self.__bootBridge();"),
    );
  });

  it("escapes HTML special chars in uri/jsUrl/cssUrl attributes", ({ task }) => {
    story.init(task);
    const html = emitHtml({
      mode: "cdn",
      uri: 'ui://server/path"><script>alert(1)</script>',
      jsUrl: 'https://x/y"<>&',
      cssUrl: 'https://x/y"<>&',
      bridgeRuntimeJs: "",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&quot;");
  });

  it("escapes </script> sequences inside inlined js and bridge runtime", ({ task }) => {
    story.init(task);
    const html = emitHtml({
      mode: "self-contained",
      uri: "ui://server/path",
      js: 'const s = "</script>";',
      css: 'body::before { content: "</style>"; }',
      bridgeRuntimeJs: 'const t = "</script>";',
    });
    const scriptCloseMatches = html.match(/<\/script>/gi) ?? [];
    expect(scriptCloseMatches.length).toBe(1);

    const styleCloseMatches = html.match(/<\/style>/gi) ?? [];
    expect(styleCloseMatches.length).toBe(1);
  });
});

describe("buildMcpResource", () => {
  it("writes the HTML resource and sidecar metadata file", async ({ task }) => {
    story.init(task);
    const dir = makeTempDir();
    const entry = join(dir, "widget.js");
    const out = join(dir, "out.html");
    const bridgeRuntime = join(dir, "bridge-runtime.js");

    writeFileSync(entry, "globalThis.__mountlyMcpWidget__ = { mount(){}, unmount(){} };", "utf8");
    writeFileSync(bridgeRuntime, "/* bridge runtime */", "utf8");

    story.when("buildMcpResource runs against a fake widget entry");
    const result = await buildMcpResource({
      entry,
      uri: "ui://weather-server/dashboard",
      name: "weather_dashboard",
      output: out,
      bridgeRuntimePath: bridgeRuntime,
    });

    story.then("html and .meta.json are written and result is returned");
    const html = readFileSync(out, "utf8");
    const meta = JSON.parse(readFileSync(`${out}.meta.json`, "utf8"));
    expect(html).toContain("ui://weather-server/dashboard");
    expect(html).toContain("globalThis.__mountlyMcpWidget__");
    expect(html).toContain("/* bridge runtime */");
    expect(meta.uri).toBe("ui://weather-server/dashboard");
    expect(result.htmlPath).toBe(out);
    expect(result.metaPath).toBe(`${out}.meta.json`);

    rmSync(dir, { recursive: true });
  });

  it("hands the view the same awaitToolResult/displayModes the sidecar declares", async ({
    task,
  }) => {
    story.init(task);
    const dir = makeTempDir();
    const entry = join(dir, "widget.js");
    const out = join(dir, "out.html");
    const bridgeRuntime = join(dir, "bridge-runtime.js");
    writeFileSync(entry, "globalThis.__mountlyMcpWidget__ = { mount(){}, unmount(){} };", "utf8");
    writeFileSync(bridgeRuntime, "/* bridge runtime */", "utf8");

    story.given("a widget built with fullscreen support and immediate mount");
    const result = await buildMcpResource({
      entry,
      uri: "ui://weather-server/dashboard",
      name: "weather_dashboard",
      output: out,
      displayModes: ["inline", "fullscreen"],
      awaitToolResult: false,
      bridgeRuntimePath: bridgeRuntime,
    });

    story.then(
      "the emitted HTML sets the globals the bridge reads, so ui/initialize matches the sidecar",
    );
    const html = readFileSync(out, "utf8");
    expect(html).toContain(
      'globalThis.__mountlyMcpAvailableDisplayModes__=["inline","fullscreen"];',
    );
    expect(html).toContain("globalThis.__mountlyMcpAwaitToolResult__=false;");
    expect(result.declaration.displayModes).toEqual(["inline", "fullscreen"]);

    rmSync(dir, { recursive: true });
  });

  it("CDN mode merges asset origins into csp.resourceDomains", async ({ task }) => {
    story.init(task);
    const dir = makeTempDir();
    const out = join(dir, "out.html");
    const bridgeRuntime = join(dir, "bridge-runtime.js");
    writeFileSync(bridgeRuntime, "/* bridge */", "utf8");

    const result = await buildMcpResource({
      entry: "irrelevant-in-cdn-mode",
      uri: "ui://weather-server/dashboard",
      name: "weather_dashboard",
      output: out,
      cdn: {
        jsUrl: "https://cdn.example.com/weather.js",
        cssUrl: "https://cdn.example.com/weather.css",
      },
      bridgeRuntimePath: bridgeRuntime,
      csp: { connectDomains: ["https://api.weather.com"] },
    });

    expect(result.declaration._meta.ui.csp?.resourceDomains).toEqual(["https://cdn.example.com"]);
    expect(result.declaration._meta.ui.csp?.connectDomains).toEqual(["https://api.weather.com"]);
    rmSync(dir, { recursive: true });
  });
});
