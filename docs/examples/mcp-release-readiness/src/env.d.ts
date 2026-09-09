/// <reference types="vite/client" />

// This shim is what `tsc --noEmit` sees instead of the real SFC types.
// `vue-tsc` would check inside each `.vue` file, but it drives TypeScript's
// classic `tsc` entry, which TypeScript 7 no longer exports. Restore
// `"typecheck": "vue-tsc --noEmit"` and delete this once vue-tsc supports the
// native compiler.
declare module "*.vue" {
  import type { DefineComponent } from "vue";

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
