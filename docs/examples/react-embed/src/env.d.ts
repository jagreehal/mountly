declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}

// Side-effect import: Vite emits the stylesheet, the module exports nothing.
declare module "*.css" {}
