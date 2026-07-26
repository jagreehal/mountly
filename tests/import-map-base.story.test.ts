import { story } from "executable-stories-vitest";
import { describe, expect, it } from "vite-plus/test";
import { applyBaseToImportUrl } from "../packages/mountly-vite-plugin/src/host.ts";

// Import maps resolve against the document, not the bundler, so a host served
// from a sub-path has to carry Vite's `base` in the URLs it emits. Shipping
// this wrong 404s every remote — which is exactly what happened to the hosted
// examples on GitHub Pages (/mountly).
describe("applyBaseToImportUrl", () => {
  it("prefixes site-relative URLs with the deploy base", ({ task }) => {
    story.init(task);
    story.given("a host deployed under /mountly/examples/vite-host-import/");
    const base = "/mountly/examples/vite-host-import/";

    story.when("the import map is emitted for a production build");
    story.then("root-absolute and dot-relative remote URLs both gain the base");
    expect(applyBaseToImportUrl("/remote/dist/Badge.js", base)).toBe(
      "/mountly/examples/vite-host-import/remote/dist/Badge.js",
    );
    expect(applyBaseToImportUrl("./remote/dist/Badge.js", base)).toBe(
      "/mountly/examples/vite-host-import/remote/dist/Badge.js",
    );
  });

  it("leaves URLs alone when there is nothing to prefix", ({ task }) => {
    story.init(task);
    story.given("the default base, or a remote already addressed absolutely");

    story.then("a root base is a no-op");
    expect(applyBaseToImportUrl("/remote/dist/Badge.js", "/")).toBe("/remote/dist/Badge.js");

    story.then("absolute, protocol-relative and data URLs pass through untouched");
    expect(applyBaseToImportUrl("https://cdn.example.com/x.js", "/mountly/")).toBe(
      "https://cdn.example.com/x.js",
    );
    expect(applyBaseToImportUrl("//cdn.example.com/x.js", "/mountly/")).toBe(
      "//cdn.example.com/x.js",
    );
    expect(applyBaseToImportUrl("data:text/javascript,void%200", "/mountly/")).toBe(
      "data:text/javascript,void%200",
    );
  });
});
