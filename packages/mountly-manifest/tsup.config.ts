import { defineConfig } from "tsup";

// Declarations come from `tsc` in the build script: TypeScript 7 removed the
// classic compiler API that tsup's dts step (rollup-plugin-dts) needs.

export default defineConfig({
  entry: ["src/index.ts", "src/server.ts", "src/client.ts"],
  format: ["esm"],
  clean: true,
  noExternal: ["zod"],
  external: ["mountly", "mountly/elements", "mountly/runtime", "mountly/bus"],
});
