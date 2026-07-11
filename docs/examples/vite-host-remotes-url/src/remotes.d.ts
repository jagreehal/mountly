// Hand-written remote types for this example. In real use the host plugin generates
// `mountly-remotes.d.ts` from the remote's fetched fragment; that file is gitignored here
// because it would duplicate the vite-host-import example's `demo-widget` declaration.
declare module "demo-widget" {
  export const Badge: import("react").ComponentType;
  export const demoWidget: { id: string };
}
declare module "demo-widget/Badge" {
  export const Badge: import("react").ComponentType;
}
