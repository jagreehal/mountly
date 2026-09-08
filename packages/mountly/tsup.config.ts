import { defineConfig } from "tsup";

// Declarations come from `tsc` in the build script: TypeScript 7 removed the
// classic compiler API that tsup's dts step (rollup-plugin-dts) needs.

const shared = {
  format: ["esm"] as "esm"[],
  minify: true,
  sourcemap: true,
  target: "es2020",
};

export default defineConfig([
  {
    // The CDN drop-in ships as one self-contained file: no shared chunk, so a
    // page pays one request instead of a two-deep module waterfall.
    ...shared,
    entry: ["src/auto.ts"],
    splitting: false,
    clean: true,
  },
  {
    ...shared,
    clean: false,
    entry: [
      "src/index.ts",
      "src/core.ts",
      "src/feature.ts",
      "src/triggers.ts",
      "src/gestures.ts",
      "src/attach.ts",
      "src/elements.ts",
      "src/embed.ts",
      "src/bundle.ts",
      "src/cache.ts",
      "src/mount.ts",
      "src/shadow.ts",
      "src/iframe.ts",
      "src/iframe-child.ts",
      "src/assets.ts",
      "src/adapter.ts",
      "src/analytics.ts",
      "src/prefetch.ts",
      "src/devtools.ts",
      "src/positioning.ts",
      "src/data-source.ts",
      "src/url-state.ts",
      "src/router.ts",
      "src/frame-channel.ts",
      "src/frame-overlay.ts",
      "src/frame-history.ts",
      "src/placeholder.ts",
      "src/bus.ts",
      "src/contracts.ts",
      "src/test-utils.ts",
      "src/runtime.ts",
    ],
  },
]);
