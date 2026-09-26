import { fileURLToPath } from "node:url";
import { defineElementsConfig } from "mountly-vite-plugin";

// A container team: its panel renders other teams' widgets through <slot>s,
// which project only in a shadow root.
export default defineElementsConfig({
  prefix: "cases",
  elements: "src/*.tsx",
  root: fileURLToPath(new URL(".", import.meta.url)),
  peer: true,
  shadow: true,
});
