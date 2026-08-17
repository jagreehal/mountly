// The component suite mounts real .vue single-file components; TypeScript needs
// the same shim the example projects carry.
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
