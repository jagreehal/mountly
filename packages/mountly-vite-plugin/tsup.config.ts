import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: { resolve: ["mountly-manifest"] },
  clean: true,
  external: ["vite", "mountly-manifest", "typescript"],
});
