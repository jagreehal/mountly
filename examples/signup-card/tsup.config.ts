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
