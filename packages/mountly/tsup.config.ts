import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/core.ts",
    "src/analytics-entry.ts",
    "src/prefetch-entry.ts",
    "src/plugins-entry.ts",
    "src/devtools-entry.ts",
    "src/overlays-entry.ts",
    "src/runtime-entry.ts",
    "src/host-entry.ts",
  ],
  format: ["esm"],
  dts: true,
  clean: true,
  minify: true,
  sourcemap: true,
  target: "es2020",
});
