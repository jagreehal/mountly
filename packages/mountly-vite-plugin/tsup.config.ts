import { defineConfig } from "tsup";

// Declarations come from `tsc` in the build script: TypeScript 7 removed the
// classic compiler API that tsup's dts step (rollup-plugin-dts) needs.

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  clean: true,
  // `typescript` is matched by pattern so its subpaths stay external too —
  // `typescript/unstable/sync` is imported dynamically and must not be bundled.
  external: ["vite", "mountly-manifest", /^typescript(\/|$)/],
});
