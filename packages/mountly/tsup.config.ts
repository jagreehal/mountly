import { defineConfig } from "tsup";

// Declarations come from `tsc` in the build script: TypeScript 7 removed the
// classic compiler API that tsup's dts step (rollup-plugin-dts) needs.

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/triggers.ts",
    "src/gestures.ts",
    "src/attach.ts",
    "src/elements.ts",
    "src/island.ts",
    "src/host.ts",
    "src/host-entry.ts",
    "src/bundle.ts",
    "src/cache.ts",
    "src/mount.ts",
    "src/shadow.ts",
    "src/assets.ts",
    "src/adapter.ts",
    "src/analytics.ts",
    "src/prefetch.ts",
    "src/devtools.ts",
    "src/positioning.ts",
    "src/data-source.ts",
    "src/url-state.ts",
    "src/bus.ts",
    "src/contracts.ts",
    "src/test-utils.ts",
    "src/runtime.ts",
  ],
  format: ["esm"],
  clean: true,
  minify: true,
  sourcemap: true,
  target: "es2020",
});
