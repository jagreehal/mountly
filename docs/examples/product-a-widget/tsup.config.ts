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
    // Self-contained: mountly's own helpers come along too, so a host page
    // drops the file in and needs no import map.
    noExternal: ["react", "react-dom", "mountly-react", /^mountly\//],
  },
  {
    ...base,
    entry: { peer: "src/index.ts" },
    clean: false,
    external: ["react", "react-dom", "react-dom/client"],
  },
]);
