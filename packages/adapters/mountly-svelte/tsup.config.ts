import { readFileSync } from "node:fs";
import { compileModule } from "svelte/compiler";
import { defineConfig } from "tsup";

// Declarations come from `tsc` in the build script: TypeScript 7 removed the
// classic compiler API that tsup's dts step (rollup-plugin-dts) needs.

/**
 * `.svelte.js` modules use runes, so the Svelte compiler has to see them —
 * esbuild alone would ship `$state(...)` as a call to a function that does not
 * exist. Compiling here means the emitted code matches the Svelte the adapter
 * is built against, exactly as a consumer's own plugin would produce.
 */
const svelteModules = {
  name: "svelte-module",
  setup(build: {
    onLoad(
      filter: { filter: RegExp },
      callback: (args: { path: string }) => { contents: string; loader: "js" },
    ): void;
  }) {
    build.onLoad({ filter: /\.svelte\.js$/ }, ({ path }) => ({
      contents: compileModule(readFileSync(path, "utf8"), {
        generate: "client",
        filename: path,
      }).js.code,
      loader: "js",
    }));
  },
};

// `mountly/shadow` and `mountly/assets` are bundled in, not externalised: a
// widget built with this adapter then has zero bare mountly specifiers, so a
// plain-HTML host needs no import map at all. `mountly/adapter` is types only
// and erases at build time.
export default defineConfig({
  noExternal: [/^mountly\/(shadow|assets)$/],
  entry: ["src/index.ts"],
  format: ["esm"],
  clean: true,
  minify: true,
  external: ["mountly", "svelte", "svelte/internal/client"],
  esbuildPlugins: [svelteModules],
});
