import { defineConfig } from "tsup";

// Declarations come from `tsc` in the build script: TypeScript 7 removed the
// classic compiler API that tsup's dts step (rollup-plugin-dts) needs.

export default defineConfig([
  // Main library entries — ESM with externalized imports
  {
    entry: [
      "src/index.ts",
      "src/artifact/index.ts",
      "src/build/index.ts",
      "src/bridge/index.ts",
      "src/react/index.ts",
      "src/vue/index.ts",
      "src/svelte/index.ts",
      "src/vite/index.ts",
      "src/dev/index.ts",
      "src/sandbox/index.ts",
      "src/testing/index.ts",
      "src/cli.ts",
      "src/server/index.ts",
      "src/json-render/index.ts",
      "src/json-render/server.ts",
    ],
    format: ["esm"],
    clean: true,
    minify: false,
    sourcemap: true,
    target: "es2020",
    external: [
      "react",
      "react-dom",
      "ai",
      "@json-render/core",
      "@json-render/react",
      "@modelcontextprotocol/sdk",
      "mountly",
      "mountly-react",
      "mountly-vue",
      "mountly-svelte",
      "vue",
      "svelte",
      "vite",
    ],
  },
  // Dev host entry — the browser host uses the official AppBridge rather than
  // a handwritten protocol dispatcher.
  {
    entry: { "host-entry": "src/dev/host-entry.ts", "sandbox-entry": "src/dev/sandbox-entry.ts" },
    outDir: "dist/dev",
    format: ["iife"],
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
  // Iframe entry — fully bundled IIFE so it can be inlined in <script> tags
  {
    entry: { "iframe-entry": "src/bridge/iframe-entry.ts" },
    outDir: "dist/bridge",
    format: ["iife"],
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
