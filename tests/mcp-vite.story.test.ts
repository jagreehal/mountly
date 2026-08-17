import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { story } from "executable-stories-vitest";
import { build } from "vite-plus";
import { describe, expect, it } from "vite-plus/test";
import { mountlyMcpWidget } from "../packages/mcp-apps/src/vite/index";

function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "mountly-mcp-vite-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  // A framework-free widget: the plugin's job is bundling + emitting, and the
  // adapters are covered elsewhere.
  writeFileSync(
    join(dir, "src/widget.ts"),
    `import "./widget.css";
     globalThis.__mountlyMcpWidget__ = {
       mount(container){ container.textContent = "built by vite"; },
       unmount(container){ container.textContent = ""; },
     };`,
    "utf8",
  );
  writeFileSync(join(dir, "src/widget.css"), ".widget { color: rebeccapurple; }", "utf8");
  writeFileSync(join(dir, "bridge.js"), "/* bridge runtime */", "utf8");
  return dir;
}

describe("mountly-mcp/vite", () => {
  it("turns a component entry into a ui:// resource in one build", async ({ task }) => {
    story.init(task, { tags: ["mcp", "vite", "build"] });
    const dir = makeProject();

    story.given("a project whose vite config uses mountlyMcpWidget()");
    await build({
      root: dir,
      logLevel: "silent",
      plugins: [
        mountlyMcpWidget({
          entry: join(dir, "src/widget.ts"),
          uri: "ui://weather-server/dashboard",
          name: "weather_dashboard",
          description: "Interactive weather dashboard",
          displayModes: ["inline", "fullscreen"],
          csp: { connectDomains: ["https://api.weather.com"] },
          prefersBorder: true,
          bridgeRuntimePath: join(dir, "bridge.js"),
        }),
      ],
    } as never);

    story.then("the HTML resource and its sidecar are written, with no build litter left");
    const html = readFileSync(join(dir, "dist/weather_dashboard.html"), "utf8");
    const meta = JSON.parse(
      readFileSync(join(dir, "dist/weather_dashboard.html.meta.json"), "utf8"),
    );

    expect(html).toContain("<!doctype html>");
    expect(html).toContain('<div id="mountly-mcp-root"></div>');
    story.then("the widget bundle and its CSS are inlined, not linked");
    expect(html).toContain("built by vite");
    expect(html).toContain(".widget{"); // minified: rebeccapurple becomes #639
    expect(html).not.toContain('<script type="module" src=');

    story.then("the view is told what the sidecar declares");
    expect(html).toContain(
      'globalThis.__mountlyMcpAvailableDisplayModes__=["inline","fullscreen"]',
    );

    story.then("the sidecar carries the spec metadata the server needs");
    expect(meta.uri).toBe("ui://weather-server/dashboard");
    expect(meta.mimeType).toBe("text/html;profile=mcp-app");
    expect(meta.displayModes).toEqual(["inline", "fullscreen"]);
    expect(meta._meta.ui.csp).toEqual({ connectDomains: ["https://api.weather.com"] });
    expect(meta._meta.ui.prefersBorder).toBe(true);

    rmSync(dir, { recursive: true });
  });

  it("replaces process.env.NODE_ENV, which has no bundler to resolve it later", async ({
    task,
  }) => {
    story.init(task, { tags: ["mcp", "vite", "build"] });
    const dir = makeProject();

    story.given("a widget that branches on NODE_ENV, as React and Vue both do");
    writeFileSync(
      join(dir, "src/widget.ts"),
      `const mode = process.env.NODE_ENV;
       globalThis.__mountlyMcpWidget__ = {
         mount(container){ container.textContent = "mode:" + mode; },
         unmount(container){ container.textContent = ""; },
       };`,
      "utf8",
    );

    await build({
      root: dir,
      logLevel: "silent",
      plugins: [
        mountlyMcpWidget({
          entry: join(dir, "src/widget.ts"),
          uri: "ui://weather-server/dashboard",
          name: "weather_dashboard",
          bridgeRuntimePath: join(dir, "bridge.js"),
        }),
      ],
    } as never);

    story.then("the built bundle has no reference to `process`, which is undefined in an iframe");
    const html = readFileSync(join(dir, "dist/weather_dashboard.html"), "utf8");
    expect(html).not.toContain("process.env");
    expect(html).toContain("production");

    rmSync(dir, { recursive: true });
  });

  it("bundles dependencies in rather than leaving them as globals", async ({ task }) => {
    story.init(task, { tags: ["mcp", "vite", "multi-view"] });
    const dir = makeProject();

    story.given("a View importing a package from node_modules");
    // A real bare specifier resolved from node_modules, so the test exercises
    // the same resolution path a framework takes.
    mkdirSync(join(dir, "node_modules/tiny-dep"), { recursive: true });
    writeFileSync(
      join(dir, "node_modules/tiny-dep/package.json"),
      JSON.stringify({ name: "tiny-dep", version: "1.0.0", main: "index.js", type: "module" }),
      "utf8",
    );
    writeFileSync(
      join(dir, "node_modules/tiny-dep/index.js"),
      "export function tinyDepMarker() { return 'from-the-dependency'; }",
      "utf8",
    );
    writeFileSync(
      join(dir, "src/widget.ts"),
      `import { tinyDepMarker } from "tiny-dep";
       globalThis.__mountlyMcpWidget__ = {
         mount(container){ container.textContent = tinyDepMarker(); },
         unmount(container){ container.textContent = ""; },
       };`,
      "utf8",
    );

    story.when("it is built through the multi-View builder");
    // Deliberately the builder path, not `build()`. A Vite custom environment
    // defaults to a server consumer and externalizes node_modules, while the
    // default client environment bundles them — so the legacy single-View path
    // passes whether or not the plugin sets `consumer`, and a test written
    // against it cannot fail when that setting is removed.
    const packageRequire = createRequire(join(process.cwd(), "packages/mcp-apps/package.json"));
    const { createBuilder } = await import(pathToFileURL(packageRequire.resolve("vite")).href);
    const builder = await createBuilder(
      {
        root: dir,
        logLevel: "silent",
        plugins: [
          mountlyMcpWidget({
            apps: [
              {
                entry: join(dir, "src/widget.ts"),
                uri: "ui://weather-server/dashboard",
                name: "weather_dashboard",
                bridgeRuntimePath: join(dir, "bridge.js"),
              },
            ],
          }),
        ],
      },
      false,
    );
    await builder.buildApp();

    story.then("the dependency's code is inlined, not referenced through a global");
    // A `ui://` resource is one inlined <script> with no import graph and no
    // loader, so anything left external is a bare global the View dies on.
    const html = readFileSync(join(dir, "dist/weather_dashboard.html"), "utf8");
    expect(html).toContain("from-the-dependency");
    expect(html).not.toMatch(/require\(["']tiny-dep["']\)|from\s*["']tiny-dep["']/);

    rmSync(dir, { recursive: true });
  });

  it("rejects a non-ui:// scheme at config time, before any build runs", ({ task }) => {
    story.init(task, { tags: ["mcp", "vite"] });

    story.then("constructing the plugin throws, so the failure is instant");
    expect(() =>
      mountlyMcpWidget({
        entry: "src/widget.ts",
        uri: "https://example.com/dashboard",
        name: "weather_dashboard",
      }),
    ).toThrow(/must use the 'ui:\/\/' scheme/i);
  });

  it("builds independent Views and a canonical manifest from one plugin", async ({ task }) => {
    story.init(task, { tags: ["mcp", "vite", "multi-view"] });
    const dir = makeProject();
    writeFileSync(
      join(dir, "src/admin.ts"),
      `globalThis.__mountlyMcpWidget__ = { mount(container){ container.textContent = "admin"; }, unmount(){} };`,
      "utf8",
    );

    story.given("one Vite plugin declaring two independently identified Views");
    const packageRequire = createRequire(join(process.cwd(), "packages/mcp-apps/package.json"));
    const { createBuilder } = await import(pathToFileURL(packageRequire.resolve("vite")).href);
    const builder = await createBuilder(
      {
        root: dir,
        logLevel: "silent",
        plugins: [
          mountlyMcpWidget({
            apps: [
              {
                entry: join(dir, "src/widget.ts"),
                uri: "ui://weather-server/dashboard",
                name: "weather_dashboard",
                bridgeRuntimePath: join(dir, "bridge.js"),
              },
              {
                entry: join(dir, "src/admin.ts"),
                uri: "ui://weather-server/admin",
                name: "weather_admin",
                bridgeRuntimePath: join(dir, "bridge.js"),
              },
            ],
          }),
        ],
      },
      false,
    );

    story.when("the app builder runs every configured environment");
    await builder.buildApp();

    story.then("each View is self-contained and the manifest owns collection identity");
    expect(readFileSync(join(dir, "dist/weather_dashboard.html"), "utf8")).toContain(
      "built by vite",
    );
    expect(readFileSync(join(dir, "dist/weather_admin.html"), "utf8")).toContain("admin");
    const manifest = JSON.parse(
      readFileSync(join(dir, "dist/mountly-mcp.manifest.json"), "utf8"),
    ) as { formatVersion: number; apps: Array<{ name: string; uri: string; html: string }> };
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.apps.map(({ name, uri, html }) => ({ name, uri, html }))).toEqual([
      {
        name: "weather_dashboard",
        uri: "ui://weather-server/dashboard",
        html: "weather_dashboard.html",
      },
      { name: "weather_admin", uri: "ui://weather-server/admin", html: "weather_admin.html" },
    ]);

    rmSync(dir, { recursive: true });
  });

  it("rejects duplicate developer keys and protocol identities immediately", ({ task }) => {
    story.init(task, { tags: ["mcp", "vite", "identity"] });
    const app = { entry: "src/widget.ts", uri: "ui://weather/dashboard", name: "weather" };
    expect(() => mountlyMcpWidget({ apps: [app, { ...app, uri: "ui://weather/admin" }] })).toThrow(
      /duplicate app name 'weather'/,
    );
    expect(() => mountlyMcpWidget({ apps: [app, { ...app, name: "admin" }] })).toThrow(
      /duplicate app uri 'ui:\/\/weather\/dashboard'/,
    );
  });
});
