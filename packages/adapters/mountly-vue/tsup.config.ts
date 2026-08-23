import { defineConfig } from "tsup";

// Declarations come from `tsc` in the build script: TypeScript 7 removed the
// classic compiler API that tsup's dts step (rollup-plugin-dts) needs.

// `mountly/shadow` and `mountly/assets` are bundled in, not externalised: a
// widget built with this adapter then has zero bare mountly specifiers, so a
// plain-HTML host needs no import map at all. `mountly/adapter` is types only
// and erases at build time.
export default defineConfig({
  noExternal: [/^mountly\/(shadow|assets)$/],
  entry: ["src/index.ts"],
  format: ["esm"],
  clean: true,
  external: ["vue", "mountly"],
});
