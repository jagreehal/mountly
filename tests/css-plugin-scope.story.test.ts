import { describe, expect, it } from "vitest";
import { mountlyCssAsText } from "../packages/mountly-vite-plugin/src/index.ts";
type LoadablePlugin = { load?: unknown };

function getLoadHook(plugin: LoadablePlugin): (id: string) => unknown {
  if (typeof plugin.load === "function") return (plugin.load as (id: string) => unknown).bind(plugin);
  throw new Error("load hook is not a plain function");
}

describe("mountlyCssAsText include option", () => {
  it("does NOT transform CSS files outside the include pattern", () => {
    const plugin = mountlyCssAsText({ include: /widget\/.*\.css$/ });
    const load = getLoadHook(plugin);
    const result = load("/app/host/styles/main.css");
    expect(result).toBeNull();
  });

  it("DOES transform CSS files matching the include pattern", () => {
    const plugin = mountlyCssAsText({ include: /widget\/.*\.css$/ });
    const load = getLoadHook(plugin);
    // We can't actually read a file here, but the plugin should attempt to —
    // verifying the filter logic is enough. We test that load doesn't return null
    // for a matching path (it will throw because the file doesn't exist, which
    // proves it tried to transform).
    expect(() => load("/app/widget/styles.css")).toThrow("ENOENT");
  });

  it("transforms ALL CSS when no include option is given (backward compat)", () => {
    const plugin = mountlyCssAsText();
    const load = getLoadHook(plugin);
    // Should attempt to read — will throw because file doesn't exist
    expect(() => load("/app/any/file.css")).toThrow("ENOENT");
  });
});
