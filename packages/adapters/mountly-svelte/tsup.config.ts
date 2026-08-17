import { defineConfig } from "tsup";

// Declarations come from `tsc` in the build script: TypeScript 7 removed the
// classic compiler API that tsup's dts step (rollup-plugin-dts) needs.

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  clean: true,
  minify: true,
  external: ["mountly", "svelte"],
});
