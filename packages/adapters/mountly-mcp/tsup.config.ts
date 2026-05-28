import { defineConfig } from "tsup";

export default defineConfig([
  // Main library entries — ESM with externalized imports
  {
    entry: [
      "src/index.ts",
      "src/build/index.ts",
      "src/bridge/index.ts",
    ],
    format: ["esm"],
    dts: true,
    clean: true,
    minify: false,
    sourcemap: true,
    target: "es2020",
  },
  // Iframe entry — fully bundled IIFE so it can be inlined in <script> tags
  {
    entry: { "iframe-entry": "src/bridge/iframe-entry.ts" },
    outDir: "dist/bridge",
    format: ["iife"],
    dts: false,
    clean: false,
    minify: false,
    sourcemap: false,
    target: "es2020",
    bundle: true,
    noExternal: [/.*/],
    outExtension() {
      return { js: ".js" };
    },
  },
]);
