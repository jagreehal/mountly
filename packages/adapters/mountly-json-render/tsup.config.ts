import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/server.ts"],
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
    "mountly",
    "mountly-mcp",
    "mountly-mcp-react",
    "mountly-react",
  ],
});
