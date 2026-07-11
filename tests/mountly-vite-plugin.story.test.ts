import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { story } from "executable-stories-vitest";
import { build } from "vite-plus";
import { describe, expect, it } from "vite-plus/test";
import {
  defineMountlyWidgetConfig,
  mountlyHostPlugin,
} from "../packages/mountly-vite-plugin/src/index.ts";
import { manifestToImportMap, parseManifest } from "../packages/mountly-manifest/src/index.js";

const fixtureDir = join(import.meta.dirname, "fixtures", "vite-widget");

// mountlyHostPlugin returns Vite's `Plugin`, where lifecycle hooks are `ObjectHook` unions.
// Cast to plain callables so these tests can invoke the hooks directly.
type CallableHostPlugin = {
  name: string;
  config?: (config: object, env: object) => unknown;
  configResolved?: (config: object) => void | Promise<void>;
  buildStart?: (this: { addWatchFile(file: string): void }) => void | Promise<void>;
};

describe("mountly-vite-plugin", () => {
  it("builds index.js and peer.js with React externalized in peer build", async ({ task }) => {
    story.init(task);
    const outDir = join(fixtureDir, "dist");
    rmSync(outDir, { recursive: true, force: true });

    story.given("the vite-widget fixture in tests/fixtures");
    story.when("defineMountlyWidgetConfig builds the widget");
    const configs = defineMountlyWidgetConfig({
      framework: "react",
      entry: join(fixtureDir, "src/index.ts"),
      outDir,
      minify: false,
      sourcemap: false,
    });

    for (const config of configs) {
      await build(config as never);
    }

    const indexJs = readFileSync(join(outDir, "index.js"), "utf8");
    const peerJs = readFileSync(join(outDir, "peer.js"), "utf8");

    story.then("both outputs exist and peer build keeps React external");
    expect(indexJs.length).toBeGreaterThan(peerJs.length);
    expect(peerJs).toMatch(/from\s+"react"/);
    expect(indexJs).not.toMatch(/from\s+"react"/);
  });

  it("builds subpath expose entries and manifest fragment", async ({ task }) => {
    story.init(task);
    const outDir = join(fixtureDir, "dist-exposes");
    rmSync(outDir, { recursive: true, force: true });

    const configs = defineMountlyWidgetConfig({
      framework: "react",
      entry: join(fixtureDir, "src/index.ts"),
      outDir,
      minify: false,
      sourcemap: false,
      verticalId: "vite-widget",
      featureExport: "widget",
      exposes: {
        "./Badge": join(fixtureDir, "src/Badge.tsx"),
      },
    });

    for (const config of configs) {
      await build(config as never);
    }

    expect(readFileSync(join(outDir, "Badge.js"), "utf8")).toMatch(/from\s+"react"/);
    const fragment = JSON.parse(
      readFileSync(join(outDir, "mountly.manifest.fragment.json"), "utf8"),
    );
    expect(fragment.version).toBe("2");
    expect(fragment.verticals[0].exports["./Badge"]).toBe("./Badge.js");
    expect(readFileSync(join(outDir, "types", "index.d.ts"), "utf8")).toContain(
      "declare const _default",
    );
    expect(readFileSync(join(outDir, "types", "Badge.d.ts"), "utf8")).toContain("Badge");
    expect(fragment.verticals[0].types.declaration).toBe("./types/index.d.ts");
    expect(fragment.verticals[0].types.module).toEqual(["widget"]);
    expect(fragment.verticals[0].types.exports["./Badge"]).toEqual({
      declaration: "./types/Badge.d.ts",
      names: ["Badge"],
    });
  });

  it("mountlyHostPlugin externalizes manifest remotes", ({ task }) => {
    story.init(task);
    const manifestPath = join(fixtureDir, "manifest.json");
    const plugin = mountlyHostPlugin({ manifest: manifestPath, injectImportMap: false });
    const manifest = parseManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
    const imports = manifestToImportMap(manifest);
    story.then("manifest maps widget and subpath remotes");
    expect(imports["vite-widget"]).toBe("/dist/peer.js");
    expect(imports["vite-widget/Badge"]).toBe("/dist/Badge.js");
    expect(plugin.name).toBe("mountly:host");
  });

  it("mountlyHostPlugin can auto-compose from remote fragments", async ({ task }) => {
    story.init(task);
    const outDir = join(fixtureDir, "dist-compose");
    rmSync(outDir, { recursive: true, force: true });

    const configs = defineMountlyWidgetConfig({
      framework: "react",
      entry: join(fixtureDir, "src/index.ts"),
      outDir,
      minify: false,
      sourcemap: false,
      verticalId: "vite-widget",
      featureExport: "widget",
      exposes: {
        "./Badge": join(fixtureDir, "src/Badge.tsx"),
      },
    });

    for (const config of configs) {
      await build(config as never);
    }

    const fragmentPath = join(outDir, "mountly.manifest.fragment.json");
    const plugin = mountlyHostPlugin({
      verticals: [{ fragment: fragmentPath }],
      injectImportMap: false,
    }) as unknown as CallableHostPlugin;
    const config = await plugin.config?.(
      {},
      {
        command: "serve",
        mode: "development",
        isPreview: false,
        isSsrBuild: false,
      },
    );

    story.then("host plugin infers remote specifiers from the built fragment");
    expect(config).toBeTruthy();
    expect((config as { optimizeDeps?: { exclude?: string[] } }).optimizeDeps?.exclude).toEqual(
      expect.arrayContaining(["vite-widget", "vite-widget/Badge"]),
    );
  });

  it("mountlyHostPlugin fails when fragments are missing", async ({ task }) => {
    story.init(task);
    story.when("a host points at a fragment that has not been built");
    const plugin = mountlyHostPlugin({
      verticals: [{ fragment: "./missing/mountly.manifest.fragment.json" }],
      injectImportMap: false,
    }) as unknown as CallableHostPlugin;
    story.then("config fails before the dev server starts");
    await expect(
      (async () =>
        plugin.config?.(
          {},
          {
            command: "serve",
            mode: "development",
            isPreview: false,
            isSsrBuild: false,
          },
        ))(),
    ).rejects.toThrow(/fragment not found/);
  });

  it("mountlyHostPlugin generates typed remotes from fragments", async ({ task }) => {
    story.init(task);
    const exampleRoot = join(import.meta.dirname, "..", "docs", "examples", "vite-host-import");
    const fragmentPath = join(exampleRoot, "remote/dist/mountly.manifest.fragment.json");
    expect(existsSync(fragmentPath)).toBe(true);

    const plugin = mountlyHostPlugin({
      verticals: [{ fragment: "./remote/dist/mountly.manifest.fragment.json" }],
      injectImportMap: false,
    }) as unknown as CallableHostPlugin;
    await plugin.configResolved?.({ root: exampleRoot });
    await plugin.buildStart?.call({ addWatchFile() {} });

    story.then("host plugin writes declaration-backed remote modules");
    const generated = join(exampleRoot, "src", "mountly-remotes.d.ts");
    expect(existsSync(generated)).toBe(true);
    const dts = readFileSync(generated, "utf8");
    expect(dts).toContain('declare module "demo-widget/Badge"');
    expect(dts).toContain('export { Badge } from "./.mountly/');
    expect(plugin.name).toBe("mountly:host");
  });
});
