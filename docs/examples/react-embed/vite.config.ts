import { fileURLToPath } from "node:url";
import { defineElementsConfig } from "mountly-vite-plugin";

export default {
  ...defineElementsConfig({ prefix: "acme", elements: "src/elements/*.tsx" }),
  root: fileURLToPath(new URL(".", import.meta.url)),
};
