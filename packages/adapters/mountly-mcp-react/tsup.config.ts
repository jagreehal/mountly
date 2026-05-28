import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  minify: false,
  sourcemap: true,
  target: "es2020",
  external: ["react", "react-dom", "mountly", "mountly-mcp", "mountly-react"],
});
