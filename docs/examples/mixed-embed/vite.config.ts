import { fileURLToPath } from "node:url";
import { defineElementsConfig } from "mountly-vite-plugin";

// No compiler plugins: the build brings whichever ones these files need.
export default defineElementsConfig({
  prefix: "acme",
  elements: "src/elements/*.{tsx,vue,svelte}",
  root: fileURLToPath(new URL(".", import.meta.url)),
});
