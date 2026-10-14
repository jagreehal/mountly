import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { story } from "executable-stories-vitest";
import { build } from "vite-plus";
import { describe, expect, it } from "vite-plus/test";
import { createMcpAppServer } from "../packages/mcp-apps/src/server/index";
import { mountlyMcpViews } from "../packages/mcp-apps/src/vite/index";
import type { McpAppSource } from "../packages/mcp-apps/src/artifact/index";

describe("Views for a server with no filesystem", () => {
  it("builds an importable views module a Worker can register directly", async ({ task }) => {
    story.init(task, { tags: ["mcp", "vite", "server", "workers"] });
    const dir = mkdtempSync(join(tmpdir(), "mountly-mcp-module-"));
    try {
      mkdirSync(join(dir, "src"));
      writeFileSync(
        join(dir, "src/view.ts"),
        `globalThis.__mountlyMcpView__ = { mount(c){ c.textContent = "from module"; }, unmount(){} };`,
      );
      writeFileSync(join(dir, "bridge.js"), "");

      story.given("a build with module: true");
      await build({
        root: dir,
        logLevel: "silent",
        plugins: [
          mountlyMcpViews({
            module: true,
            apps: [
              {
                entry: join(dir, "src/view.ts"),
                uri: "ui://lookup/view",
                name: "lookup",
                bridgeRuntimePath: join(dir, "bridge.js"),
              },
            ],
          }),
        ],
        builder: {},
      } as never);

      story.then("the module exports each View with its HTML, and is typed");
      const views = (
        (await import(pathToFileURL(join(dir, "dist/mountly-mcp.views.js")).href)) as {
          default: McpAppSource[];
        }
      ).default;
      expect(views.map(({ name, uri }) => ({ name, uri }))).toEqual([
        { name: "lookup", uri: "ui://lookup/view" },
      ]);
      expect(views[0]?.html).toContain("from module");
      expect(readFileSync(join(dir, "dist/mountly-mcp.views.d.ts"), "utf8")).toContain(
        "ReadonlyArray<McpAppSource>",
      );

      story.when("the files are deleted, so only the imported module remains");
      rmSync(join(dir, "dist"), { recursive: true });
      const server = createMcpAppServer({
        name: "lookup",
        version: "1.0.0",
        views: views.map((artifact) => ({ artifact })),
        tools: [
          {
            name: "lookup",
            resourceUri: "ui://lookup/view",
            handler: async () => ({ structuredContent: { ok: true } }),
          },
        ],
      });
      const { client } = await server.connectInProcess();

      story.then("the server still serves the View, read from memory");
      const read = await client.readResource({ uri: "ui://lookup/view" });
      expect((read.contents[0] as { text: string }).text).toContain("from module");
      await server.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("rejects an in-memory View whose identity disagrees with its declaration", async ({
    task,
  }) => {
    story.init(task, { tags: ["mcp", "server", "workers"] });
    const declaration = { name: "a", uri: "ui://a/view" } as McpAppSource["declaration"];
    const server = createMcpAppServer({
      name: "x",
      version: "1",
      views: [{ artifact: { name: "a", uri: "ui://a/view", declaration, html: "<p>no doctype" } }],
    });
    await expect(server.connectInProcess()).rejects.toThrow(/doctype/);
  });
});

describe("mountly-mcp/server on Cloudflare Workers", () => {
  it("resolves, for the workerd condition, to an entry with no Node builtins anywhere", async ({
    task,
  }) => {
    story.init(task, { tags: ["mcp", "server", "workers"] });
    const pkg = JSON.parse(readFileSync("packages/mcp-apps/package.json", "utf8"));
    expect(pkg.exports["./server"].workerd.import).toBe("./dist/server/workers.js");

    // Bundlers such as wrangler's esbuild follow dynamic imports too, so both count.
    const { dirname, resolve } = await import("node:path");
    const seen = new Set<string>();
    const builtins: string[] = [];
    const walk = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const code = readFileSync(file, "utf8");
      for (const [, spec] of code.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
        if (!spec) continue;
        if (spec.startsWith("node:")) builtins.push(`${spec} in ${file}`);
        else if (spec.startsWith(".")) walk(resolve(dirname(file), spec.replace(/\.js$/, ".ts")));
      }
    };
    walk(resolve("packages/mcp-apps/src/server/workers.ts"));
    expect(builtins).toEqual([]);
    expect([...seen].some((file) => file.endsWith("server/core.ts"))).toBe(true);
  });
});
