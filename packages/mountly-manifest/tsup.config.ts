import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/server.ts", "src/client.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  noExternal: ["zod"],
  external: ["mountly", "mountly/elements", "mountly/runtime", "mountly/bus"],
});
