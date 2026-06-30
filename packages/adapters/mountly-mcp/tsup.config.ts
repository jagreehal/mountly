import { defineConfig } from "tsup";

export default defineConfig([
  // Main library entries — ESM with externalized imports
  {
    entry: [
      "src/index.ts",
      "src/build/index.ts",
      "src/bridge/index.ts",
      "src/react/index.ts",
      "src/server/index.ts",
      "src/json-render/index.ts",
      "src/json-render/server.ts",
    ],
    format: ["esm"],
    dts: true,
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
    ],
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
