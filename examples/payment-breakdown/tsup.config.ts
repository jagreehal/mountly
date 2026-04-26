import { defineConfig, type Options } from "tsup";

const base: Omit<Options, "entry" | "dts"> = {
  format: ["esm"],
  minify: true,
  sourcemap: true,
  target: "es2020",
  define: {
    "process.env.NODE_ENV": "\"production\"",
  },
  loader: { ".css": "text" },
};

/*
 * Two outputs from one source:
 *   dist/index.js  — React + React DOM inlined (~148 KB gz). Drop-on-any-page.
 *   dist/peer.js   — React + React DOM external (~5 KB gz). Host supplies React
 *                    via an import map; three widgets share one React copy.
 * Widget authors don't configure anything — both are emitted from the same src.
 */
export default defineConfig([
  {
    ...base,
    entry: { index: "src/index.ts" },
    dts: true,
    clean: true,
    noExternal: ["react", "react-dom", "mountly-react"],
  },
  {
    ...base,
    entry: { peer: "src/index.ts" },
    dts: false,
    clean: false,
    external: ["react", "react-dom", "react-dom/client"],
  },
]);
