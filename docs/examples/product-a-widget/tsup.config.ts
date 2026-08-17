import { defineConfig, type Options } from "tsup";

// Declarations come from `tsc` in the build script: TypeScript 7 removed the
// classic compiler API that tsup's dts step (rollup-plugin-dts) needs.

const base: Omit<Options, "entry"> = {
  format: ["esm"],
  minify: true,
  sourcemap: true,
  target: "es2020",
  define: {
    "process.env.NODE_ENV": '"production"',
  },
};

export default defineConfig([
  {
    ...base,
    entry: { index: "src/index.ts" },
    clean: true,
    noExternal: ["react", "react-dom", "mountly-react"],
  },
  {
    ...base,
    entry: { peer: "src/index.ts" },
    clean: false,
    external: ["react", "react-dom", "react-dom/client"],
  },
]);
