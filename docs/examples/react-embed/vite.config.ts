import tailwind from "@tailwindcss/vite";
import { mergeConfig } from "vite";
import { defineElementsConfig } from "mountly-vite-plugin";

// `defineElementsConfig` returns an ordinary Vite config, so anything else that
// is a Vite plugin composes with it. Tailwind needs nothing else to work here.
export default mergeConfig(
  defineElementsConfig({ prefix: "acme", elements: "src/elements/*.tsx" }),
  {
    plugins: [tailwind()],
  },
);
